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
        try
        {
            var avatarImage = await _avatarService.GetAvatarImageAsync(avatarImageId);
            if (avatarImage == null)
                return NotFound();

            // Return thumbnail if requested and available
            if (size == "thumbnail" && avatarImage.ThumbnailData != null && avatarImage.ThumbnailData.Length > 0)
            {
                var contentType = avatarImage.ThumbnailContentType ?? "image/webp";
                return File(avatarImage.ThumbnailData, contentType);
            }

            // Return original image
            return File(avatarImage.ImageData, avatarImage.ContentType);
        }
        catch (Exception ex)
        {
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

    // DEPRECATED: Use POST /api/imagegeneration/generate instead
    // Kept for backward compatibility
    [HttpPost("generate-emotions")]
    [Obsolete("Use POST /api/imagegeneration/generate with sourceType=avatar and generationType=emotions instead")]
    public async Task<IActionResult> GenerateEmotions([FromBody] GenerateEmotionsRequest request)
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            if (string.IsNullOrEmpty(request.AvatarId))
                return BadRequest(new { message = "Avatar ID is required" });

            // Redirect to unified endpoint
            _logger.LogWarning("Using deprecated endpoint /api/avatar/generate-emotions. Please use /api/imagegeneration/generate instead.");

            var jobId = await _avatarService.GenerateEmotionAvatarsAsync(userId, request.AvatarId);

            return Ok(new
            {
                jobId,
                status = "processing",
                message = "Emotion generation started (via deprecated endpoint, please migrate to /api/imagegeneration/generate)"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start emotion generation");
            return StatusCode(500, new { message = "Failed to start emotion generation" });
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

public class GenerateEmotionsRequest
{
    public string AvatarId { get; set; } = string.Empty;
}
