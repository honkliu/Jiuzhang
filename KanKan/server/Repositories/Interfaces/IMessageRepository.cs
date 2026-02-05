using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface IMessageRepository
{
    Task<Message?> GetByIdAsync(string id, string chatId);
    Task<List<Message>> GetChatMessagesAsync(string chatId, int limit = 50, DateTime? before = null);
    Task<Message> CreateAsync(Message message);
    Task<Message> UpdateAsync(Message message);
    Task DeleteAsync(string id, string chatId);
}
