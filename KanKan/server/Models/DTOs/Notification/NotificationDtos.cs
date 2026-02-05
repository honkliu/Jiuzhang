namespace KanKan.API.Models.DTOs.Notification;

public class NotificationDto
{
    public string Id { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string? ChatId { get; set; }
    public string? MessageId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadAt { get; set; }
}

public class MarkNotificationReadRequest
{
    public bool IsRead { get; set; } = true;
}
