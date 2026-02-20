using KanKan.API.Models;
using KanKan.API.Models.Entities;
using KanKan.API.Utils;
using MongoDB.Driver;

namespace KanKan.API.Services.Implementations;

public class AvatarService : IAvatarService
{
    private readonly IMongoCollection<AvatarImage> _avatarImages;
    private readonly IMongoCollection<User> _users;
    private readonly ILogger<AvatarService> _logger;

    private static readonly string[] EmotionTypes =
    {
        "angry", "smile", "sad", "happy", "crying", "thinking", "surprised", "neutral", "excited"
    };

    public AvatarService(
        IMongoDatabase database,
        ILogger<AvatarService> logger)
    {
        _avatarImages = database.GetCollection<AvatarImage>("avatarImages");
        _users = database.GetCollection<User>("users");
        _logger = logger;
    }

    public async Task<AvatarImage> UploadAvatarAsync(string userId, byte[] imageData, string contentType, string fileName)
    {
        // Generate thumbnail
        byte[] thumbnailData;
        string thumbnailContentType;
        try
        {
            thumbnailData = ImageResizer.GenerateThumbnail(imageData);
            thumbnailContentType = "image/webp";
            _logger.LogInformation("Generated thumbnail for upload {FileName}: {OriginalSize}KB -> {ThumbnailSize}KB",
                fileName, imageData.Length / 1024, thumbnailData.Length / 1024);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate thumbnail for {FileName}, using original", fileName);
            thumbnailData = imageData;
            thumbnailContentType = contentType;
        }

        var avatarImage = new AvatarImage
        {
            UserId = userId,
            ImageType = "original",
            Emotion = null,
            ImageData = imageData,
            ThumbnailData = thumbnailData,
            ThumbnailContentType = thumbnailContentType,
            ContentType = contentType,
            FileName = fileName,
            FileSize = imageData.Length,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _avatarImages.InsertOneAsync(avatarImage);

        // Update user's avatarImageId
        var update = Builders<User>.Update.Set(u => u.AvatarImageId, avatarImage.Id);
        await _users.UpdateOneAsync(u => u.Id == userId, update);

        _logger.LogInformation("Avatar uploaded for user {UserId}, avatarId: {AvatarId}", userId, avatarImage.Id);

        return avatarImage;
    }

    public async Task<AvatarImage?> GetAvatarImageAsync(string avatarImageId)
    {
        return await _avatarImages.Find(a => a.Id == avatarImageId).FirstOrDefaultAsync();
    }

    public async Task<AvatarImage?> GetAvatarThumbnailAsync(string avatarImageId)
    {
        var projection = Builders<AvatarImage>.Projection
            .Include(a => a.ThumbnailData)
            .Include(a => a.ThumbnailContentType);

        return await _avatarImages
            .Find(a => a.Id == avatarImageId)
            .Project<AvatarImage>(projection)
            .FirstOrDefaultAsync();
    }

    public async Task<List<AvatarImage>> GetEmotionThumbnailsBySourceAvatarIdAsync(string sourceAvatarId)
    {
        var filter = Builders<AvatarImage>.Filter.And(
            Builders<AvatarImage>.Filter.Eq(a => a.SourceAvatarId, sourceAvatarId),
            Builders<AvatarImage>.Filter.Eq(a => a.ImageType, "emotion_generated"),
            Builders<AvatarImage>.Filter.In(a => a.Emotion, EmotionTypes));

        var projection = Builders<AvatarImage>.Projection
            .Include(a => a.Id)
            .Include(a => a.Emotion)
            .Include(a => a.ThumbnailData)
            .Include(a => a.ThumbnailContentType)
            .Include(a => a.CreatedAt);

        var avatars = await _avatarImages
            .Find(filter)
            .Project<AvatarImage>(projection)
            .ToListAsync();

        var latestByEmotion = avatars
            .Where(a => !string.IsNullOrWhiteSpace(a.Emotion))
            .OrderByDescending(a => a.CreatedAt)
            .GroupBy(a => a.Emotion!.Trim().ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First());

        var ordered = new List<AvatarImage>();
        foreach (var emotion in EmotionTypes)
        {
            if (latestByEmotion.TryGetValue(emotion, out var avatar))
            {
                ordered.Add(avatar);
            }
        }

        return ordered;
    }

    public async Task<AvatarImage?> GetPredefinedAvatarByFileNameAsync(string fileName)
    {
        const string predefinedUserId = "system_predefined";
        return await _avatarImages
            .Find(a => a.UserId == predefinedUserId
                && a.ImageType == "original"
                && a.FileName == fileName)
            .FirstOrDefaultAsync();
    }

    public async Task<(List<AvatarImage> Items, long TotalCount)> GetSelectableAvatarsAsync(string userId, int page, int pageSize)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        const string predefinedUserId = "system_predefined";
        var filter = Builders<AvatarImage>.Filter.And(
            Builders<AvatarImage>.Filter.Eq(a => a.ImageType, "original"),
            Builders<AvatarImage>.Filter.Eq(a => a.Emotion, null),
            Builders<AvatarImage>.Filter.Eq(a => a.SourceAvatarId, null),
            Builders<AvatarImage>.Filter.Or(
                Builders<AvatarImage>.Filter.Eq(a => a.UserId, userId),
                Builders<AvatarImage>.Filter.Eq(a => a.UserId, predefinedUserId)));

        var sort = Builders<AvatarImage>.Sort
            .Ascending(a => a.UserId)
            .Ascending(a => a.FileName)
            .Descending(a => a.CreatedAt);

        var safePage = Math.Max(0, page);
        var safePageSize = Math.Min(Math.Max(1, pageSize), 60);

        var countSw = System.Diagnostics.Stopwatch.StartNew();
        var totalCount = await _avatarImages.CountDocumentsAsync(filter);
        countSw.Stop();

        // Use MongoDB native projection to exclude only original ImageData
        var projection = Builders<AvatarImage>.Projection
            .Exclude(a => a.ImageData);          // Exclude original, keep thumbnail

        var querySw = System.Diagnostics.Stopwatch.StartNew();
        var items = await _avatarImages
            .Find(filter)
            .Sort(sort)
            .Skip(safePage * safePageSize)
            .Limit(safePageSize)
            .Project<AvatarImage>(projection)
            .ToListAsync();
        querySw.Stop();

        sw.Stop();
        _logger.LogInformation(
            "GetSelectableAvatars completed: Total={TotalMs}ms (Count={CountMs}ms, Query={QueryMs}ms), Results={Count}",
            sw.ElapsedMilliseconds, countSw.ElapsedMilliseconds, querySw.ElapsedMilliseconds, items.Count);

        return (items, totalCount);
    }

    public async Task<List<AvatarImage>> GetUserEmotionAvatarsAsync(string userId)
    {
        return await _avatarImages
            .Find(a => a.UserId == userId && a.ImageType == "emotion_generated")
            .ToListAsync();
    }

    public async Task DeleteAvatarAsync(string avatarImageId)
    {
        await _avatarImages.DeleteOneAsync(a => a.Id == avatarImageId);
    }
}
