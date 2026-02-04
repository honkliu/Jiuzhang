using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text;
using KanShan.Server.Auth;
using KanShan.Server.Data;
using KanShan.Server.Domain.Entities;
using KanShan.Server.Dtos;
using KanShan.Server.Presence;
using KanShan.Server.Realtime;
using KanShan.Server.Wa;

namespace KanShan.Server.Hubs;

[Authorize]
public sealed class ChatHub : Hub
{
    private readonly AppDbContext _db;
    private readonly IPresenceTracker _presence;
    private readonly IWaOrchestrator _wa;

    public ChatHub(AppDbContext db, IPresenceTracker presence, IWaOrchestrator wa)
    {
        _db = db;
        _presence = presence;
        _wa = wa;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId != Guid.Empty)
        {
            _presence.ConnectionOpened(userId, Context.ConnectionId);
            await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.User(userId));

            var convIds = await _db.ConversationParticipants
                .Where(p => p.UserId == userId)
                .Select(p => p.ConversationId)
                .ToListAsync();

            foreach (var id in convIds)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Conversation(id));
            }

            foreach (var id in convIds)
            {
                await Clients.Group(HubGroups.Conversation(id)).SendAsync("presence:update", new { userId, online = true });
            }
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId != Guid.Empty)
        {
            _presence.ConnectionClosed(userId, Context.ConnectionId);

            var convIds = await _db.ConversationParticipants
                .Where(p => p.UserId == userId)
                .Select(p => p.ConversationId)
                .ToListAsync();

            var stillOnline = _presence.IsOnline(userId);
            if (!stillOnline)
            {
                foreach (var id in convIds)
                {
                    await Clients.Group(HubGroups.Conversation(id)).SendAsync("presence:update", new { userId, online = false });
                }
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinConversation(Guid conversationId)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            throw new HubException("Unauthorized");
        }

        var isMember = await _db.ConversationParticipants
            .AnyAsync(p => p.ConversationId == conversationId && p.UserId == userId);

        if (!isMember)
        {
            throw new HubException("Not a member");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Conversation(conversationId));
    }

    public async Task LeaveConversation(Guid conversationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, HubGroups.Conversation(conversationId));
    }

    public async Task MarkRead(MarkReadRequest request)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            throw new HubException("Unauthorized");
        }

        if (request.ConversationId == Guid.Empty || request.LastReadMessageId == Guid.Empty)
        {
            throw new HubException("Invalid request");
        }

        var isMember = await _db.ConversationParticipants
            .AnyAsync(p => p.ConversationId == request.ConversationId && p.UserId == userId);

        if (!isMember)
        {
            throw new HubException("Not a member");
        }

        var messageTs = await _db.Messages
            .Where(m => m.Id == request.LastReadMessageId && m.ConversationId == request.ConversationId)
            .Select(m => (DateTimeOffset?)m.CreatedAt)
            .SingleOrDefaultAsync();

        if (messageTs is null)
        {
            throw new HubException("Message not found");
        }

        var state = await _db.ConversationReadStates
            .SingleOrDefaultAsync(x => x.ConversationId == request.ConversationId && x.UserId == userId);

        if (state is null)
        {
            state = new ConversationReadState
            {
                ConversationId = request.ConversationId,
                UserId = userId,
                LastReadMessageId = request.LastReadMessageId,
                LastReadAt = messageTs.Value,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            _db.ConversationReadStates.Add(state);
        }
        else
        {
            if (messageTs.Value <= state.LastReadAt)
            {
                return;
            }

            state.LastReadMessageId = request.LastReadMessageId;
            state.LastReadAt = messageTs.Value;
            state.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _db.SaveChangesAsync();

        await Clients.Group(HubGroups.Conversation(request.ConversationId)).SendAsync("read:update", new
        {
            conversationId = request.ConversationId,
            userId,
            lastReadMessageId = request.LastReadMessageId,
            lastReadAt = messageTs.Value,
        });
    }

    public async Task<MessageDto> SendMessage(SendMessageRequest request)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            throw new HubException("Unauthorized");
        }

        if (request.ConversationId == Guid.Empty)
        {
            throw new HubException("ConversationId required");
        }

        var hasText = !string.IsNullOrWhiteSpace(request.Text);
        var hasImage = !string.IsNullOrWhiteSpace(request.ImageUrl);
        if (!hasText && !hasImage)
        {
            throw new HubException("Message must have text or image");
        }

        var isMember = await _db.ConversationParticipants
            .AnyAsync(p => p.ConversationId == request.ConversationId && p.UserId == userId);

        if (!isMember)
        {
            throw new HubException("Not a member");
        }

        if (!string.IsNullOrWhiteSpace(request.ClientMessageId))
        {
            var existing = await _db.Messages
                .AsNoTracking()
                .Where(m => m.ConversationId == request.ConversationId)
                .Where(m => m.SenderUserId == userId)
                .Where(m => m.ClientMessageId == request.ClientMessageId)
                .Select(m => new MessageDto(
                    m.Id,
                    m.ConversationId,
                    m.SenderUserId,
                    m.Sender.DisplayName,
                    m.Text,
                    m.ImageUrl,
                    m.ClientMessageId,
                    m.IsRecalled,
                    m.RecalledAt,
                    m.RecalledByUserId,
                    m.CreatedAt))
                .SingleOrDefaultAsync();

            if (existing is not null)
            {
                return existing;
            }
        }

        var message = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = request.ConversationId,
            SenderUserId = userId,
            Text = request.Text?.Trim(),
            ImageUrl = request.ImageUrl?.Trim(),
            ClientMessageId = request.ClientMessageId?.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
        };

        _db.Messages.Add(message);
        await _db.SaveChangesAsync();

        // Auto-invite mentioned users (e.g. "@bob") into this conversation.
        // This is intentionally permissive: any existing participant can invite by mention.
        var invitedUserIds = await InviteMentionedUsersAsync(request.ConversationId, userId, message.Text, CancellationToken.None);

        // Decide whether to trigger wa.
        // - If conversation participants are exactly {me, wa}, every message triggers wa.
        // - Otherwise, only messages containing @@ trigger wa.
        var waUserId = await ResolveWaUserIdForConversationAsync(request.ConversationId, CancellationToken.None);
        var participantIds = await _db.ConversationParticipants
            .AsNoTracking()
            .Where(p => p.ConversationId == request.ConversationId)
            .Select(p => p.UserId)
            .ToListAsync();

        var isOnlyMeAndWa = participantIds.Count == 2
            && participantIds.Contains(userId)
            && participantIds.Contains(waUserId);

        var hasAtAt = (request.Text ?? string.Empty).Contains("@@", StringComparison.Ordinal);
        var shouldTriggerWa = userId != waUserId && (isOnlyMeAndWa || hasAtAt);

        var senderDisplayName = await _db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.DisplayName)
            .SingleAsync();

        var dto = new MessageDto(
            message.Id,
            message.ConversationId,
            message.SenderUserId,
            senderDisplayName,
            message.Text,
            message.ImageUrl,
            message.ClientMessageId,
            message.IsRecalled,
            message.RecalledAt,
            message.RecalledByUserId,
            message.CreatedAt);

        await Clients.Group(HubGroups.Conversation(request.ConversationId)).SendAsync("message:new", dto);

        if (shouldTriggerWa)
        {
            // If we are forcing wa without @@, pass a minimal trigger text to start streaming.
            var triggerText = hasAtAt ? request.Text : "@@";
            _wa.StartIfTriggered(request.ConversationId, message.Id, userId, triggerText);
        }

        return dto;
    }

    private static IReadOnlyList<string> ExtractMentions(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return Array.Empty<string>();

        // Parse @username mentions; ignore @@.
        // Allowed username chars: letters/digits/_/- (match backend's current userName usage).
        var value = text;
        var results = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < value.Length; i++)
        {
            if (value[i] != '@') continue;
            if (i + 1 < value.Length && value[i + 1] == '@') continue;

            var j = i + 1;
            while (j < value.Length)
            {
                var ch = value[j];
                var ok = char.IsLetterOrDigit(ch) || ch == '_' || ch == '-';
                if (!ok) break;
                j++;
            }

            var len = j - (i + 1);
            if (len <= 0) continue;

            var u = value.Substring(i + 1, len).Trim();
            if (u.Length == 0) continue;
            results.Add(u);

            i = j - 1;
        }

        return results.ToList();
    }

    private async Task<IReadOnlyList<Guid>> InviteMentionedUsersAsync(Guid conversationId, Guid inviterUserId, string? messageText, CancellationToken cancellationToken)
    {
        var mentions = ExtractMentions(messageText);
        if (mentions.Count == 0) return Array.Empty<Guid>();

        var lower = mentions.Select(m => m.Trim().ToLowerInvariant()).Where(m => m.Length > 0).Distinct().ToList();
        if (lower.Count == 0) return Array.Empty<Guid>();

        // Resolve usernames to IDs (exact match on normalized username).
        var mentionedUserIds = await _db.Users
            .AsNoTracking()
            .Where(u => lower.Contains(u.UserName))
            .Select(u => u.Id)
            .ToListAsync(cancellationToken);

        // Never invite self.
        mentionedUserIds = mentionedUserIds.Where(id => id != inviterUserId).Distinct().ToList();
        if (mentionedUserIds.Count == 0) return Array.Empty<Guid>();

        // Ensure inviter is still a member.
        var inviterRole = await _db.ConversationParticipants
            .Where(p => p.ConversationId == conversationId && p.UserId == inviterUserId)
            .Select(p => (ConversationRole?)p.Role)
            .SingleOrDefaultAsync(cancellationToken);

        if (inviterRole is null) return Array.Empty<Guid>();

        // Upgrade direct->group when inviting anyone.
        var conv = await _db.Conversations
            .Where(c => c.Id == conversationId)
            .SingleOrDefaultAsync(cancellationToken);

        if (conv is null) return Array.Empty<Guid>();

        var didUpgrade = false;
        if (conv.Type == ConversationType.Direct)
        {
            conv.Type = ConversationType.Group;
            didUpgrade = true;
            if (string.IsNullOrWhiteSpace(conv.Title))
            {
                conv.Title = "New group";
            }

            // Make inviter the owner so they can keep managing the group via REST endpoints.
            var inviterRow = await _db.ConversationParticipants
                .Where(p => p.ConversationId == conversationId && p.UserId == inviterUserId)
                .SingleOrDefaultAsync(cancellationToken);

            if (inviterRow is not null && inviterRow.Role != ConversationRole.Owner)
            {
                inviterRow.Role = ConversationRole.Owner;
            }
        }

        var already = await _db.ConversationParticipants
            .AsNoTracking()
            .Where(p => p.ConversationId == conversationId)
            .Where(p => mentionedUserIds.Contains(p.UserId))
            .Select(p => p.UserId)
            .ToListAsync(cancellationToken);

        var toAdd = mentionedUserIds.Except(already).ToList();
        if (toAdd.Count == 0)
        {
            await _db.SaveChangesAsync(cancellationToken);

            if (didUpgrade)
            {
                await Clients.Group(HubGroups.Conversation(conversationId))
                    .SendAsync("conversation:new", new { conversationId }, cancellationToken);
            }

            return Array.Empty<Guid>();
        }

        foreach (var uid in toAdd)
        {
            _db.ConversationParticipants.Add(new ConversationParticipant
            {
                ConversationId = conversationId,
                UserId = uid,
                Role = ConversationRole.Member,
                JoinedAt = DateTimeOffset.UtcNow,
            });
        }

        await _db.SaveChangesAsync(cancellationToken);

        foreach (var uid in toAdd)
        {
            foreach (var connectionId in _presence.GetConnections(uid))
            {
                await Groups.AddToGroupAsync(connectionId, HubGroups.Conversation(conversationId), cancellationToken);
            }

            await Clients.Group(HubGroups.User(uid))
                .SendAsync("conversation:new", new { conversationId }, cancellationToken);
        }

        // Notify existing participants too so their conversation list + member summary refreshes.
        await Clients.Group(HubGroups.Conversation(conversationId))
            .SendAsync("conversation:new", new { conversationId }, cancellationToken);

        return toAdd;
    }

    private async Task<Guid> ResolveWaUserIdForConversationAsync(Guid conversationId, CancellationToken cancellationToken)
    {
        // Prefer a wa participant already in this conversation.
        var waInConversation = await _db.ConversationParticipants
            .AsNoTracking()
            .Where(p => p.ConversationId == conversationId)
            .Where(p => p.User.UserName == WaIdentity.UserName)
            .Select(p => p.UserId)
            .FirstOrDefaultAsync(cancellationToken);

        if (waInConversation != Guid.Empty) return waInConversation;

        // Fall back to the wa user record by username (or legacy fixed id).
        var waAny = await _db.Users
            .AsNoTracking()
            .Where(u => u.UserName == WaIdentity.UserName || u.Id == WaIdentity.UserId)
            .OrderByDescending(u => u.Id == WaIdentity.UserId)
            .Select(u => u.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return waAny != Guid.Empty ? waAny : WaIdentity.UserId;
    }

    public async Task TypingUpdate(Guid conversationId, string? text)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            throw new HubException("Unauthorized");
        }

        if (conversationId == Guid.Empty)
        {
            throw new HubException("ConversationId required");
        }

        var isMember = await _db.ConversationParticipants
            .AnyAsync(p => p.ConversationId == conversationId && p.UserId == userId);

        if (!isMember)
        {
            throw new HubException("Not a member");
        }

        var displayName = await _db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.DisplayName)
            .SingleAsync();

        // Broadcast the live draft to the whole conversation; clients can ignore their own.
        await Clients.Group(HubGroups.Conversation(conversationId)).SendAsync("typing:update", new
        {
            conversationId,
            userId,
            displayName,
            text = text ?? string.Empty,
            at = DateTimeOffset.UtcNow,
        });
    }

    public async Task RecallMessage(Guid messageId)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            throw new HubException("Unauthorized");
        }

        var message = await _db.Messages.SingleOrDefaultAsync(m => m.Id == messageId);
        if (message is null)
        {
            throw new HubException("Message not found");
        }

        var isMember = await _db.ConversationParticipants
            .AnyAsync(p => p.ConversationId == message.ConversationId && p.UserId == userId);

        if (!isMember)
        {
            throw new HubException("Not a member");
        }

        if (message.SenderUserId != userId)
        {
            throw new HubException("Only sender can recall");
        }

        var window = TimeSpan.FromMinutes(2);
        if (DateTimeOffset.UtcNow - message.CreatedAt > window)
        {
            throw new HubException("Recall window expired");
        }

        if (message.IsDeleted)
        {
            throw new HubException("Message deleted");
        }

        if (!message.IsRecalled)
        {
            message.IsRecalled = true;
            message.RecalledAt = DateTimeOffset.UtcNow;
            message.RecalledByUserId = userId;
            message.Text = null;
            message.ImageUrl = null;
            await _db.SaveChangesAsync();
        }

        await Clients.Group(HubGroups.Conversation(message.ConversationId)).SendAsync("message:updated", new
        {
            id = message.Id,
            conversationId = message.ConversationId,
            isRecalled = message.IsRecalled,
            recalledAt = message.RecalledAt,
            recalledByUserId = message.RecalledByUserId,
            text = message.Text,
            imageUrl = message.ImageUrl,
        });
    }

    public async Task DeleteMessage(Guid messageId)
    {
        var userId = Context.User?.GetUserId() ?? Guid.Empty;
        if (userId == Guid.Empty)
        {
            throw new HubException("Unauthorized");
        }

        var message = await _db.Messages.SingleOrDefaultAsync(m => m.Id == messageId);
        if (message is null)
        {
            return;
        }

        var isMember = await _db.ConversationParticipants
            .AnyAsync(p => p.ConversationId == message.ConversationId && p.UserId == userId);

        if (!isMember)
        {
            throw new HubException("Not a member");
        }

        // Allow sender to delete, or group owner to delete.
        if (message.SenderUserId != userId)
        {
            var myRole = await _db.ConversationParticipants
                .Where(p => p.ConversationId == message.ConversationId && p.UserId == userId)
                .Select(p => p.Role)
                .SingleAsync();

            if (myRole != ConversationRole.Owner)
            {
                throw new HubException("Forbidden");
            }
        }

        if (!message.IsDeleted)
        {
            message.IsDeleted = true;
            message.DeletedAt = DateTimeOffset.UtcNow;
            message.DeletedByUserId = userId;
            await _db.SaveChangesAsync();
        }

        await Clients.Group(HubGroups.Conversation(message.ConversationId)).SendAsync("message:deleted", new
        {
            id = message.Id,
            conversationId = message.ConversationId,
        });
    }
}
