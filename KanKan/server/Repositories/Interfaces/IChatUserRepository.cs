using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface IChatUserRepository
{
    Task<List<ChatUser>> GetUserChatsAsync(string userId, bool includeHidden = false);
    Task<ChatUser?> GetByUserAndChatAsync(string userId, string chatId);
    Task UpsertAsync(ChatUser chatUser);
    Task UpsertManyAsync(IEnumerable<ChatUser> chatUsers);
    Task SetHiddenAsync(string userId, string chatId, bool isHidden);
    Task ClearChatForUserAsync(string userId, string chatId, DateTime clearedAtUtc);
    Task PatchParticipantProfileAsync(string userId, string chatId, int participantIndex, string displayName, string avatarUrl, string gender);
    Task DeleteAsync(string userId, string chatId);
}
