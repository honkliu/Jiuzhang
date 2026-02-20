using KanKan.API.Models;

namespace KanKan.API.Services;

public interface IAvatarService
{
    Task<AvatarImage> UploadAvatarAsync(string userId, byte[] imageData, string contentType, string fileName);
    Task<AvatarImage?> GetAvatarImageAsync(string avatarImageId);
    Task<AvatarImage?> GetAvatarThumbnailAsync(string avatarImageId);
    Task<List<AvatarImage>> GetEmotionThumbnailsBySourceAvatarIdAsync(string sourceAvatarId);
    Task<AvatarImage?> GetPredefinedAvatarByFileNameAsync(string fileName);
    Task<(List<AvatarImage> Items, long TotalCount)> GetSelectableAvatarsAsync(string userId, int page, int pageSize);
    Task<List<AvatarImage>> GetUserEmotionAvatarsAsync(string userId);
    Task DeleteAvatarAsync(string avatarImageId);
}
