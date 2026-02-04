namespace KanShan.Server.Dtos;

public sealed record ConversationParticipantDto(
    Guid UserId,
    string UserName,
    string DisplayName,
    string Role);

public sealed record ConversationSummaryDto(
    Guid Id,
    string Type,
    string Title,
    IReadOnlyList<ConversationParticipantDto> Participants,
    MessageDto? LastMessage,
    int UnreadCount,
    DateTimeOffset CreatedAt);

public sealed record ConversationDto(
    Guid Id,
    string Type,
    string Title,
    IReadOnlyList<ConversationParticipantDto> Participants,
    DateTimeOffset CreatedAt);

public sealed record MessageDto(
    Guid Id,
    Guid ConversationId,
    Guid SenderUserId,
    string SenderDisplayName,
    string? Text,
    string? ImageUrl,
    string? ClientMessageId,
    bool IsRecalled,
    DateTimeOffset? RecalledAt,
    Guid? RecalledByUserId,
    DateTimeOffset CreatedAt);

public sealed record CreateDirectRequest(Guid OtherUserId);

public sealed record CreateGroupRequest(string Title, IReadOnlyList<Guid> MemberUserIds);

public sealed record AddMembersRequest(IReadOnlyList<Guid> MemberUserIds);

public sealed record SendMessageRequest(
    Guid ConversationId,
    string? Text,
    string? ImageUrl,
    string? ClientMessageId);

public sealed record MarkReadRequest(Guid ConversationId, Guid LastReadMessageId);

public sealed record UpdateGroupRequest(string Title);

public sealed record TransferOwnershipRequest(Guid NewOwnerUserId);
