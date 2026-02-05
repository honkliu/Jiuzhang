namespace KanKan.API.Models.Entities;

public class Notification
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "notification";

    // Partition key in Cosmos
    public string UserId { get; set; } = string.Empty;

    // notification categories: message, friend_request, pa, etc.
    public string Category { get; set; } = string.Empty;

    // Optional linkage
    public string? ChatId { get; set; }
    public string? MessageId { get; set; }
    public string? EntityId { get; set; }

    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;

    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadAt { get; set; }

    public int? Ttl { get; set; }
}
