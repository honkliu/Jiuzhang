using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using WeChat.API.Models.DTOs.Moment;
using WeChat.API.Models.Entities;
using WeChat.API.Repositories.Interfaces;

namespace WeChat.API.Controllers;

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
