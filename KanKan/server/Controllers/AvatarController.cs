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
        try
        {
            if (size == "thumbnail")
            {
                var thumbnail = await _avatarService.GetAvatarThumbnailAsync(avatarImageId);
                if (thumbnail?.ThumbnailData != null && thumbnail.ThumbnailData.Length > 0)
                {
                    sw.Stop();
                    _logger.LogDebug("Avatar {AvatarImageId} thumbnail {Bytes}B in {ElapsedMs}ms", avatarImageId, thumbnail.ThumbnailData.Length, sw.ElapsedMilliseconds);
                    return File(thumbnail.ThumbnailData, thumbnail.ThumbnailContentType ?? "image/webp");
                }

                _logger.LogWarning("Avatar {AvatarImageId} thumbnail missing, falling back to full image", avatarImageId);
            }

            var avatarImage = await _avatarService.GetAvatarImageAsync(avatarImageId);
            if (avatarImage == null || avatarImage.ImageData == null || avatarImage.ImageData.Length == 0)
                return NotFound();

            sw.Stop();
            _logger.LogDebug("Avatar {AvatarImageId} full {Bytes}B in {ElapsedMs}ms", avatarImageId, avatarImage.ImageData.Length, sw.ElapsedMilliseconds);
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
    public async Task<IActionResult> GetSelectableAvatars([FromQuery] int page = 0, [FromQuery] int pageSize = 12, [FromQuery] bool includeFull = false)
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var (items, totalCount) = await _avatarService.GetSelectableAvatarsAsync(userId, page, pageSize, includeFull, includeCount: !includeFull);

            var result = items.Select(a => new
            {
                avatarImageId = a.Id,
                imageUrl = $"/api/avatar/image/{a.Id}?size=thumbnail", // Fallback URL
                thumbnailDataUrl = a.ThumbnailData != null && a.ThumbnailData.Length > 0
                    ? $"data:{a.ThumbnailContentType ?? "image/webp"};base64,{Convert.ToBase64String(a.ThumbnailData)}"
                    : null, // Inline base64 thumbnail
                fullImageDataUrl = includeFull && a.ImageData != null && a.ImageData.Length > 0
                    ? $"data:{a.ContentType};base64,{Convert.ToBase64String(a.ImageData)}"
                    : null, // Inline base64 full image (only when requested)
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
    public async Task<IActionResult> GetEmotionThumbnails(string sourceAvatarId, [FromQuery] bool includeFull = false)
    {
        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();

            if (string.IsNullOrWhiteSpace(sourceAvatarId))
                return BadRequest(new { message = "sourceAvatarId is required" });

            var avatars = await _avatarService.GetEmotionThumbnailsBySourceAvatarIdAsync(sourceAvatarId, includeFull);
            var emotionLabels = await _avatarService.GetEmotionLabelsBySourceAvatarIdAsync(sourceAvatarId);

            var results = new List<object>();
            foreach (var avatar in avatars.Where(a => !string.IsNullOrWhiteSpace(a.Emotion)))
            {
                string? thumbnailDataUrl = avatar.ThumbnailData?.Length > 0
                    ? $"data:{avatar.ThumbnailContentType ?? "image/webp"};base64,{Convert.ToBase64String(avatar.ThumbnailData)}"
                    : null;

                string? fullImageDataUrl = includeFull && avatar.ImageData?.Length > 0
                    ? $"data:{avatar.ContentType};base64,{Convert.ToBase64String(avatar.ImageData)}"
                    : null;

                results.Add(new
                {
                    avatarImageId = avatar.Id,
                    emotion = avatar.Emotion,
                    imageUrl = $"/api/avatar/image/{avatar.Id}",
                    thumbnailDataUrl,
                    fullImageDataUrl,
                });
            }

            sw.Stop();
            _logger.LogInformation(
                "EmotionThumbnails {SourceAvatarId} includeFull={IncludeFull} count={Count} elapsedMs={ElapsedMs}",
                sourceAvatarId, includeFull, results.Count, sw.ElapsedMilliseconds);

            return Ok(new
            {
                sourceAvatarId,
                emotions = emotionLabels,
                count = results.Count,
                results
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve emotion thumbnails for {SourceAvatarId}", sourceAvatarId);
            return StatusCode(500, new { message = "Failed to retrieve emotion thumbnails" });
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
