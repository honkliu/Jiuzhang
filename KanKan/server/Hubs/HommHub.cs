using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace KanKan.API.Hubs;

using KanKan.API.Services.Homm;

/// <summary>
/// Real-time HoMM game events. Clients connect to /hub/homm?gameId=... and join the
/// "game:{id}" group; <see cref="WsHub"/> sends a single "event" message
/// shaped { type, gameId, payload }.
/// </summary>
[Authorize]
public class HommHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var gameId = Context.GetHttpContext()?.Request.Query["gameId"].ToString();
        if (Guid.TryParse(gameId, out var id))
            await Groups.AddToGroupAsync(Context.ConnectionId, WsHub.Group(id));
        await base.OnConnectedAsync();
    }
}
