using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using KanKan.API.Domain;
using KanKan.API.Domain.Chat;
using KanKan.API.Hubs;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Interfaces;
using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Services.Implementations;

public class DomainGroupService : IDomainGroupService
{
    private const string DomainGroupChatIdPrefix = "domain_group_";

    private readonly IChatRepository _chatRepository;
    private readonly IChatUserRepository _chatUserRepository;
    private readonly IUserRepository _userRepository;
    private readonly IHubContext<ChatHub> _hubContext;
    private readonly ILogger<DomainGroupService> _logger;

    public DomainGroupService(
        IChatRepository chatRepository,
        IChatUserRepository chatUserRepository,
        IUserRepository userRepository,
        IHubContext<ChatHub> hubContext,
        ILogger<DomainGroupService> logger)
    {
        _chatRepository = chatRepository;
        _chatUserRepository = chatUserRepository;
        _userRepository = userRepository;
        _hubContext = hubContext;
        _logger = logger;
    }

    public async Task<Chat?> EnsureDomainGroupForUserAsync(UserEntity user)
    {
        var domain = ResolveDomain(user);
        if (string.IsNullOrWhiteSpace(domain))
            return null;

        var chatId = BuildDomainGroupChatId(domain);
        var chat = await _chatRepository.GetByIdAsync(chatId);
        var newlyAddedUserIds = new List<string>();

        if (chat == null)
        {
            var users = await _userRepository.GetUsersByDomainAsync(domain, excludeUserId: string.Empty, limit: 200);
            if (!users.Any(u => string.Equals(u.Id, user.Id, StringComparison.Ordinal)))
            {
                users.Add(user);
            }

            chat = new Chat
            {
                Id = chatId,
                Type = "chat",
                Domain = domain,
                ChatType = "group",
                GroupName = domain,
                GroupAvatar = null,
                AdminIds = new List<string>(),
                Participants = users
                    .GroupBy(u => u.Id, StringComparer.Ordinal)
                    .Select(g => BuildParticipant(g.First()))
                    .ToList(),
                LastMessage = null,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            newlyAddedUserIds.AddRange(chat.Participants.Select(p => p.UserId));

            try
            {
                chat = await _chatRepository.CreateAsync(chat);
            }
            catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
            {
                _logger.LogInformation(ex, "Domain group chat {ChatId} already exists; ensuring membership", chatId);
                chat = await _chatRepository.GetByIdAsync(chatId);
                newlyAddedUserIds.Clear();
            }
        }

        if (chat == null)
            return null;

        var existingParticipantIds = chat.Participants
            .Select(p => p.UserId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .ToHashSet(StringComparer.Ordinal);

        if (!existingParticipantIds.Contains(user.Id))
        {
            chat.Participants.Add(BuildParticipant(user));
            newlyAddedUserIds.Add(user.Id);
            chat.UpdatedAt = DateTime.UtcNow;
            chat = await _chatRepository.UpdateAsync(chat);
        }

        await UpsertChatUsersFromChatAsync(chat);
        await NotifyParticipantsAsync(chat, newlyAddedUserIds);

        return chat;
    }

    public string BuildDomainGroupChatId(string domain)
    {
        var normalizedDomain = DomainRules.Normalize(domain);
        return string.IsNullOrWhiteSpace(normalizedDomain)
            ? string.Empty
            : $"{DomainGroupChatIdPrefix}{normalizedDomain}";
    }

    public bool IsDomainGroupChatId(string chatId)
    {
        return !string.IsNullOrWhiteSpace(chatId)
            && chatId.StartsWith(DomainGroupChatIdPrefix, StringComparison.OrdinalIgnoreCase);
    }

    private static string ResolveDomain(UserEntity user)
    {
        var domain = string.IsNullOrWhiteSpace(user.Domain)
            ? DomainRules.GetDomain(user.Email)
            : user.Domain;

        return DomainRules.Normalize(domain);
    }

    private static ChatParticipant BuildParticipant(UserEntity user)
    {
        return new ChatParticipant
        {
            UserId = user.Id,
            DisplayName = user.DisplayName,
            AvatarUrl = user.AvatarUrl ?? string.Empty,
            Gender = user.Gender,
            JoinedAt = DateTime.UtcNow
        };
    }

    private static List<ChatParticipant> CloneParticipants(IEnumerable<ChatParticipant> participants)
    {
        return participants.Select(p => new ChatParticipant
        {
            UserId = p.UserId,
            DisplayName = p.DisplayName,
            AvatarUrl = p.AvatarUrl,
            Gender = p.Gender,
            JoinedAt = p.JoinedAt,
            IsHidden = p.IsHidden,
            ClearedAt = p.ClearedAt
        }).ToList();
    }

    private static ChatUser BuildChatUser(Chat chat, ChatParticipant participant)
    {
        return new ChatUser
        {
            Id = chat.Id,
            ChatId = chat.Id,
            UserId = participant.UserId,
            Domain = chat.Domain,
            ChatType = chat.ChatType,
            Participants = CloneParticipants(chat.Participants),
            GroupName = chat.GroupName,
            GroupAvatar = chat.GroupAvatar,
            AdminIds = chat.AdminIds ?? new List<string>(),
            LastMessage = chat.LastMessage,
            IsHidden = participant.IsHidden,
            ClearedAt = participant.ClearedAt,
            CreatedAt = chat.CreatedAt,
            UpdatedAt = chat.UpdatedAt
        };
    }

    private async Task UpsertChatUsersFromChatAsync(Chat chat)
    {
        var chatUsers = chat.Participants
            .Where(p => !string.IsNullOrWhiteSpace(p.UserId))
            .Select(p => BuildChatUser(chat, p))
            .ToList();

        await _chatUserRepository.UpsertManyAsync(chatUsers);
    }

    private async Task NotifyParticipantsAsync(Chat chat, IReadOnlyCollection<string> newlyAddedUserIds)
    {
        if (newlyAddedUserIds.Count == 0)
            return;

        try
        {
            var newlyAdded = newlyAddedUserIds.ToHashSet(StringComparer.Ordinal);
            foreach (var participant in chat.Participants)
            {
                if (newlyAdded.Contains(participant.UserId))
                {
                    await _hubContext.Clients.User(participant.UserId)
                        .SendAsync("ChatCreated", ChatDomain.ToChatDto(chat, participant.UserId, ChatHub.IsUserOnline));
                }
                else
                {
                    await _hubContext.Clients.User(participant.UserId)
                        .SendAsync("ChatUpdated", ChatDomain.ToChatDto(chat, participant.UserId, ChatHub.IsUserOnline));
                    await _hubContext.Clients.User(participant.UserId)
                        .SendAsync("ParticipantsAdded", chat.Id, newlyAddedUserIds);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send domain group notifications for chat {ChatId}", chat.Id);
        }
    }
}
