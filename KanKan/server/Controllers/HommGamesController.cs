using System.Text.Json;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Repositories.Homm;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Homm;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using static KanKan.API.Controllers.Homm.HommApi;

namespace KanKan.API.Controllers.Homm;

/// <summary>HoMM game API (ported from City of Towers): games routes under /api/homm.</summary>
[Authorize]
[ApiExplorerSettings(IgnoreApi = true)]
[Route("api/homm")]
public class HommGamesController : ControllerBase
{
    private static readonly JsonSerializerOptions Json = HommApi.Json;

    /// <summary>Replaces City of Towers' /api/players: the caller's Kankan identity.</summary>
    [HttpGet("me")]
    public async Task<IResult> GetMe([FromServices] IUserRepository users)
    {
        var uid = HommCaller.UserIdOf(HttpContext);
        if (string.IsNullOrEmpty(uid)) return Results.BadRequest(new { error = "Unknown player." });
        return Results.Ok(new { userId = uid, name = await DisplayNameAsync(users, uid) });
    }

    [HttpGet("games")]
    public async Task<IResult> GetGames([FromServices] HommDb db)
    {
        var uid = HommCaller.UserIdOf(HttpContext);
        var games = await db.ListGameSummariesAsync();
        return Results.Ok(games.Select(g => new
        {
            id = g.Id,
            name = g.Name,
            state = g.State.ToString(),
            day = g.Day,
            week = g.Week,
            month = g.Month,
            turn = g.CurrentTurn,
            players = g.Players.Count(p => p.UserId != null),
            seated = !string.IsNullOrEmpty(uid) && g.Players.Any(p => p.UserId == uid),
            openSeats = g.Players.Count(p => !p.IsAi && p.UserId == null),
            hostName = g.Players.FirstOrDefault(p => g.HostUserId != null && p.UserId == g.HostUserId)?.DisplayName
                ?? g.Players.Where(p => p.Seat == 0 && p.UserId != null).Select(p => p.DisplayName).FirstOrDefault()
        }));
    }

