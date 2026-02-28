using KanKan.API.Models;

namespace KanKan.API.Services;

public interface IAvatarService
{
    Task<AvatarImage> UploadAvatarAsync(string userId, byte[] imageData, string contentType, string fileName);
    Task<AvatarImage?> GetAvatarImageAsync(string avatarImageId);
    Task<AvatarImage?> GetAvatarThumbnailAsync(string avatarImageId);
    Task<(string? SourceAvatarId, string? Emotion)> GetSourceAvatarAndEmotionAsync(string? avatarImageId);
    Task<List<AvatarImage>> GetEmotionThumbnailsBySourceAvatarIdAsync(string sourceAvatarId, bool includeFull = false);
    Task<IReadOnlyList<string>> GetEmotionLabelsBySourceAvatarIdAsync(string sourceAvatarId);
    Task<string?> NormalizeAvatarImageIdAsync(string? avatarImageId);
    Task<AvatarImage?> GetPredefinedAvatarByFileNameAsync(string fileName);
    Task<(List<AvatarImage> Items, long TotalCount)> GetSelectableAvatarsAsync(string userId, int page, int pageSize, bool includeFull = false, bool includeCount = true);
    Task<List<AvatarImage>> GetUserEmotionAvatarsAsync(string userId);
    Task DeleteAvatarAsync(string avatarImageId);
}
