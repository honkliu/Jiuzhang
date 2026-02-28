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

    private const string SystemPredefinedUserId = "system_predefined";

    private static readonly string[] BaseEmotionTypes =
    {
        "angry", "smile", "sad", "happy", "crying", "thinking", "surprised", "neutral", "excited"
    };

    private static readonly string[] ExtraEmotionTypes =
    {
        "flirty", "solo", "interact"
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
        var extension = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = contentType?.ToLowerInvariant() switch
            {
                "image/jpeg" => ".jpg",
                "image/jpg" => ".jpg",
                "image/png" => ".png",
                "image/webp" => ".webp",
                _ => ".img"
            };
        }

        var storedFileName = $"{Guid.NewGuid():N}{extension}";

        // Generate thumbnail
        byte[] thumbnailData;
        string thumbnailContentType;
        try
        {
            thumbnailData = ImageResizer.GenerateThumbnail(imageData);
            thumbnailContentType = "image/webp";
            _logger.LogDebug("Thumbnail generated for {FileName}: {OriginalSize}KB -> {ThumbnailSize}KB",
                storedFileName, imageData.Length / 1024, thumbnailData.Length / 1024);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate thumbnail for {FileName}, using original", storedFileName);
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
            FileName = storedFileName,
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
            .Include(a => a.Id)
            .Include(a => a.ThumbnailData)
            .Include(a => a.ThumbnailContentType);

        return await _avatarImages
            .Find(a => a.Id == avatarImageId)
            .Project<AvatarImage>(projection)
            .FirstOrDefaultAsync();
    }

    public async Task<(string? SourceAvatarId, string? Emotion)> GetSourceAvatarAndEmotionAsync(string? avatarImageId)
    {
        if (string.IsNullOrWhiteSpace(avatarImageId))
        {
            return (null, null);
        }

        var projection = Builders<AvatarImage>.Projection
            .Include(a => a.Id)
            .Include(a => a.ImageType)
            .Include(a => a.SourceAvatarId)
            .Include(a => a.Emotion);

        var avatar = await _avatarImages
            .Find(a => a.Id == avatarImageId)
            .Project<AvatarImage>(projection)
            .FirstOrDefaultAsync();

        if (avatar == null)
        {
            return (avatarImageId, null);
        }

        if (string.Equals(avatar.ImageType, "emotion_generated", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(avatar.SourceAvatarId))
        {
            return (avatar.SourceAvatarId, avatar.Emotion);
        }

        return (avatar.Id, null);
    }

    public async Task<List<AvatarImage>> GetEmotionThumbnailsBySourceAvatarIdAsync(string sourceAvatarId, bool includeFull = false)
    {
        var emotionLabels = await GetEmotionLabelsBySourceAvatarIdAsync(sourceAvatarId);

        var filter = Builders<AvatarImage>.Filter.And(
            Builders<AvatarImage>.Filter.Eq(a => a.SourceAvatarId, sourceAvatarId),
            Builders<AvatarImage>.Filter.Eq(a => a.ImageType, "emotion_generated"),
            Builders<AvatarImage>.Filter.In(a => a.Emotion, emotionLabels));

        var projection = Builders<AvatarImage>.Projection
            .Include(a => a.Id)
            .Include(a => a.Emotion)
            .Include(a => a.ThumbnailData)
            .Include(a => a.ThumbnailContentType)
            .Include(a => a.CreatedAt);

        if (includeFull)
        {
            projection = projection
                .Include(a => a.ImageData)
                .Include(a => a.ContentType);
        }

        var sort = Builders<AvatarImage>.Sort.Descending(a => a.CreatedAt);

        var querySw = System.Diagnostics.Stopwatch.StartNew();
        var findOptions = new FindOptions<AvatarImage, AvatarImage>
        {
            Sort = sort,
            Projection = projection,
            Limit = emotionLabels.Count,
        };
        var items = await (await _avatarImages.FindAsync(filter, findOptions)).ToListAsync();
        querySw.Stop();

        _logger.LogDebug(
            "EmotionThumbnails query src={SourceAvatarId} includeFull={IncludeFull} dbMs={QueryMs} count={Count}",
            sourceAvatarId, includeFull, querySw.ElapsedMilliseconds, items.Count);

        var ordered = new List<AvatarImage>();
        foreach (var emotion in emotionLabels)
        {
            var match = items.FirstOrDefault(a => string.Equals(a.Emotion, emotion, StringComparison.OrdinalIgnoreCase));
            if (match != null)
                ordered.Add(match);
        }

        return ordered;
    }

    public async Task<IReadOnlyList<string>> GetEmotionLabelsBySourceAvatarIdAsync(string sourceAvatarId)
    {
        if (string.IsNullOrWhiteSpace(sourceAvatarId))
        {
            return BaseEmotionTypes;
        }

        var projection = Builders<AvatarImage>.Projection
            .Include(a => a.Id)
            .Include(a => a.UserId);

        var avatar = await _avatarImages
            .Find(a => a.Id == sourceAvatarId)
            .Project<AvatarImage>(projection)
            .FirstOrDefaultAsync();

        if (avatar == null || string.Equals(avatar.UserId, SystemPredefinedUserId, StringComparison.OrdinalIgnoreCase))
        {
            return BaseEmotionTypes;
        }

        return BaseEmotionTypes.Concat(ExtraEmotionTypes).ToList();
    }

    public async Task<string?> NormalizeAvatarImageIdAsync(string? avatarImageId)
    {
        if (string.IsNullOrWhiteSpace(avatarImageId))
        {
            return avatarImageId;
        }

        var projection = Builders<AvatarImage>.Projection
            .Include(a => a.Id)
            .Include(a => a.ImageType)
            .Include(a => a.SourceAvatarId);

        var avatar = await _avatarImages
            .Find(a => a.Id == avatarImageId)
            .Project<AvatarImage>(projection)
            .FirstOrDefaultAsync();

        if (avatar == null)
        {
            return avatarImageId;
        }

        if (string.Equals(avatar.ImageType, "emotion_generated", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(avatar.SourceAvatarId))
        {
            return avatar.SourceAvatarId;
        }

        return avatarImageId;
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

    public async Task<(List<AvatarImage> Items, long TotalCount)> GetSelectableAvatarsAsync(string userId, int page, int pageSize, bool includeFull = false, bool includeCount = true)
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
        var totalCount = includeCount
            ? await _avatarImages.CountDocumentsAsync(filter)
            : 0L;
        countSw.Stop();

        // Include ImageData only when full images are requested
        ProjectionDefinition<AvatarImage> projection = includeFull
            ? Builders<AvatarImage>.Projection.Include(a => a.Id)  // include everything (no exclusion)
            : Builders<AvatarImage>.Projection.Exclude(a => a.ImageData);

        var fetchCount = safePageSize;
        var findOptions = new FindOptions<AvatarImage, AvatarImage>
        {
            Sort = sort,
            Skip = safePage * safePageSize,
            Limit = fetchCount,
            BatchSize = fetchCount,
            Projection = projection,
        };

        var querySw = System.Diagnostics.Stopwatch.StartNew();
        var items = await (await _avatarImages.FindAsync(filter, findOptions)).ToListAsync();
        querySw.Stop();

        sw.Stop();
        _logger.LogInformation(
            "Originals p{Page} includeFull={IncludeFull} count={Count} queryMs={QueryMs}ms{CountNote}",
            safePage, includeFull, items.Count, querySw.ElapsedMilliseconds,
            includeCount ? $" countMs={countSw.ElapsedMilliseconds}ms total={totalCount}" : "");

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
