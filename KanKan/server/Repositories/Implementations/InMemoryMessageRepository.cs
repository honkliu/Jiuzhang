using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

/// <summary>
/// In-memory implementation of IMessageRepository for development/testing without MongoDB
/// </summary>
public class InMemoryMessageRepository : IMessageRepository
{
    private static readonly Dictionary<string, Message> _messages = new();
    private static readonly object _lock = new();

    public Task<Message?> GetByIdAsync(string id, string chatId)
    {
        lock (_lock)
        {
            _messages.TryGetValue(id, out var message);
            if (message != null && message.ChatId == chatId)
                return Task.FromResult<Message?>(message);
            return Task.FromResult<Message?>(null);
        }
    }

    public Task<List<Message>> GetChatMessagesAsync(string chatId, int limit = 50, DateTime? before = null)
    {
        lock (_lock)
        {
            var query = _messages.Values
                .Where(m => m.ChatId == chatId && !m.IsDeleted);

            if (before.HasValue)
            {
                query = query.Where(m => m.Timestamp < before.Value);
            }

            var messages = query
                .OrderByDescending(m => m.Timestamp)
                .Take(limit)
                .Reverse() // Return in chronological order
                .ToList();

            return Task.FromResult(messages);
        }
    }

    public Task<Message> CreateAsync(Message message)
    {
        lock (_lock)
        {
            message.Timestamp = DateTime.UtcNow;
            _messages[message.Id] = message;
            return Task.FromResult(message);
        }
    }

    public Task<Message> UpdateAsync(Message message)
    {
        lock (_lock)
        {
            _messages[message.Id] = message;
            return Task.FromResult(message);
        }
    }

    public Task DeleteAsync(string id, string chatId)
    {
        lock (_lock)
        {
            if (_messages.TryGetValue(id, out var message) && message.ChatId == chatId)
            {
                message.IsDeleted = true;
                message.DeletedAt = DateTime.UtcNow;
            }
            return Task.CompletedTask;
        }
    }
}
