using Microsoft.AspNetCore.SignalR;
using KanKan.API.Hubs;

namespace KanKan.API.Services.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;
using KanKan.API.Repositories.Homm;


/// <summary>
/// Broadcasts game events to every SignalR client in the game's group
/// ("game:{id}"). Safe to call from services and background workers.
/// </summary>
public class WsHub
{
    private readonly IHubContext<HommHub> _hub;

    public WsHub(IHubContext<HommHub> hub) => _hub = hub;

    public static string Group(Guid gameId) => "game:" + gameId;

    public async Task BroadcastAsync(Guid gameId, string type, object payload)
    {
        try { await _hub.Clients.Group(Group(gameId)).SendAsync("event", new { type, gameId, payload }); }
        catch { /* realtime is best-effort; clients also refresh on focus */ }
    }
}
