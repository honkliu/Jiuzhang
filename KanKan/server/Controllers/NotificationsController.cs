using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using KanKan.API.Models.DTOs.Notification;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly INotificationRepository _notificationRepository;
    private readonly ILogger<NotificationsController> _logger;

    public NotificationsController(INotificationRepository notificationRepository, ILogger<NotificationsController> logger)
    {
        _notificationRepository = notificationRepository;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<NotificationDto>>> GetNotifications(
        [FromQuery] bool unreadOnly = false,
        [FromQuery] int limit = 50,
        [FromQuery] DateTime? before = null)
    {
        try
        {
            var userId = GetUserId();
            limit = Math.Clamp(limit, 1, 200);

            var items = await _notificationRepository.GetUserNotificationsAsync(userId, unreadOnly, limit, before);
            return Ok(items.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch notifications");
            return StatusCode(500, new { message = "Failed to fetch notifications" });
        }
    }

    [HttpGet("unread-count")]
    public async Task<ActionResult<int>> GetUnreadCount()
    {
        try
        {
            var userId = GetUserId();
            var count = await _notificationRepository.GetUnreadCountAsync(userId);
            return Ok(count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get unread notification count");
            return StatusCode(500, new { message = "Failed to get unread count" });
        }
    }

    [HttpPost("{notificationId}/read")]
    public async Task<IActionResult> MarkRead(string notificationId)
    {
        try
        {
            var userId = GetUserId();
            await _notificationRepository.MarkReadAsync(userId, notificationId);
            return Ok(new { ok = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to mark notification read");
            return StatusCode(500, new { message = "Failed to mark read" });
        }
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        try
        {
            var userId = GetUserId();
            await _notificationRepository.MarkAllReadAsync(userId);
            return Ok(new { ok = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to mark all notifications read");
            return StatusCode(500, new { message = "Failed to mark all read" });
        }
    }

    private string GetUserId()
    {
        var id = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrWhiteSpace(id))
            throw new InvalidOperationException("User not authenticated");
        return id;
    }

    private static NotificationDto MapToDto(Notification n)
    {
        return new NotificationDto
        {
            Id = n.Id,
            Category = n.Category,
            ChatId = n.ChatId,
            MessageId = n.MessageId,
            Title = n.Title,
            Body = n.Body,
            IsRead = n.IsRead,
            CreatedAt = n.CreatedAt,
            ReadAt = n.ReadAt
        };
    }
}
