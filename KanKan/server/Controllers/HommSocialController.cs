using System.Text.Json;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Repositories.Homm;
using KanKan.API.Services.Homm;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using static KanKan.API.Controllers.Homm.HommApi;

namespace KanKan.API.Controllers.Homm;

/// <summary>HoMM game API (ported from City of Towers): social routes under /api/homm.</summary>
[Authorize]
[ApiExplorerSettings(IgnoreApi = true)]
[Route("api/homm")]
public class HommSocialController : ControllerBase
{
    private static readonly JsonSerializerOptions Json = HommApi.Json;

    // The obelisk board: the player's HoMM3 puzzle map (a terrain-only view centred on the Grail,
    // uncovered piece by piece as obelisks are read) and the notes players left on the stone.
    [HttpGet("games/{id:guid}/obelisk")]
    public async Task<IResult> GetGamesObelisk(Guid id, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var player = await db.Players.FirstOrDefaultAsync(p => p.GameId == id && p.UserId == sp.UserId);
        if (player == null) return Results.NotFound();

        var game = await db.Games.FirstAsync(g => g.Id == id);
        var map = await games.LoadMapAsync(game);
        var visited = GameService.ParseVisitedObelisks(player.ObelisksVisitedJson).Count;
        var total = GameService.ObeliskTotal(map);
        var players = await db.Players.Where(p => p.GameId == id).ToListAsync();
        var msgs = await db.ObeliskMessages.Where(m => m.GameId == id).OrderBy(m => m.CreatedAt).ToListAsync();

        const int w = 21, h = 19;
        var gx = game.GrailX >= 0 ? game.GrailX : map.Width / 2;
        var gy = game.GrailY >= 0 ? game.GrailY : map.Height / 2;
        int ox = gx - w / 2, oy = gy - h / 2;
        var tiles = new List<object>(w * h);
        for (var y = oy; y < oy + h; y++)
        for (var x = ox; x < ox + w; x++)
        {
            if (!map.InBounds(x, y))
            {
                tiles.Add(new { terrain = (string?)null, variant = 0, objectKind = (string?)null, objectData = (string?)null, owner = -1, passable = false, fog = 0 });
                continue;
            }
            var t = map.At(x, y);
            var natural = t.ObjectKind is "tree" or "rock" or "mountain";
            tiles.Add(new
            {
                terrain = t.Terrain,
                variant = t.Variant,
                objectKind = natural ? t.ObjectKind : null,
                objectData = natural ? t.ObjectData : null,
                sprite = natural ? t.Sprite : null,
                owner = -1,
                passable = natural ? t.Passable : Terrain.Passable(t.Terrain),
                fog = 2
            });
        }

        return Results.Ok(new
        {
            visited,
            total,
            complete = total > 0 && visited >= total,
            faction = player.Faction,
            grailFound = game.GrailFound,
            puzzle = new { width = w, height = h, grailX = gx - ox, grailY = gy - oy, tiles },
            messages = msgs.Select(m =>
            {
                var author = players.FirstOrDefault(p => p.Id == m.AuthorUserId);
                return new
                {
                    id = m.Id,
                    author = author == null ? "A traveller" : $"{GameService.SeatName(author)} of {author.CityName}",
                    mine = author?.Id == player.Id,
                    body = m.Body,
                    createdAt = m.CreatedAt
                };
            })
        });
    }

