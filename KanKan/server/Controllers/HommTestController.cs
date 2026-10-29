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

/// <summary>HoMM game API (ported from City of Towers): test routes under /api/homm.</summary>
[Authorize]
[ApiExplorerSettings(IgnoreApi = true)]
[Route("api/homm")]
public class HommTestController : ControllerBase
{
    private static readonly JsonSerializerOptions Json = HommApi.Json;

    // reveals the whole map for one player so API tests can reach distant towns
    [HttpPost("games/{id:guid}/_test/explore")]
    public async Task<IResult> PostGamesTestExplore(Guid id, [FromServices] HommDb db, [FromServices] IHostEnvironment env)
    {
        var ctx = HttpContext;
        if (!env.IsDevelopment()) return Results.NotFound();
        var sp = HommCaller.From(ctx);
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
        if (sp == null || game == null) return Results.NotFound();
        var player = await db.Players.FirstOrDefaultAsync(p => p.GameId == id && p.UserId == sp.UserId);
        if (player == null) return Results.NotFound();
        var fog = GameService.ParseFog(player.FogJson, game.MapWidth * game.MapHeight);
        for (var i = 0; i < fog.Length; i++) if (fog[i] == 0) fog[i] = 1;
        player.FogJson = GameService.SerializeFog(fog);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    // gives a hero map artifacts by key (artifact{n}) so API tests can check the paper-doll rules
    [HttpPost("heroes/{id:guid}/_test/artifacts")]
    public async Task<IResult> PostHeroesTestArtifacts(Guid id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] string[]? keys, [FromServices] HommDb db, [FromServices] IHostEnvironment env)
    {
        if (keys is null) return Results.BadRequest(new { error = "A request body is required." });
        if (!env.IsDevelopment()) return Results.NotFound();
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.Id == id);
        if (hero == null) return Results.NotFound();
        var gear = GameService.ParseStringArray(hero.ArtifactsJson).Where(TownRules.IsGear);
        hero.ArtifactsJson = System.Text.Json.JsonSerializer.Serialize(gear.Concat(keys).ToList());
        hero.ArtifactLayoutJson = "{}";
        await db.SaveChangesAsync();
        return Results.Ok(HeroDto(hero));
    }

    // Deterministic adventure states for browser regressions.
    [HttpPost("heroes/{id:guid}/_test/adventure")]
    public async Task<IResult> PostHeroesTestAdventure(Guid id, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] AdventureFixtureReq? req, [FromServices] HommDb db, [FromServices] GameService games, [FromServices] IHostEnvironment env)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        if (!env.IsDevelopment()) return Results.NotFound();
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.Id == id);
        if (hero == null) return Results.NotFound();
        var player = await db.Players.FirstAsync(p => p.Id == hero.PlayerId);
        if (HommCaller.From(ctx)?.UserId != player.UserId) return Results.NotFound();
        var game = await db.Games.FirstAsync(g => g.Id == hero.GameId);
        var map = await games.LoadMapAsync(game);
        if (req.Army != null) hero.ArmyJson = GameService.SerializeArmy(req.Army);
        if (req.Skills != null) hero.SkillsJson = System.Text.Json.JsonSerializer.Serialize(req.Skills);
        if (req.Gold is { } gold) player.Gold = Math.Max(0, gold);
        if (req.Spells != null)
        {
            TownRules.AddGear(hero, TownRules.Spellbook);
            hero.SpellsJson = System.Text.Json.JsonSerializer.Serialize(req.Spells);
            hero.Knowledge = 10;
            hero.Mana = hero.MaxMana = 100;
        }
        if (req.MovementPenalty > 0)
            GameService.SetEffects(hero, new AdventureEffects(MovementPenalty: req.MovementPenalty));
        hero.Movement = hero.MaxMovement = GameService.MaxMovement(hero);
        if (req.MovementPenalty > 0) hero.Movement = 500;
        if (req.Treasure || req.FlightLane)
        {
            hero.Y++;
            var start = map.At(hero.X, hero.Y);
            start.Terrain = "grass"; start.ObjectKind = null; start.ObjectData = null; start.Passable = true;
            var tile = map.At(hero.X, hero.Y + 1);
            tile.Terrain = "grass";
            tile.ObjectKind = req.Treasure ? "treasure" : "tree";
            tile.ObjectData = req.Treasure ? "1500:1000" : null;
            tile.Passable = req.Treasure;
            var end = map.At(hero.X, hero.Y + 2);
            end.Terrain = "grass"; end.ObjectKind = null; end.ObjectData = null; end.Passable = true;
        }
        if (req.SurveyTargets)
        {
            map.At(0, 0).ObjectKind = "artifact"; map.At(0, 0).ObjectData = "artifact1";
            map.At(1, 0).ObjectKind = "resource"; map.At(1, 0).ObjectData = "wood:5";
        }
        if (req.ObjectKind != null)
        {
            var town = await db.Towns.FirstAsync(t => t.PlayerId == player.Id);
            hero.X = town.X; hero.Y = town.Y + 5;
            for (var y = town.Y + 1; y <= town.Y + 6; y++)
            for (var x = town.X - 4; x <= town.X + 4; x++)
            {
                var tile = map.At(x, y);
                tile.Terrain = "grass"; tile.ObjectKind = null; tile.ObjectData = null; tile.Sprite = null; tile.Passable = true;
            }
            if (req.ObjectKind == "obelisk")
                foreach (var old in map.Tiles.Where(t => t.ObjectKind == "obelisk"))
                { old.ObjectKind = null; old.ObjectData = null; old.Passable = true; }
            if (req.ObjectKind == "town")
            {
                // an unowned town whose entrance is the tile above the hero
                var ax = hero.X; var ay = hero.Y - 1;
                var neutral = new Town
                {
                    GameId = game.Id, PlayerId = Guid.Empty, Name = "Castellatus", Faction = req.ObjectData ?? "castle",
                    X = ax, Y = ay, BuildingsJson = "[\"villageHall\",\"fort\",\"dwelling1\"]", AvailableJson = "{\"1\":14}",
                    GarrisonJson = GameService.SerializeArmy(Enumerable.Range(0, 7).Select(_ => new GameService.ArmySlot(null, 0)).ToArray())
                };
                db.Towns.Add(neutral);
                var anchor = map.At(ax, ay);
                anchor.ObjectKind = "town"; anchor.ObjectData = neutral.Id.ToString(); anchor.Owner = -1; anchor.Passable = false;
                Footprint.Stamp(map, ax, ay, "town", null);
            }
            var target = map.At(hero.X, hero.Y - 1);
            if (req.ObjectKind != "town")
            {
            target.ObjectKind = req.ObjectKind;
            target.ObjectData = req.ObjectData;
            target.Owner = 0;
            target.Passable = req.ObjectKind is "resource" or "artifact" or "treasure" or "grail";
            }
            if (req.ObjectKind == "grail")
            {
                game.GrailX = hero.X; game.GrailY = hero.Y - 1;
                player.ObeliskVisits = 10;
            }
            if (req.Wisdom > 0)
            {
                var skills = GameService.ParseSkills(hero.SkillsJson);
                skills["wisdom"] = req.Wisdom;
                hero.SkillsJson = System.Text.Json.JsonSerializer.Serialize(skills);
            }
        }
        if (req.Movement is { } movement) hero.Movement = Math.Clamp(movement, 0, hero.MaxMovement);
        if (req.Meeting != null)
        {
            var town = await db.Towns.FirstAsync(t => t.PlayerId == player.Id);
            hero.X = town.X; hero.Y = town.Y + 3;
            for (var y = hero.Y - 1; y <= hero.Y + 2; y++)
            for (var x = hero.X - 1; x <= hero.X + 2; x++)
            {
                var tile = map.At(x, y);
                tile.Terrain = "grass"; tile.ObjectKind = null; tile.ObjectData = null; tile.Passable = true;
            }
            var owner = req.Meeting == "own" ? player : await db.Players.FirstAsync(p => p.GameId == game.Id && p.Faction == "rampart");
            if (owner != player) owner.IsAi = false;
            var friend = GameService.CreateHero(game.Id, owner.Id, Seeded.Players[owner.Seat], hero.X + 1, hero.Y);
            friend.Name = req.Meeting == "own" ? "Companion" : "Visitor";
            db.Heroes.Add(friend);
        }
        if (req.PortalTown)
        {
            var tx = hero.X + 5; var ty = hero.Y + 5;
            var town = new Town { GameId = game.Id, PlayerId = player.Id, Faction = player.Faction, Name = "Portal destination", X = tx, Y = ty };
            db.Towns.Add(town);
            var tile = map.At(tx, ty);
            tile.Terrain = "grass"; tile.ObjectKind = "town"; tile.ObjectData = town.Id.ToString(); tile.Passable = false;
        }
        if (req.Experience > 0) GameService.GainExperience(hero, req.Experience);
        if (req.Buildings != null)
        {
            var town = await db.Towns.FirstAsync(t => t.PlayerId == player.Id);
            town.BuildingsJson = JsonSerializer.Serialize(req.Buildings, Json);
            town.AvailableJson = JsonSerializer.Serialize(new Dictionary<string, int> { ["1"] = 20, ["2"] = 20, ["7"] = 3 }, Json);
            foreach (var key in req.Buildings.Where(k => k.StartsWith("mageGuild"))) TownRules.StockGuild(town, key);
            player.Wood = player.Ore = player.Mercury = player.Sulfur = player.Crystal = player.Gems = 50;
        }
        var fog = GameService.ParseFog(player.FogJson, map.Width * map.Height);
        GameService.RecomputeFog(fog, map.Width, map.Height,
            await db.Heroes.Where(h => h.PlayerId == player.Id).ToListAsync(),
            await db.Towns.Where(t => t.PlayerId == player.Id).ToListAsync());
        player.FogJson = GameService.SerializeFog(fog);
        await games.SaveMapAsync(game, map);
        return Results.Ok(HeroDto(hero));
    }

    // advances this game one day so API tests can walk long distances
    [HttpPost("games/{id:guid}/_test/nextday")]
    public async Task<IResult> PostGamesTestNextday(Guid id, [FromServices] HommDb db, [FromServices] GameService games, [FromServices] WsHub ws, [FromServices] IHostEnvironment env)
    {
        if (!env.IsDevelopment()) return Results.NotFound();
        // force the turn timer to expire so TickAsync advances this game
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
        if (game == null) return Results.NotFound();
        game.TurnStartedAt = DateTime.UtcNow.AddSeconds(-(game.TurnSeconds + 1));
        await db.SaveChangesAsync();
        foreach (var advanced in await games.TickAsync(false))
            await ws.BroadcastAsync(advanced, "turnAdvanced", new { gameId = advanced });
        return Results.NoContent();
    }
}