    [HttpPost("games")]
    public async Task<IResult> PostGames([FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CreateGameReq? req, [FromServices] GameService games, [FromServices] IUserRepository users)
    {
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var uid = HommCaller.UserIdOf(HttpContext);
        if (string.IsNullOrEmpty(uid)) return Results.BadRequest(new { error = "Unknown player." });
        var game = await games.CreateGameAsync(
            req.Name ?? "The Three Cities",
            req.Capacity <= 0 ? 3 : req.Capacity,
            req.TurnSeconds <= 0 ? 300 : req.TurnSeconds,
            req.TurnLimit,
            req.MapSize <= 0 ? 72 : req.MapSize,
            Math.Clamp(req.AiPlayers, 0, 2),
            uid,
            await DisplayNameAsync(users, uid));
        return Results.Ok(new { gameId = game.Id });
    }

    // Take a seat in an existing game. Idempotent: a user who already has a seat
    // gets it back, so the lobby's Enter button is safe to press repeatedly.
    [HttpPost("games/{id:guid}/join")]
    public async Task<IResult> PostGamesJoin(Guid id, [FromServices] HommDb db, [FromServices] IUserRepository users)
    {
        var sp = HommCaller.From(HttpContext);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
        if (game == null) return Results.NotFound(new { error = "That game no longer exists." });

        var seats = await db.Players.Where(p => p.GameId == id).ToListAsync();
        var existing = seats.FirstOrDefault(p => p.UserId == sp.UserId);
        if (existing != null) return Results.Ok(new { playerId = existing.Id });

        var open = seats.Where(p => !p.IsAi && p.UserId == null).OrderBy(p => p.Seat).FirstOrDefault();
        if (open == null) return Results.BadRequest(new { error = "This game is full." });
        open.UserId = sp.UserId;
        open.DisplayName = await DisplayNameAsync(users, sp.UserId);
        await db.SaveChangesAsync();
        return Results.Ok(new { playerId = open.Id });
    }

    private async Task<string> DisplayNameAsync(IUserRepository users, string uid)
    {
        var user = await users.GetByIdAsync(uid);
        if (!string.IsNullOrWhiteSpace(user?.DisplayName)) return user.DisplayName;
        return User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Player";
    }
    [HttpGet("games/{id:guid}")]
    public async Task<IResult> GetGamesById(Guid id, [FromServices] HommDb db)
    {
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
        if (game == null) return Results.NotFound(new { error = "That game no longer exists." });

        var players = await db.Players.Where(p => p.GameId == id).ToListAsync();
        var towns = await db.Towns.Where(t => t.GameId == id).ToListAsync();
        var heroes = await db.Heroes.Where(h => h.GameId == id).ToListAsync();
        var me = HommCaller.UserIdOf(HttpContext);

        return Results.Ok(new
        {
            id = game.Id,
            name = game.Name,
            state = game.State.ToString(),
            day = game.Day,
            week = game.Week,
            month = game.Month,
            turn = game.CurrentTurn,
            turnSeconds = game.TurnSeconds,
            turnLimit = game.TurnLimit,
            turnStartedAt = game.TurnStartedAt,
            mapWidth = game.MapWidth,
            mapHeight = game.MapHeight,
            winnerUserId = game.WinnerUserId,
            endAgreement = GameService.ParseStringArray(game.EndAgreementJson),
            grailRevealed = game.GrailRevealed,
            grailX = game.GrailRevealed ? game.GrailX : (int?)null,
            grailY = game.GrailRevealed ? game.GrailY : (int?)null,
            players = players.Select(p => new
            {
                playerId = p.Id,
                name = GameService.SeatName(p),
                userId = p.UserId,
                isMe = me != null && p.UserId == me,
                faction = p.Faction,
                cityName = p.CityName,
                isAi = p.IsAi,
                precious = p.Precious,
                obeliskVisits = p.ObeliskVisits,
                resources = new
                {
                    wood = p.Wood, ore = p.Ore, mercury = p.Mercury, sulfur = p.Sulfur,
                    crystal = p.Crystal, gems = p.Gems, gold = p.Gold
                },
                townId = towns.FirstOrDefault(t => t.PlayerId == p.Id)?.Id,
                heroIds = heroes.Where(h => h.PlayerId == p.Id).Select(h => h.Id)
            })
        });
    }

    [HttpGet("games/{id:guid}/map")]
    public async Task<IResult> GetGamesMap(Guid id, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
        if (game == null) return Results.NotFound();

        var player = await db.Players.FirstOrDefaultAsync(p => p.GameId == id && p.UserId == sp.UserId);
        if (player == null) return Results.NotFound();

        var map = await games.LoadMapAsync(game);
        var fog = GameService.ParseFog(player.FogJson, map.Width * map.Height);
        var heroes = await db.Heroes.Where(h => h.GameId == id).ToListAsync();
        var towns = await db.Towns.Where(t => t.GameId == id).ToListAsync();

        var tiles = new List<object>(map.Tiles.Count);
        for (var i = 0; i < map.Tiles.Count; i++)
        {
            var t = map.Tiles[i];
            var f = fog[i];
            if (f == 0)
            {
                tiles.Add(new { terrain = (string?)null, variant = 0, objectKind = (string?)null, objectData = (string?)null, owner = -1, passable = false, fog = 0 });
                continue;
            }
            tiles.Add(new
            {
                terrain = t.Terrain,
                variant = t.Variant,
                objectKind = t.ObjectKind,
                objectData = t.ObjectData,
                sprite = t.Sprite,
                owner = t.Owner,
                mineShared = t.MineShared,
                passable = t.Passable,
                fog = f
            });
        }

        // Like HoMM3: other heroes are seen only in sight, other towns once explored.
        bool InSight(int x, int y) => map.InBounds(x, y) && fog[y * map.Width + x] == 2;
        bool Explored(int x, int y) => map.InBounds(x, y) && fog[y * map.Width + x] > 0;

        return Results.Ok(new
        {
            width = map.Width,
            height = map.Height,
            tiles,
            heroes = heroes.Where(h => h.PlayerId == player.Id || InSight(h.X, h.Y)).Select(h => new
            {
                id = h.Id,
                name = h.Name,
                faction = h.Faction,
                x = h.X,
                y = h.Y,
                level = h.Level,
                movement = h.Movement,
                maxMovement = h.MaxMovement,
                nativeTerrain = GameService.NativeTerrain(h),
                isMine = h.PlayerId == player.Id
            }),
            towns = towns.Where(t => t.PlayerId == player.Id || Explored(t.X, t.Y)).Select(t => new
            {
                id = t.Id,
                name = t.Name,
                faction = t.Faction,
                x = t.X,
                y = t.Y,
                isMine = t.PlayerId == player.Id,
                neutral = t.PlayerId == Guid.Empty
            })
        });
    }

    [HttpGet("games/{id:guid}/heroes")]
    public async Task<IResult> GetGamesHeroes(Guid id, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var player = await db.Players.FirstOrDefaultAsync(p => p.GameId == id && p.UserId == sp.UserId);
        if (player == null) return Results.NotFound();

        var heroes = await db.Heroes.Where(h => h.PlayerId == player.Id).ToListAsync();
        return Results.Ok(heroes.Select(HeroDto));
    }

    // End the current turn: advance the day and restore every hero's movement.
    [HttpPost("games/{id:guid}/endturn")]
    public async Task<IResult> PostGamesEndturn(Guid id, [FromServices] HommDb db, [FromServices] GameService games, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
        if (game == null) return Results.NotFound();
        if (game.State != GameState.InProgress) return Results.BadRequest(new { error = "The game is not in progress." });

        var player = await db.Players.FirstOrDefaultAsync(p => p.GameId == id && p.UserId == sp.UserId);
        if (player == null) return Results.NotFound();

        // force this game's turn to expire, then let the ticker do the day rollover
        game.TurnStartedAt = DateTime.UtcNow.AddSeconds(-(game.TurnSeconds + 1));
        await db.SaveChangesAsync();
        await games.TickAsync(false);

        var fresh = await db.Games.FirstAsync(g => g.Id == id);
        await ws.BroadcastAsync(id, "turnEnded", new { day = fresh.Day, week = fresh.Week, month = fresh.Month });
        return Results.Ok(new { day = fresh.Day, week = fresh.Week, month = fresh.Month, turn = fresh.CurrentTurn });
    }

    [HttpPost("games/{id:guid}/mine-sharing")]
    public async Task<IResult> PostGamesMineSharing(Guid id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] MineShareReq? req, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });
        var player = await db.Players.FirstOrDefaultAsync(p => p.GameId == id && p.UserId == sp.UserId);
        if (player == null) return Results.BadRequest(new { error = "Not in this game." });
        if (await InactiveGameAsync(db, id) is { } inactive) return inactive;
        var game = await db.Games.FirstAsync(g => g.Id == id);
        var map = await games.LoadMapAsync(game);
        if (!map.InBounds(req.X, req.Y)) return Results.BadRequest(new { error = "Unknown mine." });
        var mine = map.At(req.X, req.Y);
        var seat = player.Seat;
        if (mine.ObjectKind != "mine" || mine.Owner != (1 << seat))
            return Results.BadRequest(new { error = "Only the mine's owner may change its sharing." });
        mine.MineShared = req.Shared;
        game.MapJson = JsonSerializer.Serialize(map, Json);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    [HttpPost("games/{id:guid}/agreement")]
    public async Task<IResult> PostGamesAgreement(Guid id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AgreementReq? req, [FromServices] HommDb db, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
        if (game == null) return Results.NotFound();
        if (game.State != GameState.InProgress) return Results.BadRequest(new { error = "The game is not in progress." });
        var humans = await db.Players.Where(p => p.GameId == id && !p.IsAi && p.UserId != null).ToListAsync();
        var player = humans.FirstOrDefault(p => p.UserId == sp.UserId);
        if (player == null) return Results.BadRequest(new { error = "Not a human player in this game." });
        var votes = GameService.ParseStringArray(game.EndAgreementJson).Where(v => humans.Any(p => p.Id.ToString() == v)).ToHashSet();
        if (req.Agree) votes.Add(player.Id.ToString()); else votes.Remove(player.Id.ToString());
        game.EndAgreementJson = JsonSerializer.Serialize(votes, Json);
        if (humans.Count > 0 && humans.All(p => votes.Contains(p.Id.ToString())))
            game.State = GameState.Finished;
        await db.SaveChangesAsync();
        await ws.BroadcastAsync(id, "agreement", new { state = game.State.ToString(), votes });
        return Results.Ok(new { state = game.State.ToString(), votes });
    }
}
