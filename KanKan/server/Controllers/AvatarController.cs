using KanKan.API.Models;
using KanKan.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class AvatarController : ControllerBase
{
    private readonly IAvatarService _avatarService;
    private readonly ILogger<AvatarController> _logger;

    private static readonly string[] EmotionTypes =
    {
        "angry", "smile", "sad", "happy", "crying", "thinking", "surprised", "neutral", "excited"
    };

    public AvatarController(
        IAvatarService avatarService,
        ILogger<AvatarController> logger)
    {
        _avatarService = avatarService;
        _logger = logger;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB limit for avatars
    public async Task<IActionResult> UploadAvatar([FromForm] IFormFile file)
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided" });

            // Validate file type
            var allowedTypes = new[] { "image/jpeg", "image/jpg", "image/png", "image/webp" };
            if (!allowedTypes.Contains(file.ContentType.ToLower()))
                return BadRequest(new { message = "Only JPEG, PNG, and WebP images are allowed" });

            // Read file data
            byte[] imageData;
            using (var ms = new MemoryStream())
            {
                await file.CopyToAsync(ms);
                imageData = ms.ToArray();
            }

            var avatarImage = await _avatarService.UploadAvatarAsync(
                userId,
                imageData,
                file.ContentType,
                file.FileName);

            return Ok(new
            {
                avatarImageId = avatarImage.Id,
                imageUrl = $"/api/avatar/image/{avatarImage.Id}",
                fileName = avatarImage.FileName,
                fileSize = avatarImage.FileSize
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload avatar");
            return StatusCode(500, new { message = "Failed to upload avatar" });
        }
    }

    [HttpGet("image/{avatarImageId}")]
    [AllowAnonymous] // Allow public access to view avatars
    public async Task<IActionResult> GetAvatarImage(string avatarImageId, [FromQuery] string? size = null)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        _logger.LogInformation("Avatar request start {AvatarImageId} size={Size}", avatarImageId, size ?? "full");
        try
        {
            if (size == "thumbnail")
            {
                var thumbnail = await _avatarService.GetAvatarThumbnailAsync(avatarImageId);
                if (thumbnail?.ThumbnailData != null && thumbnail.ThumbnailData.Length > 0)
                {
                    var contentType = thumbnail.ThumbnailContentType ?? "image/webp";
                    sw.Stop();
                    _logger.LogInformation(
                        "Avatar request end {AvatarImageId} size=thumbnail bytes={Bytes} elapsedMs={ElapsedMs}",
                        avatarImageId,
                        thumbnail.ThumbnailData.Length,
                        sw.ElapsedMilliseconds);
                    return File(thumbnail.ThumbnailData, contentType);
                }

                _logger.LogInformation("Avatar thumbnail missing for {AvatarImageId}; falling back to full image", avatarImageId);
            }

            var avatarImage = await _avatarService.GetAvatarImageAsync(avatarImageId);
            if (avatarImage == null)
            {
                return NotFound();
            }

            sw.Stop();
            _logger.LogInformation(
                "Avatar request end {AvatarImageId} size=full bytes={Bytes} elapsedMs={ElapsedMs}",
                avatarImageId,
                avatarImage.ImageData.Length,
                sw.ElapsedMilliseconds);
            return File(avatarImage.ImageData, avatarImage.ContentType);
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Failed to retrieve avatar image {AvatarImageId}", avatarImageId);
            return StatusCode(500, new { message = "Failed to retrieve avatar image" });
        }
    }

    [HttpGet("predefined/{fileName}")]
    public async Task<IActionResult> GetPredefinedAvatar(string fileName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(fileName))
                return BadRequest(new { message = "File name is required" });

            var avatarImage = await _avatarService.GetPredefinedAvatarByFileNameAsync(fileName);
            if (avatarImage == null)
                return NotFound(new { message = "Predefined avatar not found" });

            return Ok(new
            {
                avatarImageId = avatarImage.Id,
                imageUrl = $"/api/avatar/image/{avatarImage.Id}",
                fileName = avatarImage.FileName,
                fileSize = avatarImage.FileSize
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve predefined avatar {FileName}", fileName);
            return StatusCode(500, new { message = "Failed to retrieve predefined avatar" });
        }
    }

    [HttpGet("originals")]
    public async Task<IActionResult> GetSelectableAvatars([FromQuery] int page = 0, [FromQuery] int pageSize = 12)
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var (items, totalCount) = await _avatarService.GetSelectableAvatarsAsync(userId, page, pageSize);

            var result = items.Select(a => new
            {
                avatarImageId = a.Id,
                imageUrl = $"/api/avatar/image/{a.Id}?size=thumbnail", // Fallback URL
                thumbnailDataUrl = a.ThumbnailData != null && a.ThumbnailData.Length > 0
                    ? $"data:{a.ThumbnailContentType ?? "image/webp"};base64,{Convert.ToBase64String(a.ThumbnailData)}"
                    : null, // Inline base64 thumbnail
                fullImageUrl = $"/api/avatar/image/{a.Id}", // Original image
                fileName = a.FileName,
                fileSize = a.FileSize,
                ownerUserId = a.UserId,
                createdAt = a.CreatedAt
            });

            return Ok(new
            {
                items = result,
                totalCount,
                page,
                pageSize
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve selectable avatars");
            return StatusCode(500, new { message = "Failed to retrieve avatars" });
        }
    }

    [HttpGet("emotion-thumbnails/{sourceAvatarId}")]
    public async Task<IActionResult> GetEmotionThumbnails(string sourceAvatarId)
    {
        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            _logger.LogInformation("Emotion thumbnails request start {SourceAvatarId}", sourceAvatarId);
            if (string.IsNullOrWhiteSpace(sourceAvatarId))
            {
                return BadRequest(new { message = "sourceAvatarId is required" });
            }

            var avatars = await _avatarService.GetEmotionThumbnailsBySourceAvatarIdAsync(sourceAvatarId);
            var results = avatars
                .Where(a => !string.IsNullOrWhiteSpace(a.Emotion))
                .Select(a => new
                {
                    avatarImageId = a.Id,
                    emotion = a.Emotion,
                    imageUrl = $"/api/avatar/image/{a.Id}",
                    thumbnailDataUrl = a.ThumbnailData != null && a.ThumbnailData.Length > 0
                        ? $"data:{a.ThumbnailContentType ?? "image/webp"};base64,{Convert.ToBase64String(a.ThumbnailData)}"
                        : null,
                })
                .ToList();

            sw.Stop();
            _logger.LogInformation(
                "Emotion thumbnails request end {SourceAvatarId} count={Count} elapsedMs={ElapsedMs}",
                sourceAvatarId,
                results.Count,
                sw.ElapsedMilliseconds);

            return Ok(new
            {
                sourceAvatarId,
                emotions = EmotionTypes,
                count = results.Count,
                results
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Emotion thumbnails request failed for {SourceAvatarId}", sourceAvatarId);
            _logger.LogError(ex, "Failed to retrieve emotion thumbnails for {SourceAvatarId}", sourceAvatarId);
            return StatusCode(500, new { message = "Failed to retrieve emotion thumbnails" });
        }
    }

    [HttpGet("{userId}/emotions")]
    public async Task<IActionResult> GetUserEmotionAvatars(string userId)
    {
        try
        {
            var emotions = await _avatarService.GetUserEmotionAvatarsAsync(userId);

            var result = emotions.Select(e => new
            {
                avatarImageId = e.Id,
                emotion = e.Emotion,
                imageUrl = $"/api/avatar/image/{e.Id}",
                sourceAvatarId = e.SourceAvatarId,
                createdAt = e.CreatedAt
            });

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve emotion avatars for user {UserId}", userId);
            return StatusCode(500, new { message = "Failed to retrieve emotion avatars" });
        }
    }

    [HttpDelete("{avatarImageId}")]
    public async Task<IActionResult> DeleteAvatar(string avatarImageId)
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            await _avatarService.DeleteAvatarAsync(avatarImageId);

            return Ok(new { message = "Avatar deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete avatar {AvatarImageId}", avatarImageId);
            return StatusCode(500, new { message = "Failed to delete avatar" });
        }
    }
}
