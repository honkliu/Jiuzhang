namespace WeChat.API.Models.Entities;

public class Message
{
    public string Id { get; set; } = string.Empty;
    public string ChatId { get; set; } = string.Empty;
    public string Type { get; set; } = "message";
    public string SenderId { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string SenderAvatar { get; set; } = string.Empty;
    public string MessageType { get; set; } = "text"; // text, image, video, voice, file
    public MessageContent Content { get; set; } = new();
    public string? ReplyTo { get; set; }
    public DateTime Timestamp { get; set; }
    public List<string> DeliveredTo { get; set; } = new();
    public List<string> ReadBy { get; set; } = new();
    public Dictionary<string, string> Reactions { get; set; } = new();
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public int? Ttl { get; set; }
}

public class MessageContent
{
    public string? Text { get; set; }
    public string? MediaUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public int? Duration { get; set; } // for voice/video in seconds
    public string? FileName { get; set; } // for files
    public string? FileSize { get; set; } // for files
}
