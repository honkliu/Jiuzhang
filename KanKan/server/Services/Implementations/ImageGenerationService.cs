using KanKan.API.Models;
using KanKan.API.Models.Entities;
using KanKan.API.Utils;
using MongoDB.Bson;
using MongoDB.Driver;
using System.Text;

namespace KanKan.API.Services.Implementations;

public class ImageGenerationService : IImageGenerationService
{
    private sealed class ResolvedImageSource
    {
        public byte[] Bytes { get; init; } = Array.Empty<byte>();
        public string FileStem { get; init; } = string.Empty;
        public string Extension { get; init; } = ".png";
        public string DirectoryPath { get; init; } = string.Empty;
        public string UrlDirectory { get; init; } = "/uploads";
    }

    private readonly IMongoCollection<ImageGenerationJob> _generationJobs;
    private readonly IMongoCollection<Message> _messages;
    private readonly IMongoCollection<AvatarImage> _avatarImages;
    private readonly IComfyUIService _comfyUIService;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<ImageGenerationService> _logger;

    private static readonly string[] BaseEmotionTypes = new[]
    {
        "angry", "smile", "sad", "happy", "crying", "thinking", "surprised", "neutral", "excited"
    };

    private static readonly string[] ExtraEmotionTypes = new[]
    {
        "flirty", "solo", "interact"
    };

    public ImageGenerationService(
        IMongoDatabase database,
        IConfiguration configuration,
        IComfyUIService comfyUIService,
        IWebHostEnvironment environment,
        ILogger<ImageGenerationService> logger)
    {
        var messagesCollectionName = configuration["MongoDB:Collections:Messages"] ?? "Messages";
        _generationJobs = database.GetCollection<ImageGenerationJob>("imageGenerationJobs");
        _messages = database.GetCollection<Message>(messagesCollectionName);
        _avatarImages = database.GetCollection<AvatarImage>("avatarImages");
        _comfyUIService = comfyUIService;
        _environment = environment;
        _logger = logger;
    }

    public async Task<string> GenerateAsync(GenerationRequest request)
    {
        if (request.SourceType == "avatar" && !string.IsNullOrWhiteSpace(request.Emotion))
        {
            var existing = await _generationJobs.Find(j =>
                    j.UserId == request.UserId
                    && j.SourceType == "avatar"
                    && j.GenerationType == "emotions"
                    && j.SourceRef.AvatarId == request.AvatarId
                    && j.Emotion == request.Emotion
                    && (j.Status == "pending" || j.Status == "processing"))
                .FirstOrDefaultAsync();

            if (existing != null)
            {
                return existing.JobId;
            }
        }

        // Create generation job
        string? originalMediaUrl = request.MediaUrl;
        if (request.SourceType == "chat_image" && !string.IsNullOrWhiteSpace(request.MessageId))
        {
            originalMediaUrl = await ResolveOriginalMediaUrlAsync(request.MessageId, request.MediaUrl);
        }

        var job = new ImageGenerationJob
        {
            JobId = Guid.NewGuid().ToString(),
            UserId = request.UserId,
            SourceType = request.SourceType,
            SourceRef = new SourceReference
            {
                AvatarId = request.AvatarId,
                MessageId = request.MessageId,
                OriginalMediaUrl = originalMediaUrl,
                SecondaryMediaUrl = request.SecondaryMediaUrl
            },
            GenerationType = request.GenerationType,
            Emotion = request.Emotion,
            Prompt = GetPromptDescription(request.GenerationType, request.CustomPrompts),
            Status = "pending",
            CreatedAt = DateTime.UtcNow
        };

        await _generationJobs.InsertOneAsync(job);
        _logger.LogInformation(
            "Mongo insert imageGenerationJobs: {JobId} sourceType={SourceType} generationType={GenerationType} emotion={Emotion}",
            job.JobId,
            job.SourceType,
            job.GenerationType,
            job.Emotion ?? string.Empty);

        // Start background task based on source type
        if (request.SourceType == "avatar")
        {
            _ = Task.Run(async () => await ProcessAvatarGenerationAsync(job.JobId, request));
        }
        else if (request.SourceType == "chat_image")
        {
            _ = Task.Run(async () => await ProcessChatImageGenerationAsync(job.JobId, request));
        }

        return job.JobId;
    }

    public async Task<ImageGenerationJob?> GetJobStatusAsync(string jobId)
    {
        var job = await _generationJobs.Find(j => j.JobId == jobId).FirstOrDefaultAsync();
        if (job == null)
        {
            return null;
        }

        // Recovery disabled for now; rely on normal processing/timeout handling.

        return job;
    }

