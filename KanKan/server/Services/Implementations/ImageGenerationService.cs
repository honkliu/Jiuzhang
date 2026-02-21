using KanKan.API.Models;
using KanKan.API.Models.Entities;
using KanKan.API.Utils;
using MongoDB.Bson;
using MongoDB.Driver;

namespace KanKan.API.Services.Implementations;

public class ImageGenerationService : IImageGenerationService
{
    private readonly IMongoCollection<ImageGenerationJob> _generationJobs;
    private readonly IMongoCollection<Message> _messages;
    private readonly IMongoCollection<AvatarImage> _avatarImages;
    private readonly IComfyUIService _comfyUIService;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<ImageGenerationService> _logger;

    private static readonly string[] EmotionTypes = new[]
    {
        "angry", "smile", "sad", "happy", "crying", "thinking", "surprised", "neutral", "excited"
    };

    public ImageGenerationService(
        IMongoDatabase database,
        IComfyUIService comfyUIService,
        IWebHostEnvironment environment,
        ILogger<ImageGenerationService> logger)
    {
        _generationJobs = database.GetCollection<ImageGenerationJob>("imageGenerationJobs");
        _messages = database.GetCollection<Message>("messages");
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
        var job = new ImageGenerationJob
        {
            JobId = Guid.NewGuid().ToString(),
            UserId = request.UserId,
            SourceType = request.SourceType,
            SourceRef = new SourceReference
            {
                AvatarId = request.AvatarId,
                MessageId = request.MessageId,
                OriginalMediaUrl = request.MediaUrl
            },
            GenerationType = request.GenerationType,
            Emotion = request.Emotion,
            Prompt = GetPromptDescription(request.GenerationType, request.CustomPrompts),
            Status = "pending",
            CreatedAt = DateTime.UtcNow
        };

        await _generationJobs.InsertOneAsync(job);

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

        if (job.Status == "processing" && job.SourceType == "avatar" && !string.IsNullOrWhiteSpace(job.ComfyPromptId))
        {
            var recovered = await TryRecoverAvatarJobAsync(job);
            if (recovered != null)
            {
                job = recovered;
            }
        }

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
            foreach (var emotion in EmotionTypes)
            {
                if (latestByEmotion.TryGetValue(emotion, out var avatar))
                {
                    ordered.Add(avatar);
                }
            }

            foreach (var extra in latestByEmotion)
            {
                if (!EmotionTypes.Contains(extra.Key))
                {
                    ordered.Add(extra.Value);
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
        return message?.GeneratedVariationsRef?.GeneratedImageUrls ?? new List<string>();
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

    private async Task ProcessAvatarGenerationAsync(string jobId, GenerationRequest request)
    {
        try
        {
            // Update status to processing
            var updateStatus = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "processing")
                .Set(j => j.Progress, 0);
            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateStatus);

            // Fetch original avatar from MongoDB
            var originalAvatar = await _avatarImages.Find(a => a.Id == request.AvatarId).FirstOrDefaultAsync();
            if (originalAvatar == null)
            {
                throw new Exception($"Avatar {request.AvatarId} not found");
            }

            var imageBase64 = Convert.ToBase64String(originalAvatar.ImageData);

            var shouldReplace = string.Equals(request.Mode, "replace", StringComparison.OrdinalIgnoreCase)
                || (string.IsNullOrEmpty(request.Mode) && request.GenerationType == "emotions");
            if (shouldReplace && !string.IsNullOrEmpty(request.AvatarId))
            {
                var filter = Builders<AvatarImage>.Filter.And(
                    Builders<AvatarImage>.Filter.Eq(a => a.SourceAvatarId, request.AvatarId),
                    Builders<AvatarImage>.Filter.Eq(a => a.ImageType, "emotion_generated"));

                if (!string.IsNullOrWhiteSpace(request.Emotion))
                {
                    filter = Builders<AvatarImage>.Filter.And(filter,
                        Builders<AvatarImage>.Filter.Eq(a => a.Emotion, request.Emotion));
                }

                await _avatarImages.DeleteManyAsync(filter);
            }

            // Determine prompts based on generation type
            var prompts = GetPrompts(request.GenerationType, request.CustomPrompts, request.Emotion);
            var generatedAvatarIds = new List<string>();
            var totalCount = prompts.Count;

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

                        try
                        {
                            var generatedBase64 = await _comfyUIService.FetchResultAsync(promptId);
                            var avatarId = await StoreGeneratedAvatarAsync(request, originalAvatar, label, generatedBase64, fullPrompt);
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
                            return;
                        }
                    }
                    else
                    {
                        var generatedBase64 = await _comfyUIService.GenerateImageAsync(imageBase64, fullPrompt);
                        var avatarId = await StoreGeneratedAvatarAsync(request, originalAvatar, label, generatedBase64, fullPrompt);
                        generatedAvatarIds.Add(avatarId);
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
            var updateComplete = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "completed")
                .Set(j => j.Progress, 100)
                .Set(j => j.Results, new GenerationResults { AvatarImageIds = generatedAvatarIds })
                .Set(j => j.CompletedAt, DateTime.UtcNow);

            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateComplete);

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

        var generatedAvatar = new AvatarImage
        {
            UserId = originalAvatar.UserId,
            ImageType = "emotion_generated",
            Emotion = label,
            ImageData = bytes,
            ThumbnailData = thumbnailData,
            ThumbnailContentType = thumbnailContentType,
            ContentType = originalAvatar.ContentType,
            FileName = $"{label}_{originalAvatar.FileName}",
            FileSize = bytes.Length,
            SourceAvatarId = request.AvatarId,
            GenerationPrompt = fullPrompt,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _avatarImages.InsertOneAsync(generatedAvatar);
        _logger.LogInformation("Generated {Label} avatar: {AvatarId}", label, generatedAvatar.Id);
        return generatedAvatar.Id;
    }

    private async Task<ImageGenerationJob?> TryRecoverAvatarJobAsync(ImageGenerationJob job)
    {
        if (string.IsNullOrWhiteSpace(job.SourceRef.AvatarId) || string.IsNullOrWhiteSpace(job.Emotion))
        {
            return null;
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

        var updateComplete = Builders<ImageGenerationJob>.Update
            .Set(j => j.Status, "completed")
            .Set(j => j.Progress, 100)
            .Set(j => j.Results, new GenerationResults { AvatarImageIds = new List<string> { avatarId } })
            .Set(j => j.CompletedAt, DateTime.UtcNow)
            .Set(j => j.ErrorMessage, null);

        await _generationJobs.UpdateOneAsync(j => j.JobId == job.JobId, updateComplete);
        return await _generationJobs.Find(j => j.JobId == job.JobId).FirstOrDefaultAsync();
    }

    private async Task ProcessChatImageGenerationAsync(string jobId, GenerationRequest request)
    {
        try
        {
            // Update status to processing
            var updateStatus = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "processing")
                .Set(j => j.Progress, 0);
            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateStatus);

            // Read original image from file system
            var uploadsPath = Path.Combine(_environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "uploads");
            var fileName = Path.GetFileName(request.MediaUrl!.TrimStart('/').Replace("uploads/", ""));
            var filePath = Path.Combine(uploadsPath, fileName);

            if (!File.Exists(filePath))
            {
                throw new FileNotFoundException($"Original image not found: {filePath}");
            }

            var imageBytes = await File.ReadAllBytesAsync(filePath);
            var imageBase64 = Convert.ToBase64String(imageBytes);

            // Create generated directory
            var generatedPath = Path.Combine(uploadsPath, "generated");
            Directory.CreateDirectory(generatedPath);

            // Determine prompts
            var prompts = GetPrompts(request.GenerationType, request.CustomPrompts, null);
            var generatedUrls = new List<string>();
            var filePrefix = Path.GetFileNameWithoutExtension(fileName);
            var fileExtension = Path.GetExtension(fileName);
            var totalCount = prompts.Count;

            for (int i = 0; i < totalCount; i++)
            {
                var (label, prompt) = prompts[i];

                try
                {
                    _logger.LogInformation("Generating variation {Index}/{Total} for job {JobId}", i + 1, totalCount, jobId);

                    // Generate via ComfyUI
                    var fullPrompt = $"{prompt}, high quality, detailed";
                    var generatedBase64 = await _comfyUIService.GenerateImageAsync(imageBase64, fullPrompt);

                    // Save to file system
                    var generatedFileName = $"{filePrefix}_var{i + 1}{fileExtension}";
                    var generatedFilePath = Path.Combine(generatedPath, generatedFileName);

                    var generatedBytes = Convert.FromBase64String(generatedBase64);
                    await File.WriteAllBytesAsync(generatedFilePath, generatedBytes);

                    var generatedUrl = $"/uploads/generated/{generatedFileName}";
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
                }
            }

            // Update message with generated variations
            var messageUpdate = Builders<Message>.Update.Set(m => m.GeneratedVariationsRef, new GeneratedVariationsRef
            {
                HasGenerations = true,
                GenerationCount = generatedUrls.Count,
                GeneratedImageUrls = generatedUrls
            });
            await _messages.UpdateOneAsync(m => m.Id == request.MessageId, messageUpdate);

            // Update job as completed
            var updateComplete = Builders<ImageGenerationJob>.Update
                .Set(j => j.Status, "completed")
                .Set(j => j.Progress, 100)
                .Set(j => j.Results, new GenerationResults { GeneratedUrls = generatedUrls })
                .Set(j => j.CompletedAt, DateTime.UtcNow);

            await _generationJobs.UpdateOneAsync(j => j.JobId == jobId, updateComplete);

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
        }
    }

    private List<(string label, string prompt)> GetPrompts(string generationType, List<string>? customPrompts, string? emotion)
    {
        if (generationType == "emotions" && !string.IsNullOrWhiteSpace(emotion))
        {
            var selected = emotion.Trim().ToLowerInvariant();
            if (EmotionTypes.Contains(selected))
            {
                return new List<(string, string)>
                {
                    (selected, selected)
                };
            }
        }

        return generationType switch
        {
            "emotions" => EmotionTypes.Select(e => (e, e))
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
}
