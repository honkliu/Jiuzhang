namespace WeChat.API.Models.Entities;

public class Chat
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "chat";
    public string ChatType { get; set; } = "direct"; // direct or group
    public List<ChatParticipant> Participants { get; set; } = new();
    public string? GroupName { get; set; }
    public string? GroupAvatar { get; set; }
    public List<string> AdminIds { get; set; } = new();
    public ChatLastMessage? LastMessage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ChatParticipant
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public DateTime JoinedAt { get; set; }
}

public class ChatLastMessage
{
    public string Text { get; set; } = string.Empty;
    public string SenderId { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string MessageType { get; set; } = "text";
    public DateTime Timestamp { get; set; }
}
