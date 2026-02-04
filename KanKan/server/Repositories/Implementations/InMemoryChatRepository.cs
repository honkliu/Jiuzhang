using WeChat.API.Models.Entities;
using WeChat.API.Repositories.Interfaces;

namespace WeChat.API.Repositories.Implementations;

/// <summary>
/// In-memory implementation of IChatRepository for development/testing without Cosmos DB
/// </summary>
public class InMemoryChatRepository : IChatRepository
{
    private static readonly Dictionary<string, Chat> _chats = new();
    private static readonly object _lock = new();

    public Task<Chat?> GetByIdAsync(string id)
    {
        lock (_lock)
        {
            _chats.TryGetValue(id, out var chat);
            return Task.FromResult(chat);
        }
    }

    public Task<List<Chat>> GetUserChatsAsync(string userId)
    {
        lock (_lock)
        {
            var chats = _chats.Values
                .Where(c => c.Participants.Any(p => p.UserId == userId))
                .OrderByDescending(c => c.UpdatedAt)
                .ToList();
            return Task.FromResult(chats);
        }
    }

    public Task<Chat?> GetDirectChatAsync(string userId1, string userId2)
    {
        lock (_lock)
        {
            var chat = _chats.Values.FirstOrDefault(c =>
                c.ChatType == "direct" &&
                c.Participants.Any(p => p.UserId == userId1) &&
                c.Participants.Any(p => p.UserId == userId2));
            return Task.FromResult(chat);
        }
    }

    public Task<Chat> CreateAsync(Chat chat)
    {
        lock (_lock)
        {
            chat.CreatedAt = DateTime.UtcNow;
            chat.UpdatedAt = DateTime.UtcNow;
            _chats[chat.Id] = chat;
            return Task.FromResult(chat);
        }
    }

    public Task<Chat> UpdateAsync(Chat chat)
    {
        lock (_lock)
        {
            chat.UpdatedAt = DateTime.UtcNow;
            _chats[chat.Id] = chat;
            return Task.FromResult(chat);
        }
    }

    public Task DeleteAsync(string id)
    {
        lock (_lock)
        {
            _chats.Remove(id);
            return Task.CompletedTask;
        }
    }
}
