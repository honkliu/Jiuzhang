namespace KanShan.Server.Domain.Entities;

public sealed class ConversationParticipant
{
    public Guid ConversationId { get; set; }

    public Conversation Conversation { get; set; } = null!;

    public Guid UserId { get; set; }

    public AppUser User { get; set; } = null!;

    public ConversationRole Role { get; set; }

    public DateTimeOffset JoinedAt { get; set; }
}
