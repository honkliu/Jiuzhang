using System.Text;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using KanShan.Server.Data;
using KanShan.Server.Domain.Entities;
using KanShan.Server.Dtos;
using KanShan.Server.Hubs;
using KanShan.Server.Realtime;

namespace KanShan.Server.Wa;

public interface IWaOrchestrator
{
    void StartIfTriggered(Guid conversationId, Guid triggerMessageId, Guid triggeringUserId, string? triggerText);
}

public sealed class WaOrchestrator : IWaOrchestrator
{
    private readonly IServiceScopeFactory _scopes;
    private readonly IHubContext<ChatHub> _hub;
    private readonly IWaClient _wa;
    private readonly WaOptions _options;

    public WaOrchestrator(
        IServiceScopeFactory scopes,
        IHubContext<ChatHub> hub,
        IWaClient wa,
        IOptions<WaOptions> options)
    {
        _scopes = scopes;
        _hub = hub;
        _wa = wa;
        _options = options.Value;
    }

    public void StartIfTriggered(Guid conversationId, Guid triggerMessageId, Guid triggeringUserId, string? triggerText)
    {
        if (conversationId == Guid.Empty) return;
        if (triggerMessageId == Guid.Empty) return;

        var text = triggerText ?? string.Empty;
        if (!text.Contains("@@", StringComparison.Ordinal)) return;

        _ = Task.Run(() => RunAsync(conversationId, triggerMessageId, triggeringUserId));
    }

    private async Task RunAsync(Guid conversationId, Guid triggerMessageId, Guid triggeringUserId)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var waUserId = await ResolveWaUserIdAsync(db, conversationId);
        await EnsureWaMembershipAsync(db, conversationId, waUserId);

        // Build context from recent messages.
        var recent = await db.Messages
            .AsNoTracking()
            .Where(m => m.ConversationId == conversationId)
            .Where(m => !m.IsDeleted)
            .OrderByDescending(m => m.CreatedAt)
            .Take(Math.Clamp(_options.MaxContextMessages, 5, 100))
            .Select(m => new
            {
                m.SenderUserId,
                m.Text,
                m.ImageUrl,
                m.IsRecalled,
                m.CreatedAt,
            })
            .ToListAsync();

        recent.Reverse();

        var prompt = new List<(string role, string content)>
        {
            ("system", "You are wa (Chinese name: 娲). You are a helpful participant in this chat. Keep replies concise, friendly, and in the same language as the user."),
        };

        foreach (var m in recent)
        {
            var role = m.SenderUserId == waUserId ? "assistant" : "user";
            var content = m.IsRecalled
                ? "(message recalled)"
                : !string.IsNullOrWhiteSpace(m.Text)
                    ? m.Text!
                    : !string.IsNullOrWhiteSpace(m.ImageUrl)
                        ? "(image)"
                        : string.Empty;

            if (string.IsNullOrWhiteSpace(content)) continue;

            // Strip @@ so the model doesn't echo it.
            if (role == "user")
            {
                content = content.Replace("@@", string.Empty, StringComparison.Ordinal).Trim();
            }

            prompt.Add((role, content));
        }

        // Create placeholder message for streaming.
        var waMessage = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            SenderUserId = waUserId,
            Text = string.Empty,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        db.Messages.Add(waMessage);
        await db.SaveChangesAsync();

        var newDto = new MessageDto(
            waMessage.Id,
            waMessage.ConversationId,
            waMessage.SenderUserId,
            WaIdentity.DisplayName,
            waMessage.Text,
            waMessage.ImageUrl,
            waMessage.ClientMessageId,
            waMessage.IsRecalled,
            waMessage.RecalledAt,
            waMessage.RecalledByUserId,
            waMessage.CreatedAt);

        await _hub.Clients.Group(HubGroups.Conversation(conversationId)).SendAsync("message:new", newDto);

        var full = new StringBuilder();
        try
        {
            await foreach (var chunk in _wa.StreamChatCompletionAsync(prompt, CancellationToken.None))
            {
                full.Append(chunk);
                await _hub.Clients.Group(HubGroups.Conversation(conversationId)).SendAsync("message:delta", new
                {
                    id = waMessage.Id,
                    conversationId,
                    delta = chunk,
                    text = full.ToString(),
                });
            }

            // Persist final.
            var saved = await db.Messages.SingleAsync(m => m.Id == waMessage.Id);
            saved.Text = full.ToString();
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Persist an error note so chat doesn't look stuck.
            var saved = await db.Messages.SingleAsync(m => m.Id == waMessage.Id);
            saved.Text = full.Length > 0
                ? full.ToString()
                : $"(wa error: {ex.Message})";
            await db.SaveChangesAsync();

            await _hub.Clients.Group(HubGroups.Conversation(conversationId)).SendAsync("message:delta", new
            {
                id = waMessage.Id,
                conversationId,
                delta = string.Empty,
                text = saved.Text,
            });
        }
    }

    private static async Task<Guid> ResolveWaUserIdAsync(AppDbContext db, Guid conversationId)
    {
        // Prefer a wa participant already in this conversation (handles legacy DBs where wa isn't the fixed GUID).
        var waInConversation = await db.ConversationParticipants
            .AsNoTracking()
            .Where(p => p.ConversationId == conversationId)
            .Where(p => p.User.UserName == WaIdentity.UserName)
            .Select(p => p.UserId)
            .FirstOrDefaultAsync();

        if (waInConversation != Guid.Empty) return waInConversation;

        // Fall back to the wa user record by username (or legacy fixed id).
        var waAny = await db.Users
            .AsNoTracking()
            .Where(u => u.UserName == WaIdentity.UserName || u.Id == WaIdentity.UserId)
            .OrderByDescending(u => u.Id == WaIdentity.UserId)
            .Select(u => u.Id)
            .FirstOrDefaultAsync();

        if (waAny != Guid.Empty) return waAny;

        // Create wa if missing.
        db.Users.Add(new AppUser
        {
            Id = WaIdentity.UserId,
            UserName = WaIdentity.UserName,
            DisplayName = WaIdentity.DisplayName,
            PasswordHash = "BOT",
            CreatedAt = DateTimeOffset.UtcNow,
        });

        await db.SaveChangesAsync();
        return WaIdentity.UserId;
    }

    private static async Task EnsureWaMembershipAsync(AppDbContext db, Guid conversationId, Guid waUserId)
    {
        var isMember = await db.ConversationParticipants
            .AnyAsync(p => p.ConversationId == conversationId && p.UserId == waUserId);

        if (isMember) return;

        db.ConversationParticipants.Add(new ConversationParticipant
        {
            ConversationId = conversationId,
            UserId = waUserId,
            Role = ConversationRole.Member,
            JoinedAt = DateTimeOffset.UtcNow,
        });

        await db.SaveChangesAsync();
    }
}
