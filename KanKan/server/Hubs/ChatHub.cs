using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using WeChat.API.Models.DTOs.Chat;
using WeChat.API.Repositories.Interfaces;
using WeChat.API.Services.Interfaces;

namespace WeChat.API.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private const string AgentUserId = "user_ai_wa";
    private const string AgentDisplayName = "Wa";

    private readonly IChatRepository _chatRepository;
    private readonly IMessageRepository _messageRepository;
    private readonly IUserRepository _userRepository;
    private readonly IAgentService _agentService;
    private readonly ILogger<ChatHub> _logger;

    // Track online users: UserId -> ConnectionId
    private static readonly Dictionary<string, string> _onlineUsers = new();
    private static readonly object _lock = new();

    public ChatHub(
        IChatRepository chatRepository,
        IMessageRepository messageRepository,
        IUserRepository userRepository,
        IAgentService agentService,
        ILogger<ChatHub> logger)
    {
        _chatRepository = chatRepository;
        _messageRepository = messageRepository;
        _userRepository = userRepository;
        _agentService = agentService;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(userId))
        {
            lock (_lock)
            {
                _onlineUsers[userId] = Context.ConnectionId;
            }

            // Update user online status
            var user = await _userRepository.GetByIdAsync(userId);
            if (user != null)
            {
                user.IsOnline = true;
                user.LastSeen = DateTime.UtcNow;
                await _userRepository.UpdateAsync(user);
            }

            // Join all user's chat rooms
            var chats = await _chatRepository.GetUserChatsAsync(userId);
            foreach (var chat in chats)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, chat.Id);
            }

            // Notify contacts that user is online
            await Clients.Others.SendAsync("UserOnline", userId);

            _logger.LogInformation("User {UserId} connected with connection {ConnectionId}", userId, Context.ConnectionId);
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!string.IsNullOrEmpty(userId))
        {
            lock (_lock)
            {
                _onlineUsers.Remove(userId);
            }

            // Update user offline status
            var user = await _userRepository.GetByIdAsync(userId);
            if (user != null)
            {
                user.IsOnline = false;
                user.LastSeen = DateTime.UtcNow;
                await _userRepository.UpdateAsync(user);
            }

            // Notify contacts that user is offline
            await Clients.Others.SendAsync("UserOffline", userId);

            _logger.LogInformation("User {UserId} disconnected", userId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinChat(string chatId)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userId))
            return;

        // Verify user is a participant
        var chat = await _chatRepository.GetByIdAsync(chatId);
        if (chat == null || !chat.Participants.Any(p => p.UserId == userId))
        {
            await Clients.Caller.SendAsync("Error", "You are not a member of this chat");
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, chatId);
        _logger.LogInformation("User {UserId} joined chat {ChatId}", userId, chatId);
    }

    public async Task LeaveChat(string chatId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, chatId);

        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        _logger.LogInformation("User {UserId} left chat {ChatId}", userId, chatId);
    }

    public async Task SendMessage(SendMessageDto message)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userName = Context.User?.FindFirst(ClaimTypes.Name)?.Value;

        if (string.IsNullOrEmpty(userId))
            return;

        // Verify user is a participant
        var chat = await _chatRepository.GetByIdAsync(message.ChatId);
        if (chat == null || !chat.Participants.Any(p => p.UserId == userId))
        {
            await Clients.Caller.SendAsync("Error", "You are not a member of this chat");
            return;
        }

        // Get user for avatar
        var user = await _userRepository.GetByIdAsync(userId);

        // Create message entity
        var newMessage = new Models.Entities.Message
        {
            Id = $"msg_{Guid.NewGuid()}",
            ChatId = message.ChatId,
            SenderId = userId,
            SenderName = userName ?? "Unknown",
            SenderAvatar = user?.AvatarUrl ?? "",
            MessageType = message.MessageType ?? "text",
            Content = new Models.Entities.MessageContent
            {
                Text = message.Text,
                MediaUrl = message.MediaUrl,
                ThumbnailUrl = message.ThumbnailUrl,
                Duration = message.Duration,
                FileName = message.FileName,
                FileSize = message.FileSize
            },
            ReplyTo = message.ReplyTo,
            Timestamp = DateTime.UtcNow,
            DeliveredTo = new List<string>(),
            ReadBy = new List<string>(),
            Reactions = new Dictionary<string, string>(),
            IsDeleted = false
        };

        // Save to database
        await _messageRepository.CreateAsync(newMessage);

        // Update chat's last message
        chat.LastMessage = new Models.Entities.ChatLastMessage
        {
            Text = message.Text ?? GetMessagePreviewText(message.MessageType),
            SenderId = userId,
            SenderName = userName ?? "Unknown",
            MessageType = message.MessageType ?? "text",
            Timestamp = DateTime.UtcNow
        };
        chat.UpdatedAt = DateTime.UtcNow;
        await _chatRepository.UpdateAsync(chat);

        // Create response DTO
        var messageResponse = new MessageDto
        {
            Id = newMessage.Id,
            ChatId = newMessage.ChatId,
            SenderId = newMessage.SenderId,
            SenderName = newMessage.SenderName,
            SenderAvatar = newMessage.SenderAvatar,
            MessageType = newMessage.MessageType,
            Text = newMessage.Content.Text,
            MediaUrl = newMessage.Content.MediaUrl,
            ThumbnailUrl = newMessage.Content.ThumbnailUrl,
            Duration = newMessage.Content.Duration,
            FileName = newMessage.Content.FileName,
            FileSize = newMessage.Content.FileSize,
            ReplyTo = newMessage.ReplyTo,
            Timestamp = newMessage.Timestamp,
            DeliveredTo = newMessage.DeliveredTo,
            ReadBy = newMessage.ReadBy,
            Reactions = newMessage.Reactions
        };

        // Send to all participants in the chat
        await Clients.Group(message.ChatId).SendAsync("ReceiveMessage", messageResponse);

        _logger.LogInformation("Message sent to chat {ChatId} by user {UserId}", message.ChatId, userId);

        // Add participants based on @mentions (e.g., @carol)
        await TryAddMentionedParticipantsAsync(chat, newMessage, userId);

        // AI agent response if mentioned
        if (ShouldTriggerAgent(chat, newMessage))
        {
            await EnsureAgentParticipantAsync(chat);
            var agentMessageId = $"msg_{Guid.NewGuid()}";
            var agentAvatar = (await _userRepository.GetByIdAsync(AgentUserId))?.AvatarUrl ?? string.Empty;

            await Clients.Group(chat.Id).SendAsync("AgentMessageStart", new
            {
                id = agentMessageId,
                chatId = chat.Id,
                senderId = AgentUserId,
                senderName = AgentDisplayName,
                senderAvatar = agentAvatar,
                messageType = "text",
                text = "",
                timestamp = DateTime.UtcNow,
                deliveredTo = new List<string>(),
                readBy = new List<string>(),
                reactions = new Dictionary<string, string>(),
                isDeleted = false
            });

            var fullText = new StringBuilder();
            try
            {
                await foreach (var chunk in _agentService.StreamReplyAsync(chat.Id, await BuildAgentPromptAsync(newMessage), await BuildHistoryAsync(chat.Id)))
                {
                    fullText.Append(chunk);
                    await Clients.Group(chat.Id).SendAsync("AgentMessageChunk", chat.Id, agentMessageId, chunk);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Agent streaming failed for chat {ChatId}", chat.Id);
                fullText.Append("Sorry, I'm having trouble responding right now.");
            }

            var reply = fullText.ToString();
            if (!string.IsNullOrWhiteSpace(reply))
            {
                var agentMessage = new Models.Entities.Message
                {
                    Id = agentMessageId,
                    ChatId = chat.Id,
                    SenderId = AgentUserId,
                    SenderName = AgentDisplayName,
                    SenderAvatar = agentAvatar,
                    MessageType = "text",
                    Content = new Models.Entities.MessageContent { Text = reply },
                    Timestamp = DateTime.UtcNow,
                    DeliveredTo = new List<string>(),
                    ReadBy = new List<string>(),
                    Reactions = new Dictionary<string, string>(),
                    IsDeleted = false
                };

                await _messageRepository.CreateAsync(agentMessage);

                chat.LastMessage = new Models.Entities.ChatLastMessage
                {
                    Text = reply,
                    SenderId = AgentUserId,
                    SenderName = AgentDisplayName,
                    MessageType = "text",
                    Timestamp = DateTime.UtcNow
                };
                chat.UpdatedAt = DateTime.UtcNow;
                await _chatRepository.UpdateAsync(chat);

                await Clients.Group(chat.Id).SendAsync("AgentMessageComplete", chat.Id, agentMessageId, reply);
            }
        }
    }

    public async Task TypingIndicator(string chatId, bool isTyping)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userName = Context.User?.FindFirst(ClaimTypes.Name)?.Value;

        if (string.IsNullOrEmpty(userId))
            return;

        await Clients.OthersInGroup(chatId).SendAsync("UserTyping", chatId, userId, userName, isTyping);
    }

    public async Task DraftChanged(string chatId, string text)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var userName = Context.User?.FindFirst(ClaimTypes.Name)?.Value;

        if (string.IsNullOrEmpty(userId))
            return;

        await Clients.OthersInGroup(chatId).SendAsync("DraftChanged", chatId, userId, userName, text);
    }

    public async Task MessageDelivered(string chatId, string messageId)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userId))
            return;

        var message = await _messageRepository.GetByIdAsync(messageId, chatId);
        if (message != null && !message.DeliveredTo.Contains(userId))
        {
            message.DeliveredTo.Add(userId);
            await _messageRepository.UpdateAsync(message);

            await Clients.Group(chatId).SendAsync("MessageDelivered", chatId, messageId, userId);
        }
    }

    public async Task MessageRead(string chatId, string messageId)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userId))
            return;

        var message = await _messageRepository.GetByIdAsync(messageId, chatId);
        if (message != null && !message.ReadBy.Contains(userId))
        {
            message.ReadBy.Add(userId);
            await _messageRepository.UpdateAsync(message);

            await Clients.Group(chatId).SendAsync("MessageRead", chatId, messageId, userId);
        }
    }

    public async Task AddReaction(string chatId, string messageId, string emoji)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userId))
            return;

        var message = await _messageRepository.GetByIdAsync(messageId, chatId);
        if (message != null)
        {
            message.Reactions[userId] = emoji;
            await _messageRepository.UpdateAsync(message);

            await Clients.Group(chatId).SendAsync("ReactionAdded", messageId, userId, emoji);
        }
    }

    public async Task RemoveReaction(string chatId, string messageId)
    {
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userId))
            return;

        var message = await _messageRepository.GetByIdAsync(messageId, chatId);
        if (message != null && message.Reactions.ContainsKey(userId))
        {
            message.Reactions.Remove(userId);
            await _messageRepository.UpdateAsync(message);

            await Clients.Group(chatId).SendAsync("ReactionRemoved", messageId, userId);
        }
    }

    // Helper to check if a user is online
    public static bool IsUserOnline(string userId)
    {
        lock (_lock)
        {
            return _onlineUsers.ContainsKey(userId);
        }
    }

    // Helper to get online users
    public static IEnumerable<string> GetOnlineUsers()
    {
        lock (_lock)
        {
            return _onlineUsers.Keys.ToList();
        }
    }

    private static bool ShouldTriggerAgent(Models.Entities.Chat chat, Models.Entities.Message message)
    {
        if (message.SenderId == AgentUserId)
            return false;

        if (IsDirectChatWithAgent(chat))
            return true;

        return message.MessageType == "text" &&
            !string.IsNullOrWhiteSpace(message.Content.Text) &&
            message.Content.Text.Contains("@@", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsDirectChatWithAgent(Models.Entities.Chat chat)
    {
        return chat.ChatType == "direct" &&
            chat.Participants.Count == 2 &&
            chat.Participants.Any(p => p.UserId == AgentUserId);
    }

    private async Task EnsureAgentParticipantAsync(Models.Entities.Chat chat)
    {
        if (chat.Participants.Any(p => p.UserId == AgentUserId))
            return;

        var agent = await _userRepository.GetByIdAsync(AgentUserId);
        if (agent == null)
            return;

        chat.Participants.Add(new Models.Entities.ChatParticipant
        {
            UserId = agent.Id,
            DisplayName = agent.DisplayName,
            AvatarUrl = agent.AvatarUrl ?? string.Empty,
            JoinedAt = DateTime.UtcNow
        });
        chat.UpdatedAt = DateTime.UtcNow;
        await _chatRepository.UpdateAsync(chat);
    }

    private static async Task<string> BuildAgentPromptAsync(Models.Entities.Message message)
    {
        var cleaned = message.Content.Text ?? string.Empty;
        cleaned = cleaned.Replace("@@", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (string.IsNullOrWhiteSpace(cleaned))
            cleaned = message.Content.Text ?? string.Empty;

        return await Task.FromResult(cleaned);
    }

    private async Task<List<(string SenderName, string Message)>> BuildHistoryAsync(string chatId)
    {
        var historyMessages = await _messageRepository.GetChatMessagesAsync(chatId, 10);
        return historyMessages
            .Where(m => !m.IsDeleted)
            .Select(m => (m.SenderName, m.Content.Text ?? string.Empty))
            .Where(h => !string.IsNullOrWhiteSpace(h.Item2))
            .ToList();
    }

    private static string GetMessagePreviewText(string? messageType)
    {
        return messageType switch
        {
            "image" => "[Image]",
            "video" => "[Video]",
            "voice" => "[Voice]",
            "file" => "[File]",
            _ => "[Message]"
        };
    }

    private async Task TryAddMentionedParticipantsAsync(Models.Entities.Chat chat, Models.Entities.Message message, string currentUserId)
    {
        if (message.MessageType != "text" || string.IsNullOrWhiteSpace(message.Content?.Text))
            return;

        var mentionNames = ExtractMentions(message.Content.Text).ToList();
        if (mentionNames.Count == 0)
            return;

        var addedUsers = new List<Models.Entities.User>();

        foreach (var mention in mentionNames)
        {
            var candidates = await _userRepository.SearchUsersAsync(mention, currentUserId, 10);
            var match = candidates.FirstOrDefault(u =>
                string.Equals(u.DisplayName, mention, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(u.WeChatId, mention, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(u.Email.Split('@')[0], mention, StringComparison.OrdinalIgnoreCase));

            var userToAdd = match ?? candidates.FirstOrDefault();
            if (userToAdd == null)
                continue;

            if (chat.Participants.Any(p => p.UserId == userToAdd.Id))
                continue;

            chat.Participants.Add(new Models.Entities.ChatParticipant
            {
                UserId = userToAdd.Id,
                DisplayName = userToAdd.DisplayName,
                AvatarUrl = userToAdd.AvatarUrl ?? string.Empty,
                JoinedAt = DateTime.UtcNow
            });
            addedUsers.Add(userToAdd);
        }

        if (addedUsers.Count == 0)
            return;

        if (chat.ChatType == "direct")
        {
            chat.ChatType = "group";
            if (chat.AdminIds == null || chat.AdminIds.Count == 0)
            {
                chat.AdminIds = new List<string> { currentUserId };
            }
            if (string.IsNullOrWhiteSpace(chat.GroupName))
            {
                chat.GroupName = BuildGroupName(chat.Participants);
            }
        }

        chat.UpdatedAt = DateTime.UtcNow;
        await _chatRepository.UpdateAsync(chat);

        await Clients.Group(chat.Id)
            .SendAsync("ChatUpdated", MapToChatDto(chat, currentUserId));

        await Clients.Group(chat.Id)
            .SendAsync("ParticipantsAdded", chat.Id, addedUsers.Select(u => u.Id).ToList());

        foreach (var user in addedUsers)
        {
            await Clients.User(user.Id)
                .SendAsync("ChatCreated", MapToChatDto(chat, user.Id));
        }
    }

    private static IEnumerable<string> ExtractMentions(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return Enumerable.Empty<string>();

        var matches = Regex.Matches(text, "@([A-Za-z0-9_.-]+)");
        return matches.Select(m => m.Groups[1].Value).Where(m => !string.IsNullOrWhiteSpace(m)).Distinct();
    }

    private static string BuildGroupName(IEnumerable<Models.Entities.ChatParticipant> participants)
    {
        var names = participants
            .Select(p => p.DisplayName)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .Take(3)
            .ToList();

        if (names.Count == 0)
            return "Group Chat";

        var baseName = string.Join(", ", names);
        if (participants.Count() > names.Count)
            baseName += " +";

        return baseName;
    }

    private ChatDto MapToChatDto(Models.Entities.Chat chat, string currentUserId)
    {
        string displayName = chat.GroupName ?? string.Empty;
        string displayAvatar = chat.GroupAvatar ?? string.Empty;

        if (chat.ChatType == "direct")
        {
            var otherParticipant = chat.Participants.FirstOrDefault(p => p.UserId != currentUserId);
            if (otherParticipant != null)
            {
                displayName = otherParticipant.DisplayName;
                displayAvatar = otherParticipant.AvatarUrl;
            }
        }

        return new ChatDto
        {
            Id = chat.Id,
            ChatType = chat.ChatType,
            Name = displayName,
            Avatar = displayAvatar,
            Participants = chat.Participants.Select(p => new ParticipantDto
            {
                UserId = p.UserId,
                DisplayName = p.DisplayName,
                AvatarUrl = p.AvatarUrl,
                IsOnline = IsUserOnline(p.UserId)
            }).ToList(),
            LastMessage = chat.LastMessage != null ? new LastMessageDto
            {
                Text = chat.LastMessage.Text,
                SenderId = chat.LastMessage.SenderId,
                SenderName = chat.LastMessage.SenderName,
                MessageType = chat.LastMessage.MessageType,
                Timestamp = chat.LastMessage.Timestamp
            } : null,
            UnreadCount = 0,
            CreatedAt = chat.CreatedAt,
            UpdatedAt = chat.UpdatedAt
        };
    }
}
