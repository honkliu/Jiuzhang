using KanKan.API.Models;
using KanKan.API.Models.Entities;
using KanKan.API.Utils;
using MongoDB.Driver;

namespace KanKan.API.Services.Implementations;

public class AvatarService : IAvatarService
{
    private readonly IMongoCollection<AvatarImage> _avatarImages;
    private readonly IMongoCollection<ImageGenerationJob> _generationJobs;
    private readonly IMongoCollection<User> _users;
    private readonly IComfyUIService _comfyUIService;
    private readonly ILogger<AvatarService> _logger;

    private static readonly string[] EmotionTypes = new[]
    {
        "angry", "smile", "sad", "happy", "crying", "thinking", "surprised", "neutral", "excited"
    };

    public AvatarService(
        IMongoDatabase database,
        IComfyUIService comfyUIService,
        ILogger<AvatarService> logger)
    {
        _avatarImages = database.GetCollection<AvatarImage>("avatarImages");
        _generationJobs = database.GetCollection<ImageGenerationJob>("imageGenerationJobs");
        _users = database.GetCollection<User>("users");
        _comfyUIService = comfyUIService;
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

    public async Task<string> GenerateEmotionAvatarsAsync(string userId, string avatarId)
    {
        // Create generation job
        var job = new ImageGenerationJob
        {
            JobId = Guid.NewGuid().ToString(),
            UserId = userId,
            SourceType = "avatar",
            SourceRef = new SourceReference { AvatarId = avatarId },
            GenerationType = "emotions",
            Prompt = "Generate emotion variations",
            Status = "pending",
            CreatedAt = DateTime.UtcNow
        };

        await _generationJobs.InsertOneAsync(job);

        // Start background task
        _ = Task.Run(async () => await ProcessEmotionGenerationAsync(job.JobId, userId, avatarId));

        return job.JobId;
    }

    public async Task DeleteAvatarAsync(string avatarImageId)
    {
        await _avatarImages.DeleteOneAsync(a => a.Id == avatarImageId);
    }

    private async Task ProcessEmotionGenerationAsync(string jobId, string userId, string avatarId)
    {
        try
        {
            // Update status to processing
            var updateStatus = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "processing")
                .Set(j => j.Progress, 0);
            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateStatus);

            // Fetch original avatar
            var originalAvatar = await GetAvatarImageAsync(avatarId);
            if (originalAvatar == null)
            {
                throw new Exception($"Avatar {avatarId} not found");
            }

            // Convert to base64
            var imageBase64 = Convert.ToBase64String(originalAvatar.ImageData);

            var generatedAvatarIds = new List<string>();
            var totalEmotions = EmotionTypes.Length;

            for (int i = 0; i < totalEmotions; i++)
            {
                var emotion = EmotionTypes[i];

                try
                {
                    _logger.LogInformation("Generating {Emotion} avatar for job {JobId}", emotion, jobId);

                    // Generate emotion avatar via ComfyUI
                    var prompt = $"portrait of a person with {emotion} expression, high quality, detailed face";
                    var generatedBase64 = await _comfyUIService.GenerateImageAsync(imageBase64, prompt);
                    var generatedImageData = Convert.FromBase64String(generatedBase64);

                    // Generate thumbnail for generated avatar
                    byte[] generatedThumbnail;
                    string generatedThumbnailContentType;
                    try
                    {
                        generatedThumbnail = ImageResizer.GenerateThumbnail(generatedImageData);
                        generatedThumbnailContentType = "image/webp";
                    }
                    catch (Exception thumbnailEx)
                    {
                        _logger.LogWarning(thumbnailEx, "Failed to generate thumbnail for {Emotion} avatar", emotion);
                        generatedThumbnail = generatedImageData;
                        generatedThumbnailContentType = originalAvatar.ContentType;
                    }

                    // Store in MongoDB
                    var generatedAvatar = new AvatarImage
                    {
                        UserId = userId,
                        ImageType = "emotion_generated",
                        Emotion = emotion,
                        ImageData = generatedImageData,
                        ThumbnailData = generatedThumbnail,
                        ThumbnailContentType = generatedThumbnailContentType,
                        ContentType = originalAvatar.ContentType,
                        FileName = $"{emotion}_{originalAvatar.FileName}",
                        FileSize = generatedImageData.Length,
                        SourceAvatarId = avatarId,
                        GenerationPrompt = prompt,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };

                    await _avatarImages.InsertOneAsync(generatedAvatar);
                    generatedAvatarIds.Add(generatedAvatar.Id);

                    // Update progress
                    var progress = (int)((i + 1) / (double)totalEmotions * 100);
                    var updateProgress = Builders<ImageGenerationJob>.Update.Set(j => j.Progress, progress);
                    await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateProgress);

                    _logger.LogInformation("Generated {Emotion} avatar: {AvatarId}", emotion, generatedAvatar.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to generate {Emotion} avatar for job {JobId}", emotion, jobId);
                    // Continue with other emotions
                }
            }

            // Update job as completed
            var updateComplete = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "completed")
                .Set(j => j.Progress, 100)
                .Set(j => j.Results, new GenerationResults { AvatarImageIds = generatedAvatarIds })
                .Set(j => j.CompletedAt, DateTime.UtcNow);

            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateComplete);

            _logger.LogInformation("Emotion generation completed for job {JobId}", jobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Emotion generation failed for job {JobId}", jobId);

            var updateFailed = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "failed")
                .Set(j => j.ErrorMessage, ex.Message)
                .Set(j => j.CompletedAt, DateTime.UtcNow);

            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateFailed);
        }
    }
}
