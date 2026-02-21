using KanKan.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ImageGenerationController : ControllerBase
{
    private readonly IImageGenerationService _imageGenerationService;
    private readonly ILogger<ImageGenerationController> _logger;

    public ImageGenerationController(
        IImageGenerationService imageGenerationService,
        ILogger<ImageGenerationController> logger)
    {
        _imageGenerationService = imageGenerationService;
        _logger = logger;
    }

    /// <summary>
    /// Unified endpoint for all image generation tasks
    /// </summary>
    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] UnifiedGenerationRequest request)
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            // Validate request
            if (string.IsNullOrEmpty(request.SourceType))
                return BadRequest(new { message = "SourceType is required (avatar or chat_image)" });

            if (string.IsNullOrEmpty(request.GenerationType))
                return BadRequest(new { message = "GenerationType is required (emotions, styles, variations, custom)" });

            if (request.SourceType == "avatar" && string.IsNullOrEmpty(request.AvatarId))
                return BadRequest(new { message = "AvatarId is required for avatar generation" });

            if (request.SourceType == "chat_image" && (string.IsNullOrEmpty(request.MessageId) || string.IsNullOrEmpty(request.MediaUrl)))
                return BadRequest(new { message = "MessageId and MediaUrl are required for chat image generation" });

            // Call unified service
            var jobId = await _imageGenerationService.GenerateAsync(new GenerationRequest
            {
                UserId = userId,
                SourceType = request.SourceType,
                AvatarId = request.AvatarId,
                MessageId = request.MessageId,
                MediaUrl = request.MediaUrl,
                GenerationType = request.GenerationType,
                Emotion = request.Emotion,
                Mode = request.Mode,
                VariationCount = request.VariationCount,
                CustomPrompts = request.CustomPrompts,
                ExtraPrompt = request.ExtraPrompt
            });

            return Ok(new
            {
                jobId,
                status = "processing",
                message = "Generation started"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start image generation");
            return StatusCode(500, new { message = "Failed to start image generation" });
        }
    }

    [HttpGet("status/{jobId}")]
    public async Task<IActionResult> GetJobStatus(string jobId)
    {
        try
        {
            var job = await _imageGenerationService.GetJobStatusAsync(jobId);
            if (job == null)
                return NotFound(new { message = "Job not found" });

            return Ok(new
            {
                jobId = job.JobId,
                status = job.Status,
                progress = job.Progress,
                results = job.Results,
                errorMessage = job.ErrorMessage,
                createdAt = job.CreatedAt,
                completedAt = job.CompletedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve job status for {JobId}", jobId);
            return StatusCode(500, new { message = "Failed to retrieve job status" });
        }
    }

    [HttpGet("results/{sourceId}")]
    public async Task<IActionResult> GetResults(string sourceId, [FromQuery] string sourceType = "chat_image")
    {
        try
        {
            if (sourceType == "avatar")
            {
                var avatars = await _imageGenerationService.GetGeneratedAvatarsAsync(sourceId);
                return Ok(new
                {
                    sourceId,
                    sourceType = "avatar",
                    hasGenerations = avatars.Any(),
                    count = avatars.Count,
                    results = avatars
                });
            }
            else
            {
                var urls = await _imageGenerationService.GetVariationUrlsAsync(sourceId);
                return Ok(new
                {
                    sourceId,
                    sourceType = "chat_image",
                    hasGenerations = urls.Any(),
                    count = urls.Count,
                    results = urls
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve results for {SourceId}", sourceId);
            return StatusCode(500, new { message = "Failed to retrieve results" });
        }
    }
}

public class UnifiedGenerationRequest
{
    public string SourceType { get; set; } = string.Empty; // "avatar" | "chat_image"
    public string GenerationType { get; set; } = string.Empty; // "emotions" | "styles" | "variations" | "custom"

    // For avatar source
    public string? AvatarId { get; set; }

    // For chat_image source
    public string? MessageId { get; set; }
    public string? MediaUrl { get; set; }

    // Generation parameters
    public string? Emotion { get; set; }
    public string? Mode { get; set; } // "create" | "replace"
    public int VariationCount { get; set; } = 9;
    public List<string>? CustomPrompts { get; set; } // For custom generation types
    public string? ExtraPrompt { get; set; }
}

