using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using KanKan.API.Models.DTOs.Moment;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/pa")]
[Route("api/moments")]
public class MomentsController : ControllerBase
{
    private readonly IMomentRepository _momentRepository;
    private readonly IUserRepository _userRepository;
    private readonly ILogger<MomentsController> _logger;

    public MomentsController(
        IMomentRepository momentRepository,
        IUserRepository userRepository,
        ILogger<MomentsController> logger)
    {
        _momentRepository = momentRepository;
        _userRepository = userRepository;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
    private string GetUserName() => User.FindFirst(ClaimTypes.Name)?.Value ?? "";

    [HttpGet]
    public async Task<ActionResult<IEnumerable<MomentDto>>> GetMoments(
        [FromQuery] int limit = 50,
        [FromQuery] string? before = null)
    {
        try
        {
            DateTime? beforeDate = null;
            if (!string.IsNullOrEmpty(before) && DateTime.TryParse(before, out var parsedDate))
            {
                beforeDate = parsedDate;
            }

            var moments = await _momentRepository.GetFeedAsync(limit, beforeDate);
            var dtos = moments.Select(MapToMomentDto).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get moments");
            return StatusCode(500, new { message = "Failed to get moments" });
        }
    }

    [HttpPost]
    public async Task<ActionResult<MomentDto>> CreateMoment([FromBody] CreateMomentRequest request)
    {
        try
        {
            var userId = GetUserId();
            var userName = GetUserName();
            var user = await _userRepository.GetByIdAsync(userId);

            if (user == null)
                return BadRequest(new { message = "User not found" });

            var moment = new Moment
            {
                Id = $"moment_{Guid.NewGuid()}",
                UserId = userId,
                UserName = userName,
                UserAvatar = user.AvatarUrl ?? string.Empty,
                Content = new MomentContent
                {
                    Text = request.Text,
                    MediaUrls = request.MediaUrls,
                    Location = request.Location
                },
                Visibility = request.Visibility ?? "public",
                CreatedAt = DateTime.UtcNow,
                Likes = new List<MomentLike>(),
                Comments = new List<MomentComment>()
            };

            var created = await _momentRepository.CreateAsync(moment);
            return CreatedAtAction(nameof(GetMoments), new { }, MapToMomentDto(created));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create moment");
            return StatusCode(500, new { message = "Failed to create moment" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMoment(string id)
    {
        try
        {
            var userId = GetUserId();
            var moment = await _momentRepository.GetByIdAsync(id);

            if (moment == null)
                return NotFound(new { message = "Moment not found" });

            if (!string.Equals(moment.UserId, userId, StringComparison.Ordinal))
                return Forbid();

            await _momentRepository.DeleteAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete moment");
            return StatusCode(500, new { message = "Failed to delete moment" });
        }
    }

    [HttpPost("{id}/comments")]
    public async Task<ActionResult<MomentDto>> AddComment(string id, [FromBody] AddMomentCommentRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Text))
                return BadRequest(new { message = "Comment text is required" });

            var userId = GetUserId();
            var userName = GetUserName();
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
                return BadRequest(new { message = "User not found" });

            var moment = await _momentRepository.GetByIdAsync(id);
            if (moment == null)
                return NotFound(new { message = "Moment not found" });

            moment.Comments.Add(new MomentComment
            {
                Id = $"comment_{Guid.NewGuid():N}",
                UserId = userId,
                UserName = userName,
                UserAvatar = user.AvatarUrl ?? string.Empty,
                Text = request.Text.Trim(),
                Timestamp = DateTime.UtcNow
            });

            var updated = await _momentRepository.UpdateAsync(moment);
            return Ok(MapToMomentDto(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add moment comment");
            return StatusCode(500, new { message = "Failed to add comment" });
        }
    }

    [HttpPost("{id}/likes")]
    public async Task<ActionResult<MomentDto>> ToggleLike(string id)
    {
        try
        {
            var userId = GetUserId();
            var userName = GetUserName();
            var moment = await _momentRepository.GetByIdAsync(id);
            if (moment == null)
                return NotFound(new { message = "Moment not found" });

            var existing = moment.Likes.FirstOrDefault(l => l.UserId == userId);
            if (existing != null)
            {
                moment.Likes.Remove(existing);
            }
            else
            {
                moment.Likes.Add(new MomentLike
                {
                    UserId = userId,
                    UserName = userName,
                    Timestamp = DateTime.UtcNow
                });
            }

            var updated = await _momentRepository.UpdateAsync(moment);
            return Ok(MapToMomentDto(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle moment like");
            return StatusCode(500, new { message = "Failed to toggle like" });
        }
    }

    private static MomentDto MapToMomentDto(Moment moment)
    {
        return new MomentDto
        {
            Id = moment.Id,
            UserId = moment.UserId,
            UserName = moment.UserName,
            UserAvatar = moment.UserAvatar,
            Content = moment.Content,
            Visibility = moment.Visibility,
            CreatedAt = moment.CreatedAt,
            Likes = moment.Likes,
            Comments = moment.Comments
        };
    }
}