    public async Task<List<GeneratedAvatarResult>> GetGeneratedAvatarsAsync(string avatarIdOrUserId)
    {
        var isObjectId = ObjectId.TryParse(avatarIdOrUserId, out _);
        var baseFilter = isObjectId
            ? Builders<AvatarImage>.Filter.Eq(a => a.SourceAvatarId, avatarIdOrUserId)
            : Builders<AvatarImage>.Filter.Eq(a => a.UserId, avatarIdOrUserId);

        var filter = Builders<AvatarImage>.Filter.And(
            baseFilter,
            Builders<AvatarImage>.Filter.Eq(a => a.ImageType, "emotion_generated"));

        var avatars = await _avatarImages.Find(filter).ToListAsync();

        if (isObjectId)
        {
            var latestByEmotion = avatars
                .Where(a => !string.IsNullOrWhiteSpace(a.Emotion))
                .OrderByDescending(a => a.CreatedAt)
                .GroupBy(a => a.Emotion!.Trim().ToLowerInvariant())
                .ToDictionary(g => g.Key, g => g.First());

            var ordered = new List<AvatarImage>();
            foreach (var emotion in BaseEmotionTypes)
            {
                if (latestByEmotion.TryGetValue(emotion, out var avatar))
                {
                    ordered.Add(avatar);
                }
            }

            var allowExtras = !string.IsNullOrWhiteSpace(avatarIdOrUserId) && await IsUserAvatarAsync(avatarIdOrUserId);
            if (allowExtras)
            {
                foreach (var extra in ExtraEmotionTypes)
                {
                    if (latestByEmotion.TryGetValue(extra, out var avatar))
                    {
                        ordered.Add(avatar);
                    }
                }

                foreach (var extra in latestByEmotion)
                {
                    if (!BaseEmotionTypes.Contains(extra.Key) && !ExtraEmotionTypes.Contains(extra.Key))
                    {
                        ordered.Add(extra.Value);
                    }
                }
            }

            avatars = ordered;
        }

        return avatars.Select(a => new GeneratedAvatarResult
        {
            AvatarImageId = a.Id,
            Emotion = a.Emotion,
            Style = a.Emotion, // For now, style is stored in emotion field
            ImageUrl = $"/api/avatar/image/{a.Id}",
            SourceAvatarId = a.SourceAvatarId ?? string.Empty,
            CreatedAt = a.CreatedAt
        }).ToList();
    }

