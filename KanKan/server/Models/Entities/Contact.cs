namespace WeChat.API.Models.Entities;

public class Contact
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Type { get; set; } = "contact";
    public string ContactId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Remark { get; set; }
    public string Status { get; set; } = "pending"; // pending, accepted, blocked
    public DateTime AddedAt { get; set; }
    public List<string> Tags { get; set; } = new();
    public bool IsFavorite { get; set; }
    public DateTime LastInteraction { get; set; }
}
