using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using KanShan.Server.Auth;
using KanShan.Server.Data;
using KanShan.Server.Domain.Entities;
using KanShan.Server.Dtos;
using KanShan.Server.Hubs;
using KanShan.Server.Presence;
using KanShan.Server.Realtime;
using KanShan.Server.Wa;

namespace KanShan.Server.Endpoints;

public static class ChatEndpoints
{
    private static async Task<Guid> ResolveWaUserIdAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        // Prefer the wa user by username; fall back to legacy fixed GUID.
        var wa = await db.Users
            .AsNoTracking()
            .Where(u => u.UserName == WaIdentity.UserName || u.Id == WaIdentity.UserId)
            .OrderByDescending(u => u.UserName == WaIdentity.UserName)
            .ThenByDescending(u => u.Id == WaIdentity.UserId)
            .Select(u => u.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return wa;
    }

    public static RouteGroupBuilder MapChatEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/chats").RequireAuthorization();

        group.MapGet("/", ListConversationsAsync);
        group.MapPost("/direct", CreateOrGetDirectAsync);
        group.MapPost("/group", CreateGroupAsync);
        group.MapPost("/{conversationId:guid}/members", AddMembersAsync);
        group.MapGet("/{conversationId:guid}", GetConversationAsync);
        group.MapGet("/{conversationId:guid}/messages", GetMessagesAsync);
        group.MapDelete("/{conversationId:guid}", DeleteConversationAsync);

