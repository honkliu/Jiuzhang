using KanShan.Server.Presence;

namespace KanShan.Server.Endpoints;

public static class PresenceEndpoints
{
    public static RouteGroupBuilder MapPresenceEndpoints(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/presence").RequireAuthorization();

        group.MapGet("/online", GetOnlineAsync);

        return group;
    }

    private static IResult GetOnlineAsync(string? userIds, IPresenceTracker presence)
    {
        var ids = (userIds ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => Guid.TryParse(x, out var id) ? id : Guid.Empty)
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToList();

        var online = presence.GetOnlineUsers(ids);
        return Results.Ok(new { onlineUserIds = online });
    }
}
