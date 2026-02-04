namespace KanShan.Server.Domain.Entities;

public sealed class AppUser
{
    public Guid Id { get; set; }

    public string UserName { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<ConversationParticipant> Conversations { get; set; } = new List<ConversationParticipant>();

    public ICollection<ChatMessage> MessagesSent { get; set; } = new List<ChatMessage>();
}