        return group;
    }

    private static async Task<IResult> DeleteConversationAsync(
        Guid conversationId,
        ICurrentUser currentUser,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        if (conversationId == Guid.Empty)
        {
            return Results.BadRequest(new { error = "Invalid conversationId" });
        }

        var myId = currentUser.UserId;
        var waUserId = await ResolveWaUserIdAsync(db, cancellationToken);
        if (waUserId == Guid.Empty) waUserId = WaIdentity.UserId;

        var participants = await db.ConversationParticipants
            .AsNoTracking()
            .Where(p => p.ConversationId == conversationId)
            .Select(p => new { p.UserId, p.User.UserName })
            .ToListAsync(cancellationToken);

        if (participants.Count == 0)
        {
            return Results.NotFound();
        }

        var isMember = participants.Any(p => p.UserId == myId);
        if (!isMember)
        {
            return Results.Forbid();
        }

        var isOnlyMeAndWa = participants.Count == 2
            && participants.Any(p => p.UserId == myId)
            && participants.Any(p => p.UserId == waUserId || p.UserName == WaIdentity.UserName);

        if (!isOnlyMeAndWa)
        {
            return Results.BadRequest(new { error = "Only wa-only conversations can be deleted. Other chats can be hidden from the list." });
        }

        var conv = await db.Conversations.SingleOrDefaultAsync(c => c.Id == conversationId, cancellationToken);
        if (conv is null)
        {
            return Results.NotFound();
        }

        db.Conversations.Remove(conv);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new { deleted = true });
    }

    private static async Task<bool> IsMemberAsync(AppDbContext db, Guid conversationId, Guid userId, CancellationToken cancellationToken)
    {
        return await db.ConversationParticipants.AnyAsync(p => p.ConversationId == conversationId && p.UserId == userId, cancellationToken);
    }

    private static async Task<IResult> ListConversationsAsync(ICurrentUser currentUser, AppDbContext db, CancellationToken cancellationToken)
    {
        var myId = currentUser.UserId;
        var waUserId = await ResolveWaUserIdAsync(db, cancellationToken);
        if (waUserId == Guid.Empty) waUserId = WaIdentity.UserId;

        var convs = await db.Conversations
            .AsNoTracking()
            .Where(c => c.Participants.Any(p => p.UserId == myId))
            .Select(c => new
            {
                c.Id,
                c.Type,
                c.Title,
                c.CreatedAt,
                Participants = c.Participants
                    .Select(p => new
                    {
                        p.UserId,
                        p.User.UserName,
                        p.User.DisplayName,
                        Role = p.Role.ToString(),
                    })
                    .ToList(),
                LastMessage = c.Messages
                    .OrderByDescending(m => m.CreatedAt)
                    .Select(m => new
                    {
                        m.Id,
                        m.ConversationId,
                        m.SenderUserId,
                        SenderDisplayName = m.Sender.DisplayName,
                        m.Text,
                        m.ImageUrl,
                        m.ClientMessageId,
                        m.IsRecalled,
                        m.RecalledAt,
                        m.RecalledByUserId,
                        m.CreatedAt
                    })
                    .FirstOrDefault(),
                LastReadAt = db.ConversationReadStates
                    .Where(rs => rs.ConversationId == c.Id && rs.UserId == myId)
                    .Select(rs => (DateTimeOffset?)rs.LastReadAt)
                    .FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);

        var result = convs
            .Select(c =>
            {
                var participants = c.Participants
                    .Select(p => new ConversationParticipantDto(p.UserId, p.UserName, p.DisplayName, p.Role))
                    .ToList();

                var title = c.Type == ConversationType.Group
                    ? (c.Title ?? "(group)")
                    : participants.FirstOrDefault(p => p.UserId != myId)?.DisplayName ?? "(direct)";

                if (c.Type == ConversationType.Direct)
                {
                    title = participants.FirstOrDefault(p => p.UserId != myId && p.UserId != waUserId)?.DisplayName
                        ?? participants.FirstOrDefault(p => p.UserId != myId)?.DisplayName
                        ?? "(direct)";
                }

                MessageDto? last = c.LastMessage is null
                    ? null
                    : new MessageDto(
                        c.LastMessage.Id,
                        c.LastMessage.ConversationId,
                        c.LastMessage.SenderUserId,
                        c.LastMessage.SenderDisplayName,
                        c.LastMessage.Text,
                        c.LastMessage.ImageUrl,
                        c.LastMessage.ClientMessageId,
                        c.LastMessage.IsRecalled,
                        c.LastMessage.RecalledAt,
                        c.LastMessage.RecalledByUserId,
                        c.LastMessage.CreatedAt);

                var lastReadAt = c.LastReadAt ?? new DateTimeOffset(1970, 1, 1, 0, 0, 0, TimeSpan.Zero);
                var unread = db.Messages
                    .AsNoTracking()
                    .Where(m => m.ConversationId == c.Id)
                    .Where(m => m.CreatedAt > lastReadAt)
                    .Where(m => m.SenderUserId != myId)
                    .Count();

                return new ConversationSummaryDto(
                    c.Id,
                    c.Type.ToString(),
                    title,
                    participants,
                    last,
                    unread,
                    c.CreatedAt);
            })
            .OrderByDescending(c => c.LastMessage?.CreatedAt ?? c.CreatedAt)
            .ToList();

        return Results.Ok(result);
    }

    private static async Task<IResult> CreateOrGetDirectAsync(
        CreateDirectRequest request,
        ICurrentUser currentUser,
        AppDbContext db,
        IPresenceTracker presence,
        IHubContext<ChatHub> hub,
        CancellationToken cancellationToken)
    {
        if (request.OtherUserId == Guid.Empty || request.OtherUserId == currentUser.UserId)
        {
            return Results.BadRequest(new { error = "Invalid otherUserId" });
        }

        var otherExists = await db.Users.AnyAsync(u => u.Id == request.OtherUserId, cancellationToken);
        if (!otherExists)
        {
            return Results.NotFound(new { error = "User not found" });
        }

        var myId = currentUser.UserId;
        var waUserId = await ResolveWaUserIdAsync(db, cancellationToken);
        if (waUserId == Guid.Empty) waUserId = WaIdentity.UserId;

        var existingId = await db.Conversations
            .Where(c => c.Type == ConversationType.Direct)
            .Where(c => c.Participants.Any(p => p.UserId == myId))
            .Where(c => c.Participants.Any(p => p.UserId == request.OtherUserId))
            // Allow wa as a third participant, but avoid accidentally matching a larger conversation.
            .Where(c => c.Participants.All(p =>
                p.UserId == myId || p.UserId == request.OtherUserId || p.UserId == waUserId))
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(cancellationToken);

        var conversationId = existingId ?? Guid.NewGuid();

        if (existingId is null)
        {
            var conv = new Conversation
            {
                Id = conversationId,
                Type = ConversationType.Direct,
                Title = null,
                CreatedAt = DateTimeOffset.UtcNow,
            };

            db.Conversations.Add(conv);
            db.ConversationParticipants.AddRange(
                new ConversationParticipant
                {
                    ConversationId = conv.Id,
                    UserId = myId,
                    Role = ConversationRole.Member,
                    JoinedAt = DateTimeOffset.UtcNow,
                },
                new ConversationParticipant
                {
                    ConversationId = conv.Id,
                    UserId = request.OtherUserId,
                    Role = ConversationRole.Member,
                    JoinedAt = DateTimeOffset.UtcNow,
                });

            await db.SaveChangesAsync(cancellationToken);

            var memberIds = new[] { myId, request.OtherUserId };
            foreach (var userId in memberIds)
            {
                foreach (var connectionId in presence.GetConnections(userId))
                {
                    await hub.Groups.AddToGroupAsync(connectionId, HubGroups.Conversation(conversationId), cancellationToken);
                }

                await hub.Clients.Group(HubGroups.User(userId))
                    .SendAsync("conversation:new", new { conversationId }, cancellationToken);
            }
        }

        return await GetConversationAsync(conversationId, currentUser, db, cancellationToken);
    }

    private static async Task<IResult> CreateGroupAsync(
        CreateGroupRequest request,
        ICurrentUser currentUser,
        AppDbContext db,
        IPresenceTracker presence,
        IHubContext<ChatHub> hub,
        CancellationToken cancellationToken)
    {
        var title = (request.Title ?? string.Empty).Trim();
        if (title.Length is < 1 or > 64)
        {
            return Results.BadRequest(new { error = "Group title must be 1-64 chars" });
        }

        var myId = currentUser.UserId;

        var memberIds = (request.MemberUserIds ?? Array.Empty<Guid>())
            .Where(id => id != Guid.Empty)
            .Append(myId)
            .Distinct()
            .ToList();

        var existingUsers = await db.Users
            .Where(u => memberIds.Contains(u.Id))
            .Select(u => u.Id)
            .ToListAsync(cancellationToken);

        var missing = memberIds.Except(existingUsers).ToList();
        if (missing.Count > 0)
        {
            return Results.BadRequest(new { error = "Some users not found", missingUserIds = missing });
        }

        var conv = new Conversation
        {
            Id = Guid.NewGuid(),
            Type = ConversationType.Group,
            Title = title,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.Conversations.Add(conv);

        foreach (var userId in memberIds)
        {
            db.ConversationParticipants.Add(new ConversationParticipant
            {
                ConversationId = conv.Id,
                UserId = userId,
                Role = userId == myId ? ConversationRole.Owner : ConversationRole.Member,
                JoinedAt = DateTimeOffset.UtcNow,
            });
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var userId in memberIds)
        {
            foreach (var connectionId in presence.GetConnections(userId))
            {
                await hub.Groups.AddToGroupAsync(connectionId, HubGroups.Conversation(conv.Id), cancellationToken);
            }

            await hub.Clients.Group(HubGroups.User(userId))
                .SendAsync("conversation:new", new { conversationId = conv.Id }, cancellationToken);
        }

        return await GetConversationAsync(conv.Id, currentUser, db, cancellationToken);
    }

    private static async Task<IResult> AddMembersAsync(
        Guid conversationId,
        AddMembersRequest request,
        ICurrentUser currentUser,
        AppDbContext db,
        IPresenceTracker presence,
        IHubContext<ChatHub> hub,
        CancellationToken cancellationToken)
    {
        var myId = currentUser.UserId;

        var role = await db.ConversationParticipants
            .Where(p => p.ConversationId == conversationId && p.UserId == myId)
            .Select(p => (ConversationRole?)p.Role)
            .SingleOrDefaultAsync(cancellationToken);

        if (role is null)
        {
            return Results.Forbid();
        }

        if (role != ConversationRole.Owner)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        var memberIds = (request.MemberUserIds ?? Array.Empty<Guid>())
            .Where(id => id != Guid.Empty && id != myId)
            .Distinct()
            .ToList();

        if (memberIds.Count == 0)
        {
            return Results.Ok();
        }

        var existingUsers = await db.Users
            .Where(u => memberIds.Contains(u.Id))
            .Select(u => u.Id)
            .ToListAsync(cancellationToken);

        var missing = memberIds.Except(existingUsers).ToList();
        if (missing.Count > 0)
        {
            return Results.BadRequest(new { error = "Some users not found", missingUserIds = missing });
        }

        var already = await db.ConversationParticipants
            .Where(p => p.ConversationId == conversationId)
            .Where(p => memberIds.Contains(p.UserId))
            .Select(p => p.UserId)
            .ToListAsync(cancellationToken);

        var toAdd = memberIds.Except(already).ToList();

        foreach (var userId in toAdd)
        {
            db.ConversationParticipants.Add(new ConversationParticipant
            {
                ConversationId = conversationId,
                UserId = userId,
                Role = ConversationRole.Member,
                JoinedAt = DateTimeOffset.UtcNow,
            });
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var userId in toAdd)
        {
            foreach (var connectionId in presence.GetConnections(userId))
            {
                await hub.Groups.AddToGroupAsync(connectionId, HubGroups.Conversation(conversationId), cancellationToken);
            }

            await hub.Clients.Group(HubGroups.User(userId))
                .SendAsync("conversation:new", new { conversationId }, cancellationToken);
        }

        return Results.Ok(new { addedUserIds = toAdd });
    }

    private static async Task<IResult> GetConversationAsync(Guid conversationId, ICurrentUser currentUser, AppDbContext db, CancellationToken cancellationToken)
    {
        var myId = currentUser.UserId;

        var conv = await db.Conversations
            .AsNoTracking()
            .Where(c => c.Id == conversationId)
            .Where(c => c.Participants.Any(p => p.UserId == myId))
            .Select(c => new
            {
                c.Id,
                c.Type,
                c.Title,
                c.CreatedAt,
                Participants = c.Participants
                    .Select(p => new
                    {
                        p.UserId,
                        p.User.UserName,
                        p.User.DisplayName,
                        Role = p.Role.ToString(),
                    })
                    .ToList(),
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (conv is null)
        {
            return Results.NotFound();
        }

        var participants = conv.Participants
            .Select(p => new ConversationParticipantDto(p.UserId, p.UserName, p.DisplayName, p.Role))
            .ToList();

        var title = conv.Type == ConversationType.Group
            ? (conv.Title ?? "(group)")
            : participants.FirstOrDefault(p => p.UserId != myId)?.DisplayName ?? "(direct)";

        if (conv.Type == ConversationType.Direct)
        {
            title = participants.FirstOrDefault(p => p.UserId != myId && p.UserId != WaIdentity.UserId)?.DisplayName
                ?? participants.FirstOrDefault(p => p.UserId != myId)?.DisplayName
                ?? "(direct)";
        }

        return Results.Ok(new ConversationDto(conv.Id, conv.Type.ToString(), title, participants, conv.CreatedAt));
    }

    private static async Task<IResult> GetMessagesAsync(
        Guid conversationId,
        ICurrentUser currentUser,
        AppDbContext db,
        DateTimeOffset? before,
        int? limit,
        CancellationToken cancellationToken)
    {
        var myId = currentUser.UserId;
        var isMember = await IsMemberAsync(db, conversationId, myId, cancellationToken);
        if (!isMember)
        {
            return Results.Forbid();
        }

        var take = Math.Clamp(limit ?? 50, 1, 200);
        var beforeTs = before ?? DateTimeOffset.UtcNow.AddYears(100);

        var messages = await db.Messages
            .AsNoTracking()
            .Where(m => m.ConversationId == conversationId)
            .Where(m => m.CreatedAt < beforeTs)
            .OrderByDescending(m => m.CreatedAt)
            .Take(take)
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
            .ToListAsync(cancellationToken);

        messages.Reverse();
        return Results.Ok(messages);
    }
}