    [HttpPost("games/{id:guid}/obelisk/message")]
    public async Task<IResult> PostGamesObeliskMessage(Guid id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] BodyReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });
        if (string.IsNullOrWhiteSpace(req.Body)) return Results.BadRequest(new { error = "Message cannot be empty." });

        var player = await db.Players.FirstOrDefaultAsync(p => p.GameId == id && p.UserId == sp.UserId);
        if (player == null) return Results.NotFound();

        var m = new ObeliskMessage { GameId = id, AuthorUserId = player.Id, Body = req.Body.Trim() };
        db.ObeliskMessages.Add(m);
        await db.SaveChangesAsync();
        return Results.Ok(new { messageId = m.Id });
    }

    [HttpGet("games/{id:guid}/messages")]
    public async Task<IResult> GetGamesMessages(Guid id, [FromServices] SocialService social)
    {
        var ctx = HttpContext;
        var playerId = HommCaller.UserIdOf(ctx);
        return Results.Ok(await social.GetHeroMessagesAsync(id, playerId));
    }

    [HttpPost("games/{id:guid}/messages")]
    public async Task<IResult> PostGamesMessages(Guid id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] MessageReq? req, [FromServices] SocialService social, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        if (!Guid.TryParse(req.ToPlayerId, out var to)) return Results.BadRequest(new { error = "Recipient required." });
        var (ok, error) = await social.SendHeroMessageAsync(id, playerId, to, req.Body ?? "");
        if (!ok) return Results.BadRequest(new { error });
        await ws.BroadcastAsync(id, "message", new { toPlayerId = to });
        return Results.NoContent();
    }

    [HttpGet("games/{id:guid}/trades")]
    public async Task<IResult> GetGamesTrades(Guid id, [FromServices] SocialService social)
    {
        var ctx = HttpContext;
        var playerId = HommCaller.UserIdOf(ctx);
        return Results.Ok(await social.GetTradesAsync(id, playerId));
    }

    [HttpPost("games/{id:guid}/trades")]
    public async Task<IResult> PostGamesTrades(Guid id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] TradeOfferReq? req, [FromServices] SocialService social, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        if (!Guid.TryParse(req.ToPlayerId, out var to)) return Results.BadRequest(new { error = "Recipient required." });
        var (ok, error) = await social.OfferTradeAsync(id, playerId, to,
            req.Give ?? "", req.GiveAmount, req.Want ?? "", req.WantAmount);
        if (!ok) return Results.BadRequest(new { error });
        await ws.BroadcastAsync(id, "trade", new { toPlayerId = to });
        return Results.NoContent();
    }

    [HttpPost("trades/{offerId:guid}/respond")]
    public async Task<IResult> PostTradesRespond(Guid offerId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RespondReq? req, [FromServices] SocialService social, [FromServices] HommDb db, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        var (ok, error) = await social.RespondTradeAsync(offerId, playerId, req.Accept);
        if (!ok) return Results.BadRequest(new { error });
        var offer = await db.TradeOffers.FirstOrDefaultAsync(o => o.Id == offerId);
        if (offer != null) await ws.BroadcastAsync(offer.GameId, "trade", new { offerId });
        return Results.NoContent();
    }

    [HttpGet("games/{id:guid}/projects")]
    public async Task<IResult> GetGamesProjects(Guid id, [FromServices] SocialService social)
    {
        return Results.Ok(await social.GetProjectsAsync(id));
    }

    [HttpPost("projects/{projectId:guid}/contribute")]
    public async Task<IResult> PostProjectsContribute(Guid projectId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ContributeReq? req, [FromServices] SocialService social, [FromServices] HommDb db, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        var (ok, error) = await social.ContributeAsync(projectId, playerId, req.Gold, req.Wood, req.Ore);
        if (!ok) return Results.BadRequest(new { error });
        var project = await db.SharedProjects.FirstAsync(p => p.Id == projectId);
        await ws.BroadcastAsync(project.GameId, "project", new { projectId, completed = project.Completed });
        return Results.NoContent();
    }

    [HttpGet("games/{id:guid}/annotations")]
    public async Task<IResult> GetGamesAnnotations(Guid id, [FromServices] SocialService social)
    {
        return Results.Ok(await social.GetAnnotationsAsync(id));
    }

    [HttpPost("games/{id:guid}/annotations")]
    public async Task<IResult> PostGamesAnnotations(Guid id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AnnotationReq? req, [FromServices] SocialService social, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        var (ok, error) = await social.AddAnnotationAsync(id, playerId, req.X, req.Y, req.Text ?? "");
        if (!ok) return Results.BadRequest(new { error });
        await ws.BroadcastAsync(id, "annotation", new { x = req.X, y = req.Y });
        return Results.NoContent();
    }

    [HttpGet("towns/{townId:guid}/posts")]
    public async Task<IResult> GetTownsPosts(Guid townId, [FromServices] HommDb db)
    {
        var posts = await db.Posts.Where(p => p.TownId == townId).OrderBy(p => p.CreatedAt).ToListAsync();
        return Results.Ok(posts.Select(p => new
        {
            id = p.Id, title = p.Title, body = p.Body, imageUrl = p.ImageUrl,
            createdAt = p.CreatedAt, updatedAt = p.UpdatedAt
        }));
    }

    [HttpPost("towns/{townId:guid}/posts")]
    public async Task<IResult> PostTownsPosts(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] PostReq? req, [FromServices] SocialService social)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        var (id, error) = await social.CreatePostAsync(townId, playerId, req.Title ?? "", req.Body ?? "", req.ImageUrl);
        if (error != null) return Results.BadRequest(new { error });
        return Results.Ok(new { postId = id });
    }

    [HttpGet("posts/{postId:guid}/comments")]
    public async Task<IResult> GetPostsComments(Guid postId, [FromServices] HommDb db)
    {
        var comments = await db.Comments.Where(c => c.PostId == postId).OrderBy(c => c.CreatedAt).ToListAsync();
        var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == postId);
        var postTown = post == null ? null : await db.Towns.FirstOrDefaultAsync(t => t.Id == post.TownId);
        var players = postTown == null ? [] : await db.Players.Where(p => p.GameId == postTown.GameId).ToListAsync();
        string NameOf(Guid id) =>
            players.FirstOrDefault(p => p.Id == id) is { } who ? GameService.SeatName(who) : "?";
        return Results.Ok(comments.Select(c => new
        {
            id = c.Id, author = NameOf(c.AuthorUserId), body = c.Body, createdAt = c.CreatedAt
        }));
    }

    [HttpPost("posts/{postId:guid}/comments")]
    public async Task<IResult> PostPostsComments(Guid postId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] BodyReq? req, [FromServices] SocialService social)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        var (id, error) = await social.AddCommentAsync(postId, playerId, req.Body ?? "");
        if (error != null) return Results.BadRequest(new { error });
        return Results.Ok(new { commentId = id });
    }

    [HttpGet("towns/{townId:guid}/wall")]
    public async Task<IResult> GetTownsWall(Guid townId, [FromServices] HommDb db)
    {
        var msgs = await db.WallMessages.Where(m => m.TownId == townId).OrderBy(m => m.CreatedAt).ToListAsync();
        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        var players = town == null ? [] : await db.Players.Where(p => p.GameId == town.GameId).ToListAsync();
        string NameOf(Guid id) =>
            players.FirstOrDefault(p => p.Id == id) is { } who ? GameService.SeatName(who) : "?";
        return Results.Ok(msgs.Select(m => new
        {
            id = m.Id, author = NameOf(m.AuthorUserId), body = m.Body,
            parentId = m.ParentId, createdAt = m.CreatedAt
        }));
    }

    [HttpPost("towns/{townId:guid}/wall")]
    public async Task<IResult> PostTownsWall(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] WallReq? req, [FromServices] SocialService social, [FromServices] HommDb db, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        if (await TownHiddenAsync(db, townId, playerId)) return Results.BadRequest(new { error = "You have not discovered that town yet." });
        var (id, error) = await social.AddWallMessageAsync(townId, playerId, req.Body ?? "", req.ParentId);
        if (error != null) return Results.BadRequest(new { error });
        await NotifyTownAsync(db, ws, townId, "wall");
        return Results.Ok(new { messageId = id });
    }

    [HttpGet("towns/{townId:guid}/tower")]
    public async Task<IResult> GetTownsTower(Guid townId, [FromServices] HommDb db)
    {
        var msgs = await db.TowerMessages.Where(m => m.TownId == townId).OrderBy(m => m.CreatedAt).ToListAsync();
        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        var players = town == null ? [] : await db.Players.Where(p => p.GameId == town.GameId).ToListAsync();
        string NameOf(Guid id) =>
            players.FirstOrDefault(p => p.Id == id) is { } who ? GameService.SeatName(who) : "?";
        return Results.Ok(msgs.Select(m => new
        {
            id = m.Id, author = NameOf(m.AuthorUserId), body = m.Body, createdAt = m.CreatedAt
        }));
    }

    [HttpPost("towns/{townId:guid}/tower")]
    public async Task<IResult> PostTownsTower(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] BodyReq? req, [FromServices] SocialService social, [FromServices] HommDb db, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        if (await TownHiddenAsync(db, townId, playerId)) return Results.BadRequest(new { error = "You have not discovered that town yet." });
        var (id, error) = await social.AddTowerMessageAsync(townId, playerId, req.Body ?? "");
        if (error != null) return Results.BadRequest(new { error });
        await NotifyTownAsync(db, ws, townId, "tower");
        return Results.Ok(new { messageId = id });
    }
}
