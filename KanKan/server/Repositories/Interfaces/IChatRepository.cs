using WeChat.API.Models.Entities;

namespace WeChat.API.Repositories.Interfaces;

public interface IChatRepository
{
    Task<Chat?> GetByIdAsync(string id);
    Task<List<Chat>> GetUserChatsAsync(string userId);
    Task<Chat?> GetDirectChatAsync(string userId1, string userId2);
    Task<Chat> CreateAsync(Chat chat);
    Task<Chat> UpdateAsync(Chat chat);
    Task DeleteAsync(string id);
}
