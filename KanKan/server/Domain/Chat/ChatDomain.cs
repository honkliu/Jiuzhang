using KanKan.API.Models.DTOs.Chat;
using KanKan.API.Models.Entities;

using ChatEntity = KanKan.API.Models.Entities.Chat;

namespace KanKan.API.Domain.Chat;

public static class ChatDomain
{
    public const string AgentUserId = "user_ai_wa";
    public const string AgentDisplayName = "Wa";

    public static bool IsAgentUserId(string? userId) =>
        string.Equals(userId, AgentUserId, StringComparison.Ordinal);

    public static IEnumerable<ChatParticipant> RealParticipants(IEnumerable<ChatParticipant> participants) =>
        participants.Where(p => !string.IsNullOrWhiteSpace(p.UserId) && !IsAgentUserId(p.UserId));

    public static IEnumerable<ChatParticipant> OtherRealParticipants(ChatEntity chat, string currentUserId) =>
        RealParticipants(chat.Participants).Where(p => !string.Equals(p.UserId, currentUserId, StringComparison.Ordinal));

    public static bool IsRealGroupChat(ChatEntity chat, string currentUserId) =>
        OtherRealParticipants(chat, currentUserId).Count() >= 2;

    public static ChatParticipant? GetDirectDisplayParticipant(ChatEntity chat, string currentUserId)
    {
        // Prefer the other real participant.
        var otherReal = OtherRealParticipants(chat, currentUserId).FirstOrDefault();
        if (otherReal != null) return otherReal;

        // Else prefer Wa.
        var wa = chat.Participants.FirstOrDefault(p => IsAgentUserId(p.UserId) && p.UserId != currentUserId);
        if (wa != null) return wa;

        // Defensive fallback: any other participant.
        return chat.Participants.FirstOrDefault(p => p.UserId != currentUserId);
    }

    public static string BuildGroupFallbackName(ChatEntity chat, string currentUserId)
    {
        var names = chat.Participants
            .Where(p => p.UserId != currentUserId && !IsAgentUserId(p.UserId))
            .Select(p => p.DisplayName)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .ToList();

        var shown = names.Take(4).ToList();
        var extra = names.Count - shown.Count;

        var displayName = string.Join(" · ", shown) + (extra > 0 ? $" +{extra}" : "");
        return string.IsNullOrWhiteSpace(displayName) ? "Group" : displayName;
    }

    public static string BuildGroupFallbackAvatar(ChatEntity chat, string currentUserId)
    {
        return chat.Participants
            .FirstOrDefault(p => p.UserId != currentUserId && !IsAgentUserId(p.UserId))?.AvatarUrl
            ?? chat.Participants.FirstOrDefault(p => p.UserId != currentUserId)?.AvatarUrl
            ?? string.Empty;
    }

    public static ChatDto ToChatDto(ChatEntity chat, string currentUserId, Func<string, bool> isUserOnline)
    {
        string displayName = chat.GroupName ?? string.Empty;
        string displayAvatar = chat.GroupAvatar ?? string.Empty;

        if (chat.ChatType == "direct")
        {
            var displayParticipant = GetDirectDisplayParticipant(chat, currentUserId);
            if (displayParticipant != null)
            {
                displayName = displayParticipant.DisplayName;
                displayAvatar = displayParticipant.AvatarUrl;
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(displayName))
            {
                displayName = BuildGroupFallbackName(chat, currentUserId);
            }

            if (string.IsNullOrWhiteSpace(displayAvatar))
            {
                displayAvatar = BuildGroupFallbackAvatar(chat, currentUserId);
            }
        }

        return new ChatDto
        {
            Id = chat.Id,
            ChatType = chat.ChatType,
            Name = displayName,
            Avatar = displayAvatar,
            AdminIds = chat.AdminIds ?? new List<string>(),
            Participants = chat.Participants.Select(p => new ParticipantDto
            {
                UserId = p.UserId,
                DisplayName = p.DisplayName,
                AvatarUrl = p.AvatarUrl,
                Gender = p.Gender,
                IsOnline = isUserOnline(p.UserId)
            }).ToList(),
            LastMessage = chat.LastMessage != null ? new LastMessageDto
            {
                Text = chat.LastMessage.Text,
                SenderId = chat.LastMessage.SenderId,
                SenderName = chat.LastMessage.SenderName,
                MessageType = chat.LastMessage.MessageType,
                Timestamp = chat.LastMessage.Timestamp
            } : null,
            UnreadCount = 0,
            CreatedAt = chat.CreatedAt,
            UpdatedAt = chat.UpdatedAt
        };
    }
}
