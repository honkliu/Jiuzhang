namespace KanShan.Server.Domain.Entities;

public sealed class ChatMessage
{
    public Guid Id { get; set; }

    public Guid ConversationId { get; set; }

    public Conversation Conversation { get; set; } = null!;

    public Guid SenderUserId { get; set; }

    public AppUser Sender { get; set; } = null!;

    public string? Text { get; set; }

    public string? ImageUrl { get; set; }

    public string? ClientMessageId { get; set; }

    public bool IsRecalled { get; set; }

    public DateTimeOffset? RecalledAt { get; set; }

    public Guid? RecalledByUserId { get; set; }

    public bool IsDeleted { get; set; }

    public DateTimeOffset? DeletedAt { get; set; }

    public Guid? DeletedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