    public async Task<List<string>> GetVariationUrlsAsync(string messageId)
    {
        var message = await _messages.Find(m => m.Id == messageId).FirstOrDefaultAsync();
        var sourceUrl = message?.Content?.MediaUrl ?? message?.Content?.ThumbnailUrl;
        if (string.IsNullOrWhiteSpace(sourceUrl))
        {
            var job = await _generationJobs
                .Find(j => j.SourceType == "chat_image" && j.SourceRef.MessageId == messageId && j.SourceRef.OriginalMediaUrl != null)
                .SortBy(j => j.CreatedAt)
                .FirstOrDefaultAsync();
            sourceUrl = job?.SourceRef?.OriginalMediaUrl;
        }

        if (string.IsNullOrWhiteSpace(sourceUrl))
        {
            sourceUrl = ResolveSourceUrlFromIdentifier(messageId);
        }

        if (string.IsNullOrWhiteSpace(sourceUrl))
        {
            return new List<string>();
        }

        var sourceFileName = GetFileNameFromUrl(sourceUrl);
        var baseName = Path.GetFileNameWithoutExtension(sourceFileName);
        var extension = Path.GetExtension(sourceFileName);
        if (string.IsNullOrWhiteSpace(baseName))
        {
            return new List<string>();
        }

        var searchPattern = string.IsNullOrWhiteSpace(extension)
            ? $"{baseName}_*"
            : $"{baseName}_*{extension}";

        var (folderPath, urlPrefix) = GetGeneratedOutputLocation(sourceUrl);
        var results = FindGeneratedFiles(folderPath, searchPattern, baseName, urlPrefix);

        return results
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => ExtractSuffixIndex(Path.GetFileName(name), baseName))
            .ToList();
    }

    private string GetPromptDescription(string generationType, List<string>? customPrompts)
    {
        return generationType switch
        {
            "emotions" => "Generate emotion variations (angry, smile, sad, happy, crying, thinking, surprised, neutral, excited)",
            "styles" => customPrompts != null ? string.Join(", ", customPrompts) : "Generate style variations",
            "variations" => "Generate creative variations",
            "custom" => customPrompts != null ? string.Join(", ", customPrompts) : "Custom generation",
            _ => "Image generation"
        };
    }

    private string GetUploadsPath()
    {
        return Path.Combine(GetWebRootPath(), "uploads");
    }

    private string GetWebRootPath()
    {
        return _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
    }

    private static string GetFileNameFromUrl(string url)
    {
        var path = NormalizeAssetPath(url);
        return Path.GetFileName(path.TrimEnd('/'));
    }

    private (string folderPath, string urlPrefix) GetGeneratedOutputLocation(string sourceUrl)
    {
        var normalizedPath = NormalizeAssetPath(sourceUrl);
        if (TryExtractAvatarImageId(normalizedPath, out _))
        {
            return (GetUploadsPath(), "/uploads/");
        }

        var sourceFilePath = ResolveStaticAssetFilePath(normalizedPath);
        var folderPath = Path.GetDirectoryName(sourceFilePath) ?? GetUploadsPath();
        var urlDirectory = GetUrlDirectoryFromFilePath(folderPath);
        return (folderPath, urlDirectory.TrimEnd('/') + "/");
    }

    private static string? ResolveSourceUrlFromIdentifier(string sourceId)
    {
        if (string.IsNullOrWhiteSpace(sourceId))
        {
            return null;
        }

        if (sourceId.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase)
            || sourceId.StartsWith("/photos/", StringComparison.OrdinalIgnoreCase)
            || sourceId.StartsWith("/standing/", StringComparison.OrdinalIgnoreCase))
        {
            return sourceId;
        }

        var decodedRelativePath = DecodeBase64Url(sourceId);
        if (string.IsNullOrWhiteSpace(decodedRelativePath))
        {
            return null;
        }

        decodedRelativePath = decodedRelativePath.Replace('\\', '/').TrimStart('/');
        if (decodedRelativePath.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase)
            || decodedRelativePath.StartsWith("photos/", StringComparison.OrdinalIgnoreCase)
            || decodedRelativePath.StartsWith("standing/", StringComparison.OrdinalIgnoreCase))
        {
            return "/" + decodedRelativePath;
        }

        return null;
    }

    private static string? DecodeBase64Url(string value)
    {
        try
        {
            var base64 = value.Replace('-', '+').Replace('_', '/');
            base64 = base64.PadRight(base64.Length + (4 - base64.Length % 4) % 4, '=');
            return Encoding.UTF8.GetString(Convert.FromBase64String(base64));
        }
        catch
        {
            return null;
        }
    }

    private string GetUrlDirectoryFromFilePath(string folderPath)
    {
        var webRootPath = Path.GetFullPath(GetWebRootPath());
        var fullFolderPath = Path.GetFullPath(folderPath);
        var relativePath = Path.GetRelativePath(webRootPath, fullFolderPath);
        if (relativePath.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            || string.Equals(relativePath, "..", StringComparison.Ordinal))
        {
            return "/uploads";
        }

        if (string.Equals(relativePath, ".", StringComparison.Ordinal))
        {
            return "/";
        }

        return "/" + relativePath.Replace(Path.DirectorySeparatorChar, '/').Trim('/');
    }

    private static int ExtractSuffixIndex(string fileName, string baseName)
    {
        var withoutExt = Path.GetFileNameWithoutExtension(fileName);
        if (!withoutExt.StartsWith(baseName + "_", StringComparison.OrdinalIgnoreCase))
        {
            return int.MaxValue;
        }

        var suffix = withoutExt.Substring(baseName.Length + 1);
        // Direct descendants are exactly `{baseName}_{N}`. Anything else
        // (containing further underscores) belongs to a deeper namespace and
        // shouldn't be ordered against direct children.
        return int.TryParse(suffix, out var value) ? value : int.MaxValue;
    }

    private static int GetNextGeneratedIndex(string uploadsPath, string baseName, string extension)
    {
        var searchPattern = string.IsNullOrWhiteSpace(extension)
            ? $"{baseName}_*"
            : $"{baseName}_*{extension}";

        var files = Directory.Exists(uploadsPath)
            ? Directory.GetFiles(uploadsPath, searchPattern)
            : Array.Empty<string>();

        var maxIndex = 0;
        foreach (var file in files)
        {
            var fileName = Path.GetFileName(file);
            var index = ExtractSuffixIndex(fileName, baseName);
            if (index != int.MaxValue && index > maxIndex)
            {
                maxIndex = index;
            }
        }

        return maxIndex + 1;
    }

    /// <summary>
    /// For chat /p pair generation: returns 0 if `{baseName}.{ext}` does not
    /// exist yet (the first take has no suffix), otherwise returns the next
    /// available `-N` take index.
    /// </summary>
    private static int GetNextPairTakeIndex(string uploadsPath, string baseName, string extension)
    {
        if (!Directory.Exists(uploadsPath))
        {
            return 0;
        }

        var unsuffixed = Path.Combine(uploadsPath, $"{baseName}{extension}");
        if (!File.Exists(unsuffixed))
        {
            return 0;
        }

        var searchPattern = string.IsNullOrWhiteSpace(extension)
            ? $"{baseName}-*"
            : $"{baseName}-*{extension}";

        var maxTake = 0;
        foreach (var file in Directory.GetFiles(uploadsPath, searchPattern))
        {
            var stem = Path.GetFileNameWithoutExtension(file);
            if (!stem.StartsWith(baseName + "-", StringComparison.OrdinalIgnoreCase)) continue;
            var trailing = stem.Substring(baseName.Length + 1);
            // Only accept pure positive integers — reject things like
            // `A_B-3_2` (a case-1 edit of A_B-3) so they don't bump the
            // pair take index.
            if (int.TryParse(trailing, out var take) && take > 0 && take > maxTake)
            {
                maxTake = take;
            }
        }

        return maxTake + 1;
    }

    private static List<string> FindGeneratedFiles(string folderPath, string searchPattern, string baseName, string urlPrefix)
    {
        if (!Directory.Exists(folderPath))
        {
            return new List<string>();
        }

        // After the case-1 naming change, direct descendants are exactly
        // `{baseName}_{N}` — all in the same namespace — so ordering by N
        // matches the order they were produced.
        return Directory.GetFiles(folderPath, searchPattern)
            .Select(path => Path.GetFileName(path))
            .Where(name => IsGeneratedDescendantName(Path.GetFileNameWithoutExtension(name), baseName))
            .OrderBy(name => ExtractSuffixIndex(name, baseName))
            .Select(name => $"{urlPrefix}{name}")
            .ToList();
    }

    private static bool IsGeneratedDescendantName(string generatedBaseName, string sourceBaseName)
    {
        if (!generatedBaseName.StartsWith(sourceBaseName + "_", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        // Direct descendants are exactly `{source}_{positiveInt}` — no further
        // underscores. Anything deeper (e.g. `A_B-3_2` relative to `A`) is the
        // descendant of a sibling, not of `A` itself, and shouldn't be listed
        // as A's edit. The flat lightbox view shows only the source's direct
        // edit children; deeper edits show up under their own parent.
        var suffix = generatedBaseName.Substring(sourceBaseName.Length + 1);
        return !string.IsNullOrEmpty(suffix)
            && !suffix.Contains('_')
            && int.TryParse(suffix, out var index)
            && index > 0;
    }

    /// <summary>
    /// Strip a trailing "_N" edit index from a file stem to find its naming
    /// namespace. `A_5` -> `A`, `A_B-3_2` -> `A_B-3`, `A_B-3` -> `A_B-3` (no
    /// trailing _N), `A` -> `A`.
    /// </summary>
    private static string StripTrailingEditIndex(string fileStem)
    {
        if (string.IsNullOrEmpty(fileStem))
        {
            return fileStem;
        }

        var lastUnderscore = fileStem.LastIndexOf('_');
        if (lastUnderscore <= 0 || lastUnderscore == fileStem.Length - 1)
        {
            return fileStem;
        }

        var trailing = fileStem.Substring(lastUnderscore + 1);
        return int.TryParse(trailing, out var n) && n > 0
            ? fileStem.Substring(0, lastUnderscore)
            : fileStem;
    }

    private static string CombineFileStems(params string[] stems)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        return string.Join("_", stems
            .Where(stem => !string.IsNullOrWhiteSpace(stem))
            .Select(stem => new string(stem.Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray()).Trim('_'))
            .Where(stem => !string.IsNullOrWhiteSpace(stem)));
    }

    private async Task ProcessAvatarGenerationAsync(string jobId, GenerationRequest request)
    {
        try
        {
            // Update status to processing
            var updateStatus = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "processing")
                .Set(j => j.Progress, 0);
            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateStatus);
            _logger.LogInformation("Mongo update imageGenerationJobs processing: {JobId}", jobId);

            // Fetch original avatar from MongoDB
            var originalAvatar = await _avatarImages.Find(a => a.Id == request.AvatarId).FirstOrDefaultAsync();
            if (originalAvatar == null)
            {
                throw new Exception($"Avatar {request.AvatarId} not found");
            }

            if (originalAvatar.ImageData == null || originalAvatar.ImageData.Length == 0)
            {
                throw new Exception($"Avatar {request.AvatarId} has no image data");
            }

            var imageBase64 = Convert.ToBase64String(originalAvatar.ImageData);
            var (targetWidth, targetHeight) = ImageResizer.GetScaledDimensions(originalAvatar.ImageData, 1024);

            var shouldReplace = string.Equals(request.Mode, "replace", StringComparison.OrdinalIgnoreCase)
                || (string.IsNullOrEmpty(request.Mode) && request.GenerationType == "emotions");

            // Determine prompts based on generation type
            var emotionLabels = GetEmotionLabelsForAvatar(originalAvatar);
            var prompts = GetPrompts(request.GenerationType, request.CustomPrompts, request.Emotion, emotionLabels);
            var generatedAvatarIds = new List<string>();
            var totalCount = prompts.Count;

            var emotionLabelSet = new HashSet<string>(emotionLabels, StringComparer.OrdinalIgnoreCase);

            for (int i = 0; i < totalCount; i++)
            {
                var (label, prompt) = prompts[i];

                try
                {
                    _logger.LogInformation("Generating {Label} avatar for job {JobId}", label, jobId);

                    var fullPrompt = $"portrait the input people or animal with a mild {prompt} expression, high quality. Preserve the original proportions.";
                    var extraPrompt = request.ExtraPrompt?.Trim();
                    if (!string.IsNullOrWhiteSpace(extraPrompt))
                    {
                        fullPrompt = $"{fullPrompt} {extraPrompt}";
                    }

                    if (totalCount == 1 && !string.IsNullOrWhiteSpace(request.Emotion))
                    {
                        using var gate = await _comfyUIService.AcquireGenerationSlotAsync();
                        var promptId = await _comfyUIService.SubmitPromptAsync(imageBase64, fullPrompt);
                        var updatePrompt = Builders<ImageGenerationJob>.Update
                            .Set(j => j.ComfyPromptId, promptId)
                            .Set(j => j.Prompt, fullPrompt)
                            .Set(j => j.Progress, 0);
                        await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updatePrompt);
                        _logger.LogInformation("Mongo update imageGenerationJobs prompt: {JobId}", jobId);

                        try
                        {
                            var generatedBase64 = await _comfyUIService.FetchResultAsync(promptId);
                            var resizedBase64 = ResizeGeneratedBase64(generatedBase64, targetWidth, targetHeight, originalAvatar.ContentType);
                            var avatarId = await StoreGeneratedAvatarAsync(request, originalAvatar, label, resizedBase64, fullPrompt);
                            generatedAvatarIds.Add(avatarId);
                        }
                        catch (TimeoutException)
                        {
                            _logger.LogWarning("ComfyUI still processing prompt {PromptId} for job {JobId}", promptId, jobId);
                            var updateProcessing = Builders<ImageGenerationJob>.Update
                                .Set(j => j.Status, "processing")
                                .Set(j => j.ErrorMessage, "Still processing in ComfyUI")
                                .Set(j => j.Progress, 0);
                            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateProcessing);
                            _logger.LogWarning("Mongo update imageGenerationJobs processing-timeout: {JobId}", jobId);
                            return;
                        }
                    }
                    else
                    {
                        var generatedBase64 = await _comfyUIService.GenerateImageAsync(imageBase64, fullPrompt);
                        var resizedBase64 = ResizeGeneratedBase64(generatedBase64, targetWidth, targetHeight, originalAvatar.ContentType);
                        var avatarId = await StoreGeneratedAvatarAsync(request, originalAvatar, label, resizedBase64, fullPrompt);
                        generatedAvatarIds.Add(avatarId);
                        // Always upsert per emotion; no delete needed.
                    }

                    var progress = (int)((i + 1) / (double)totalCount * 100);
                    var updateProgress = Builders<ImageGenerationJob>.Update.Set(j => j.Progress, progress);
                    await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateProgress);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to generate {Label} avatar for job {JobId}", label, jobId);
                }
            }

            // Update job as completed
            var resultsToReturn = generatedAvatarIds;
            if (request.GenerationType == "emotions" && !string.IsNullOrWhiteSpace(request.Emotion))
            {
                resultsToReturn = generatedAvatarIds.Count > 0
                    ? new List<string> { generatedAvatarIds[^1] }
                    : new List<string>();
            }

            var updateComplete = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "completed")
                .Set(j => j.Progress, 100)
                .Set(j => j.Results, new GenerationResults { AvatarImageIds = resultsToReturn })
                .Set(j => j.CompletedAt, DateTime.UtcNow);

            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateComplete);
            _logger.LogInformation("Mongo update imageGenerationJobs completed: {JobId}", jobId);

            _logger.LogInformation("Avatar generation completed for job {JobId}", jobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Avatar generation failed for job {JobId}", jobId);

            var updateFailed = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "failed")
                .Set(j => j.ErrorMessage, ex.Message)
                .Set(j => j.CompletedAt, DateTime.UtcNow);

            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateFailed);
            _logger.LogWarning("Mongo update imageGenerationJobs failed: {JobId}", jobId);
        }
    }

    private async Task<string> StoreGeneratedAvatarAsync(GenerationRequest request, AvatarImage originalAvatar, string label, string generatedBase64, string fullPrompt)
    {
        var bytes = Convert.FromBase64String(generatedBase64);
        byte[] thumbnailData;
        string thumbnailContentType;
        try
        {
            thumbnailData = ImageResizer.GenerateThumbnail(bytes);
            thumbnailContentType = "image/webp";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate thumbnail for {Label} avatar", label);
            thumbnailData = bytes;
            thumbnailContentType = originalAvatar.ContentType;
        }

        var normalizedLabel = label.Trim().ToLowerInvariant();
        var fileName = $"{normalizedLabel}_{originalAvatar.FileName}";
        var now = DateTime.UtcNow;

        var filter = Builders<AvatarImage>.Filter.And(
            Builders<AvatarImage>.Filter.Eq(a => a.SourceAvatarId, request.AvatarId),
            Builders<AvatarImage>.Filter.Eq(a => a.ImageType, "emotion_generated"),
            Builders<AvatarImage>.Filter.Eq(a => a.Emotion, normalizedLabel));

        var update = Builders<AvatarImage>.Update
            .SetOnInsert(a => a.UserId, originalAvatar.UserId)
            .SetOnInsert(a => a.ImageType, "emotion_generated")
            .SetOnInsert(a => a.SourceAvatarId, request.AvatarId)
            .SetOnInsert(a => a.CreatedAt, now)
            .Set(a => a.Emotion, normalizedLabel)
            .Set(a => a.ImageData, bytes)
            .Set(a => a.ThumbnailData, thumbnailData)
            .Set(a => a.ThumbnailContentType, thumbnailContentType)
            .Set(a => a.ContentType, originalAvatar.ContentType)
            .Set(a => a.FileName, fileName)
            .Set(a => a.FileSize, bytes.Length)
            .Set(a => a.GenerationPrompt, fullPrompt)
            .Set(a => a.UpdatedAt, now);

        try
        {
            var options = new FindOneAndUpdateOptions<AvatarImage>
            {
                IsUpsert = true,
                ReturnDocument = ReturnDocument.After,
            };
            var updated = await _avatarImages.FindOneAndUpdateAsync(filter, update, options);
            if (updated == null)
            {
                throw new InvalidOperationException("Upsert returned null for generated avatar.");
            }

            _logger.LogWarning(
                "Mongo upsert generated {Label} avatar: {AvatarId}",
                normalizedLabel,
                updated.Id);
            return updated.Id;
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to upsert generated {Label} avatar in Mongo",
                normalizedLabel);
            throw;
        }
    }

    private async Task<ImageGenerationJob?> TryRecoverAvatarJobAsync(ImageGenerationJob job)
    {
        if (string.IsNullOrWhiteSpace(job.SourceRef.AvatarId) || string.IsNullOrWhiteSpace(job.Emotion))
        {
            return null;
        }

        if (job.CompletedAt != null
            || string.Equals(job.Status, "completed", StringComparison.OrdinalIgnoreCase)
            || (job.Results?.AvatarImageIds?.Count ?? 0) > 0)
        {
            return job;
        }

        var normalizedEmotion = job.Emotion.Trim().ToLowerInvariant();
        var existingFilter = Builders<AvatarImage>.Filter.And(
            Builders<AvatarImage>.Filter.Eq(a => a.SourceAvatarId, job.SourceRef.AvatarId),
            Builders<AvatarImage>.Filter.Eq(a => a.ImageType, "emotion_generated"),
            Builders<AvatarImage>.Filter.Eq(a => a.Emotion, normalizedEmotion),
            Builders<AvatarImage>.Filter.Gte(a => a.CreatedAt, job.CreatedAt));

        var existingAvatar = await _avatarImages
            .Find(existingFilter)
            .SortByDescending(a => a.CreatedAt)
            .FirstOrDefaultAsync();

        if (existingAvatar != null)
        {
            var updateComplete = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "completed")
                .Set(j => j.Progress, 100)
                .Set(j => j.Results, new GenerationResults { AvatarImageIds = new List<string> { existingAvatar.Id } })
                .Set(j => j.CompletedAt, DateTime.UtcNow)
                .Set(j => j.ErrorMessage, null);

            await _generationJobs.UpdateOneAsync(j => j.JobId == job.JobId, updateComplete);
            _logger.LogInformation("Mongo update imageGenerationJobs recovered-existing: {JobId}", job.JobId);
            return await _generationJobs.Find(j => j.JobId == job.JobId).FirstOrDefaultAsync();
        }

        var generatedBase64 = await _comfyUIService.TryFetchResultAsync(job.ComfyPromptId!);
        if (string.IsNullOrWhiteSpace(generatedBase64))
        {
            return null;
        }

        var originalAvatar = await _avatarImages.Find(a => a.Id == job.SourceRef.AvatarId).FirstOrDefaultAsync();
        if (originalAvatar == null)
        {
            return null;
        }

        var avatarId = await StoreGeneratedAvatarAsync(new GenerationRequest
        {
            UserId = job.UserId,
            AvatarId = job.SourceRef.AvatarId,
            Emotion = job.Emotion
        }, originalAvatar, job.Emotion, generatedBase64, job.Prompt);

        // Always upsert per emotion; no delete needed.

        var updateCompleteRecovered = Builders<ImageGenerationJob>.Update
            .Set(j => j.Status, "completed")
            .Set(j => j.Progress, 100)
            .Set(j => j.Results, new GenerationResults { AvatarImageIds = new List<string> { avatarId } })
            .Set(j => j.CompletedAt, DateTime.UtcNow)
            .Set(j => j.ErrorMessage, null);

        await _generationJobs.UpdateOneAsync(j => j.JobId == job.JobId, updateCompleteRecovered);
        _logger.LogInformation("Mongo update imageGenerationJobs recovered-complete: {JobId}", job.JobId);
        return await _generationJobs.Find(j => j.JobId == job.JobId).FirstOrDefaultAsync();
    }

    private async Task ProcessChatImageGenerationAsync(string jobId, GenerationRequest request)
    {
        try
        {
            var job = await _generationJobs.Find(j => j.JobId == jobId).FirstOrDefaultAsync();
            if (job == null)
            {
                throw new InvalidOperationException($"Image generation job not found: {jobId}");
            }

            // Update status to processing
            var updateStatus = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "processing")
                .Set(j => j.Progress, 0);
            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateStatus);
            _logger.LogInformation("Mongo update imageGenerationJobs chat processing: {JobId}", jobId);

            // Resolve source (for naming) and input (for editing)
            var message = await _messages.Find(m => m.Id == request.MessageId).FirstOrDefaultAsync();
            var sourceUrl = job.SourceRef.OriginalMediaUrl
                ?? message?.Content?.MediaUrl
                ?? message?.Content?.ThumbnailUrl
                ?? request.MediaUrl;
            if (string.IsNullOrWhiteSpace(sourceUrl))
            {
                throw new InvalidOperationException("Missing source media URL for chat image generation.");
            }

            var inputUrl = request.MediaUrl ?? sourceUrl;
            var sourceImage = await ResolveImageSourceAsync(sourceUrl);
            Directory.CreateDirectory(sourceImage.DirectoryPath);
            var inputImage = string.Equals(inputUrl, sourceUrl, StringComparison.OrdinalIgnoreCase)
                ? sourceImage
                : await ResolveImageSourceAsync(inputUrl);

            var imageBytes = inputImage.Bytes;
            var (targetWidth, targetHeight) = ImageResizer.GetScaledDimensions(imageBytes, 1024);
            var normalizedPrimaryBytes = ImageResizer.NormalizeToPng(imageBytes);
            var imageBase64 = Convert.ToBase64String(normalizedPrimaryBytes);
            string? secondaryImageBase64 = null;
            ResolvedImageSource? secondarySource = null;

            if (!string.IsNullOrWhiteSpace(request.SecondaryMediaUrl))
            {
                secondarySource = await ResolveImageSourceAsync(request.SecondaryMediaUrl);
                var secondaryImageBytes = secondarySource.Bytes;
                var normalizedSecondaryBytes = ImageResizer.NormalizeToPng(secondaryImageBytes);
                secondaryImageBase64 = Convert.ToBase64String(normalizedSecondaryBytes);
            }

            // Determine prompts
            var prompts = GetPrompts(request.GenerationType, request.CustomPrompts, null, BaseEmotionTypes);
            var generatedUrls = new List<string>();

            // Two naming cases:
            //
            // Case 2 — chat /p pairing (no MessageId, has secondary):
            //   primary avatar A + secondary avatar B
            //   first take      -> A_B.{ext}
            //   subsequent take -> A_B-1, A_B-2, ...
            //   These are siblings, not parent/child. The "-N" separator is
            //   used (instead of "_N") so a later case-1 edit of A_B-2 lives
            //   in its own namespace as A_B-2_1, A_B-2_2, ...
            //
            // Case 1 — lightbox edit (has MessageId, secondary optional):
            //   strip the trailing "_N" from the source stem to find the
            //   namespace, then continue numbering inside it:
            //     A_5     -> namespace "A"     -> A_6, A_7, ...
            //     A_B-3   -> namespace "A_B-3" -> A_B-3_1, A_B-3_2, ...
            //     A_B-3_2 -> namespace "A_B-3" -> A_B-3_3, A_B-3_4, ...
            //   The secondary reference image does not affect filenames here.
            var isPairCase = string.IsNullOrWhiteSpace(request.MessageId)
                && secondarySource != null
                && !string.IsNullOrWhiteSpace(secondarySource.FileStem);

            string filePrefix;
            string? pairBaseName = null;
            if (isPairCase)
            {
                pairBaseName = CombineFileStems(sourceImage.FileStem, secondarySource!.FileStem);
                filePrefix = string.IsNullOrWhiteSpace(pairBaseName)
                    ? sourceImage.FileStem
                    : pairBaseName;
            }
            else
            {
                filePrefix = StripTrailingEditIndex(sourceImage.FileStem);
            }
            if (string.IsNullOrWhiteSpace(filePrefix))
            {
                filePrefix = sourceImage.FileStem;
            }
            var fileExtension = sourceImage.Extension;
            var totalCount = prompts.Count;
            var failureMessages = new List<string>();

            for (int i = 0; i < totalCount; i++)
            {
                var (label, prompt) = prompts[i];

                try
                {
                    _logger.LogInformation("Generating variation {Index}/{Total} for job {JobId}", i + 1, totalCount, jobId);

                    // Generate via ComfyUI
                    var fullPrompt = $"Edit the input image with the following instruction: {prompt}. Preserve the original proportions. High quality, detailed.";
                    var extraPrompt = request.ExtraPrompt?.Trim();
                    if (!string.IsNullOrWhiteSpace(extraPrompt))
                    {
                        fullPrompt = $"{fullPrompt} {extraPrompt}";
                    }
                    var generatedBase64 = await _comfyUIService.GenerateImageAsync(imageBase64, fullPrompt, secondaryImageBase64);

                    // Save to file system
                    string generatedFileName;
                    if (isPairCase && pairBaseName != null)
                    {
                        // First take is `A_B.ext` (no suffix). Subsequent takes
                        // are `A_B-1.ext`, `A_B-2.ext`, ... — siblings, not
                        // descendants, so the dash separator is used.
                        var nextPairTake = GetNextPairTakeIndex(sourceImage.DirectoryPath, pairBaseName, fileExtension);
                        generatedFileName = nextPairTake == 0
                            ? $"{pairBaseName}{fileExtension}"
                            : $"{pairBaseName}-{nextPairTake}{fileExtension}";
                    }
                    else
                    {
                        var nextIndex = GetNextGeneratedIndex(sourceImage.DirectoryPath, filePrefix, fileExtension);
                        generatedFileName = $"{filePrefix}_{nextIndex}{fileExtension}";
                    }
                    var generatedFilePath = Path.Combine(sourceImage.DirectoryPath, generatedFileName);

                    var generatedBytes = Convert.FromBase64String(generatedBase64);
                    generatedBytes = ImageResizer.ResizeToExact(generatedBytes, targetWidth, targetHeight, fileExtension);
                    await File.WriteAllBytesAsync(generatedFilePath, generatedBytes);

                    var generatedUrl = $"{sourceImage.UrlDirectory.TrimEnd('/')}/{Uri.EscapeDataString(generatedFileName)}";
                    generatedUrls.Add(generatedUrl);

                    // Update progress
                    var progress = (int)((i + 1) / (double)totalCount * 100);
                    var updateProgress = Builders<ImageGenerationJob>.Update.Set(j => j.Progress, progress);
                    await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateProgress);

                    _logger.LogInformation("Generated variation {Index}: {Url}", i + 1, generatedUrl);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to generate variation {Index} for job {JobId}", i + 1, jobId);
                    failureMessages.Add(ex.Message);
                }
            }

            if (generatedUrls.Count == 0)
            {
                var combinedError = failureMessages.Count > 0
                    ? string.Join(" | ", failureMessages.Distinct(StringComparer.Ordinal))
                    : "No images were generated.";

                var updateFailed = Builders<ImageGenerationJob>.Update
                    .Set(j => j.Status, "failed")
                    .Set(j => j.ErrorMessage, combinedError)
                    .Set(j => j.CompletedAt, DateTime.UtcNow);

                await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateFailed);
                _logger.LogWarning("Mongo update imageGenerationJobs chat failed-empty: {JobId}", jobId);
                return;
            }

            // Update job as completed
            var updateComplete = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "completed")
                .Set(j => j.Progress, 100)
                .Set(j => j.Results, new GenerationResults { GeneratedUrls = generatedUrls })
                .Set(j => j.ErrorMessage, failureMessages.Count > 0 ? string.Join(" | ", failureMessages.Distinct(StringComparer.Ordinal)) : null)
                .Set(j => j.CompletedAt, DateTime.UtcNow);

            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateComplete);
            _logger.LogInformation("Mongo update imageGenerationJobs chat completed: {JobId}", jobId);

            _logger.LogInformation("Chat image generation completed for job {JobId}", jobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Chat image generation failed for job {JobId}", jobId);

            var updateFailed = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "failed")
                .Set(j => j.ErrorMessage, ex.Message)
                .Set(j => j.CompletedAt, DateTime.UtcNow);

            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateFailed);
            _logger.LogWarning("Mongo update imageGenerationJobs chat failed: {JobId}", jobId);
        }
    }

    private static IReadOnlyList<string> GetEmotionLabelsForAvatar(AvatarImage avatar)
    {
        return string.Equals(avatar.UserId, "system_predefined", StringComparison.OrdinalIgnoreCase)
            ? BaseEmotionTypes
            : BaseEmotionTypes.Concat(ExtraEmotionTypes).ToList();
    }

    private async Task<bool> IsUserAvatarAsync(string sourceAvatarId)
    {
        var projection = Builders<AvatarImage>.Projection
            .Include(a => a.Id)
            .Include(a => a.UserId);

        var avatar = await _avatarImages
            .Find(a => a.Id == sourceAvatarId)
            .Project<AvatarImage>(projection)
            .FirstOrDefaultAsync();

        if (avatar == null)
        {
            return false;
        }

        return !string.Equals(avatar.UserId, "system_predefined", StringComparison.OrdinalIgnoreCase);
    }

    private List<(string label, string prompt)> GetPrompts(
        string generationType,
        List<string>? customPrompts,
        string? emotion,
        IReadOnlyList<string> emotionLabels)
    {
        if (generationType == "emotions" && !string.IsNullOrWhiteSpace(emotion))
        {
            var selected = emotion.Trim().ToLowerInvariant();
            if (emotionLabels.Contains(selected))
            {
                return new List<(string, string)>
                {
                    (selected, selected)
                };
            }
        }

        return generationType switch
        {
            "emotions" => emotionLabels.Select(e => (e, e))
                .ToList(),
            "styles" => customPrompts?.Select(p => (p, $"in {p} style")).ToList() ?? new List<(string, string)>
            {
                ("anime", "in anime style"),
                ("oil painting", "as oil painting"),
                ("3D render", "as 3D render"),
                ("watercolor", "as watercolor painting"),
                ("sketch", "as pencil sketch"),
                ("realistic", "in photorealistic style"),
                ("cartoon", "in cartoon style"),
                ("vintage", "in vintage style"),
                ("cyberpunk", "in cyberpunk style")
            },
            "variations" => Enumerable.Range(1, customPrompts?.Count ?? 9)
                .Select(i => ($"variation_{i}", "creative variation"))
                .ToList(),
            "custom" => customPrompts?.Select(p => (p, p)).ToList() ?? new List<(string, string)>(),
            _ => new List<(string, string)>()
        };
    }

    private static string ResizeGeneratedBase64(string generatedBase64, int targetWidth, int targetHeight, string? contentType)
    {
        var bytes = Convert.FromBase64String(generatedBase64);
        var resized = ImageResizer.ResizeToExact(bytes, targetWidth, targetHeight, contentType);
        return Convert.ToBase64String(resized);
    }

    private async Task<ResolvedImageSource> ResolveImageSourceAsync(string url)
    {
        var normalizedPath = NormalizeAssetPath(url);

        if (TryExtractAvatarImageId(normalizedPath, out var avatarImageId))
        {
            var avatarImage = await _avatarImages.Find(a => a.Id == avatarImageId).FirstOrDefaultAsync();
            if (avatarImage?.ImageData == null || avatarImage.ImageData.Length == 0)
            {
                throw new FileNotFoundException($"Avatar image not found: {avatarImageId}");
            }

            return new ResolvedImageSource
            {
                Bytes = avatarImage.ImageData,
                FileStem = avatarImageId,
                Extension = GetExtensionFromContentType(avatarImage.ContentType),
                DirectoryPath = GetUploadsPath(),
                UrlDirectory = "/uploads"
            };
        }

        var filePath = ResolveStaticAssetFilePath(normalizedPath);
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"Source image not found: {filePath}");
        }

        var fileName = Path.GetFileName(filePath);
        var extension = Path.GetExtension(fileName);
        var directoryPath = Path.GetDirectoryName(filePath) ?? GetUploadsPath();
        return new ResolvedImageSource
        {
            Bytes = await File.ReadAllBytesAsync(filePath),
            FileStem = Path.GetFileNameWithoutExtension(fileName),
            Extension = string.IsNullOrWhiteSpace(extension) ? ".png" : extension,
            DirectoryPath = directoryPath,
            UrlDirectory = GetUrlDirectoryFromFilePath(directoryPath)
        };
    }

    private string ResolveStaticAssetFilePath(string normalizedPath)
    {
        var trimmedPath = normalizedPath.Trim();
        var webRootPath = GetWebRootPath();

        if (trimmedPath.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
        {
            return ResolveWebRootSubPath(webRootPath, trimmedPath, "/uploads/");
        }

        if (trimmedPath.StartsWith("/standing/", StringComparison.OrdinalIgnoreCase))
        {
            return ResolveWebRootSubPath(webRootPath, trimmedPath, "/standing/");
        }

        if (trimmedPath.StartsWith("/photos/", StringComparison.OrdinalIgnoreCase))
        {
            var fileName = GetFileNameFromUrl(trimmedPath);
            return Path.Combine(webRootPath, "uploads", "receipts", fileName);
        }

        var fallbackFileName = GetFileNameFromUrl(trimmedPath);
        return Path.Combine(webRootPath, "uploads", fallbackFileName);
    }

    private static string ResolveWebRootSubPath(string webRootPath, string normalizedPath, string routePrefix)
    {
        var relativePath = normalizedPath.Substring(routePrefix.Length).TrimStart('/', '\\');
        var queryIndex = relativePath.IndexOfAny(new[] { '?', '#' });
        if (queryIndex >= 0)
        {
            relativePath = relativePath.Substring(0, queryIndex);
        }

        relativePath = Uri.UnescapeDataString(relativePath).Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar);
        var rootFolder = routePrefix.Trim('/');
        var combinedPath = Path.GetFullPath(Path.Combine(webRootPath, rootFolder, relativePath));
        var allowedRoot = Path.GetFullPath(Path.Combine(webRootPath, rootFolder));

        if (!combinedPath.StartsWith(allowedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(combinedPath, allowedRoot, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Invalid image path.");
        }

        return combinedPath;
    }

    private static string NormalizeAssetPath(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var absoluteUri))
        {
            return absoluteUri.AbsolutePath;
        }

        var queryIndex = url.IndexOfAny(new[] { '?', '#' });
        return queryIndex >= 0 ? url.Substring(0, queryIndex) : url;
    }

    private static bool TryExtractAvatarImageId(string path, out string avatarImageId)
    {
        avatarImageId = string.Empty;
        const string prefix = "/api/avatar/image/";

        if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var remainder = path.Substring(prefix.Length);
        if (string.IsNullOrWhiteSpace(remainder))
        {
            return false;
        }

        var slashIndex = remainder.IndexOf('/');
        if (slashIndex >= 0)
        {
            remainder = remainder.Substring(0, slashIndex);
        }

        var queryIndex = remainder.IndexOf('?');
        if (queryIndex >= 0)
        {
            remainder = remainder.Substring(0, queryIndex);
        }

        avatarImageId = remainder;
        return !string.IsNullOrWhiteSpace(avatarImageId) && !string.Equals(avatarImageId, "default", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetExtensionFromContentType(string? contentType)
    {
        return contentType?.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/jpg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ".png"
        };
    }

    private async Task<string?> ResolveOriginalMediaUrlAsync(string messageId, string? fallbackUrl)
    {
        var message = await _messages.Find(m => m.Id == messageId).FirstOrDefaultAsync();
        var mediaUrl = message?.Content?.MediaUrl;
        if (!string.IsNullOrWhiteSpace(mediaUrl))
        {
            return mediaUrl;
        }

        var thumbnailUrl = message?.Content?.ThumbnailUrl;
        if (!string.IsNullOrWhiteSpace(thumbnailUrl))
        {
            return thumbnailUrl;
        }

        var job = await _generationJobs
            .Find(j => j.SourceType == "chat_image" && j.SourceRef.MessageId == messageId && j.SourceRef.OriginalMediaUrl != null)
            .SortBy(j => j.CreatedAt)
            .FirstOrDefaultAsync();

        return job?.SourceRef?.OriginalMediaUrl ?? fallbackUrl;
    }
}
