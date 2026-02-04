namespace KanShan.Server.Domain.Entities;

public sealed class ConversationReadState
{
    public Guid ConversationId { get; set; }

    public Conversation Conversation { get; set; } = null!;

    public Guid UserId { get; set; }

    public AppUser User { get; set; } = null!;

    public Guid? LastReadMessageId { get; set; }

    public DateTimeOffset LastReadAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
