using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface IChatRepository
{
    Task<Chat?> GetByIdAsync(string id);
    Task<List<Chat>> GetUserChatsAsync(string userId);
    Task<Chat?> GetDirectChatAsync(string userId1, string userId2);
    Task<Chat> CreateAsync(Chat chat);
    Task<Chat> UpdateAsync(Chat chat);
    Task SetHiddenAsync(string chatId, string userId, bool isHidden);
    Task DeleteAsync(string id);
}
