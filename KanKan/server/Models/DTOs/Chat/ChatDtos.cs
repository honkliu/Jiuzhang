using System.ComponentModel.DataAnnotations;

namespace KanKan.API.Models.DTOs.Chat;

public class ChatDto
{
    public string Id { get; set; } = string.Empty;
    public string ChatType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;  // Display name (other user for direct, group name for group)
    public string Avatar { get; set; } = string.Empty; // Display avatar
    public List<ParticipantDto> Participants { get; set; } = new();
    public List<string> AdminIds { get; set; } = new();
    public LastMessageDto? LastMessage { get; set; }
    public int UnreadCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ParticipantDto
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public string Gender { get; set; } = "male";
    public bool IsOnline { get; set; }
}

public class LastMessageDto
{
    public string Text { get; set; } = string.Empty;
    public string SenderId { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string MessageType { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

public class CreateChatRequest
{
    public string? ChatType { get; set; } = "direct"; // direct or group

    [Required]
    public List<string> ParticipantIds { get; set; } = new();

    public string? GroupName { get; set; }
    public string? GroupAvatar { get; set; }
}

public class UpdateChatRequest
{
    public string? GroupName { get; set; }
    public string? GroupAvatar { get; set; }
}

public class MessageDto
{
    public string Id { get; set; } = string.Empty;
    public string ChatId { get; set; } = string.Empty;
    public string SenderId { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string SenderAvatar { get; set; } = string.Empty;
    public string SenderGender { get; set; } = "male";
    public string MessageType { get; set; } = string.Empty;
    public string? Text { get; set; }
    public string? MediaUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public int? Duration { get; set; }
    public string? FileName { get; set; }
    public string? FileSize { get; set; }
    public string? ReplyTo { get; set; }
    public DateTime Timestamp { get; set; }
    public List<string> DeliveredTo { get; set; } = new();
    public List<string> ReadBy { get; set; } = new();
    public Dictionary<string, string> Reactions { get; set; } = new();
    public bool IsDeleted { get; set; }
}

public class SendMessageDto
{
    public string ChatId { get; set; } = string.Empty;

    public string? MessageType { get; set; } = "text";
    public string? Text { get; set; }
    public string? MediaUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public int? Duration { get; set; }
    public string? FileName { get; set; }
    public string? FileSize { get; set; }
    public string? ReplyTo { get; set; }
}
