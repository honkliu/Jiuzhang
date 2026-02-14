namespace KanKan.API.Models.Entities;

public class ChatUser
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "chat_user";
    public string UserId { get; set; } = string.Empty;
    public string ChatId { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string ChatType { get; set; } = "direct";
    public List<ChatParticipant> Participants { get; set; } = new();
    public string? GroupName { get; set; }
    public string? GroupAvatar { get; set; }
    public List<string> AdminIds { get; set; } = new();
    public ChatLastMessage? LastMessage { get; set; }
    public bool IsHidden { get; set; }
    public DateTime? ClearedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
