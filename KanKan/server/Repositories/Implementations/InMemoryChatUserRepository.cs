using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

/// <summary>
/// In-memory implementation of IChatUserRepository for development/testing without MongoDB
/// </summary>
public class InMemoryChatUserRepository : IChatUserRepository
{
    private static readonly Dictionary<string, Dictionary<string, ChatUser>> _chatUsers = new();
    private static readonly object _lock = new();

    public Task<List<ChatUser>> GetUserChatsAsync(string userId, bool includeHidden = false)
    {
        lock (_lock)
        {
            if (!_chatUsers.TryGetValue(userId, out var byChat))
            {
                return Task.FromResult(new List<ChatUser>());
            }

            var items = byChat.Values
                .Where(cu => includeHidden || !cu.IsHidden)
                .OrderByDescending(cu => cu.UpdatedAt)
                .ToList();

            return Task.FromResult(items);
        }
    }

    public Task<ChatUser?> GetByUserAndChatAsync(string userId, string chatId)
    {
        lock (_lock)
        {
            if (_chatUsers.TryGetValue(userId, out var byChat) && byChat.TryGetValue(chatId, out var chatUser))
            {
                return Task.FromResult<ChatUser?>(chatUser);
            }

            return Task.FromResult<ChatUser?>(null);
        }
    }

    public Task UpsertAsync(ChatUser chatUser)
    {
        lock (_lock)
        {
            if (!_chatUsers.TryGetValue(chatUser.UserId, out var byChat))
            {
                byChat = new Dictionary<string, ChatUser>();
                _chatUsers[chatUser.UserId] = byChat;
            }

            byChat[chatUser.ChatId] = chatUser;
            return Task.CompletedTask;
        }
    }

    public Task UpsertManyAsync(IEnumerable<ChatUser> chatUsers)
    {
        lock (_lock)
        {
            foreach (var chatUser in chatUsers)
            {
                if (!_chatUsers.TryGetValue(chatUser.UserId, out var byChat))
                {
                    byChat = new Dictionary<string, ChatUser>();
                    _chatUsers[chatUser.UserId] = byChat;
                }

                byChat[chatUser.ChatId] = chatUser;
            }

            return Task.CompletedTask;
        }
    }

    public Task SetHiddenAsync(string userId, string chatId, bool isHidden)
    {
        lock (_lock)
        {
            if (_chatUsers.TryGetValue(userId, out var byChat) && byChat.TryGetValue(chatId, out var chatUser))
            {
                chatUser.IsHidden = isHidden;
            }

            return Task.CompletedTask;
        }
    }

    public Task ClearChatForUserAsync(string userId, string chatId, DateTime clearedAtUtc)
    {
        lock (_lock)
        {
            if (_chatUsers.TryGetValue(userId, out var byChat) && byChat.TryGetValue(chatId, out var chatUser))
            {
                chatUser.IsHidden = true;
                chatUser.ClearedAt = clearedAtUtc;
            }

            return Task.CompletedTask;
        }
    }

    public Task PatchParticipantProfileAsync(string userId, string chatId, int participantIndex, string displayName, string avatarUrl, string gender)
    {
        lock (_lock)
        {
            if (!_chatUsers.TryGetValue(userId, out var byChat) || !byChat.TryGetValue(chatId, out var chatUser))
            {
                return Task.CompletedTask;
            }

            if (participantIndex < 0 || participantIndex >= chatUser.Participants.Count)
            {
                return Task.CompletedTask;
            }

            var participant = chatUser.Participants[participantIndex];
            participant.DisplayName = displayName ?? participant.DisplayName;
            participant.AvatarUrl = avatarUrl ?? participant.AvatarUrl;
            participant.Gender = gender ?? participant.Gender;

            return Task.CompletedTask;
        }
    }

    public Task DeleteAsync(string userId, string chatId)
    {
        lock (_lock)
        {
            if (_chatUsers.TryGetValue(userId, out var byChat))
            {
                byChat.Remove(chatId);
            }

            return Task.CompletedTask;
        }
    }

    public Task DeleteAllForUserAsync(string userId)
    {
        lock (_lock)
        {
            _chatUsers.Remove(userId);
            return Task.CompletedTask;
        }
    }
}
