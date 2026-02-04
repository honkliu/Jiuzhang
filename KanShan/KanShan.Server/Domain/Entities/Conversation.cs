namespace KanShan.Server.Domain.Entities;

public sealed class Conversation
{
    public Guid Id { get; set; }

    public ConversationType Type { get; set; }

    public string? Title { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<ConversationParticipant> Participants { get; set; } = new List<ConversationParticipant>();

    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
}
