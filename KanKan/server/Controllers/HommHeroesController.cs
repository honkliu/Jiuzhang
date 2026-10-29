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

/// <summary>HoMM game API (ported from City of Towers): heroes routes under /api/homm.</summary>
[Authorize]
[ApiExplorerSettings(IgnoreApi = true)]
[Route("api/homm")]
public class HommHeroesController : ControllerBase
{
    private static readonly JsonSerializerOptions Json = HommApi.Json;

    [HttpGet("heroes/{heroId:guid}")]
    public async Task<IResult> GetHeroesById(Guid heroId, [FromServices] HommDb db)
    {
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.Id == heroId);
        if (hero == null) return Results.NotFound();
        return Results.Ok(HeroDto(hero));
    }

    [HttpPost("heroes/{heroId:guid}/move")]
    public async Task<IResult> PostHeroesMove(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] MoveReq? req, [FromServices] GameService games, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        var path = (req.Path ?? []).Select(p => (p.X, p.Y)).ToList();
        var (ok, error, hero) = await games.MoveHeroAsync(heroId, playerId, path);
        if (!ok) return Results.BadRequest(new { error });
        await ws.BroadcastAsync(hero!.GameId, "heroMoved", new { heroId = hero.Id, x = hero.X, y = hero.Y });
        // the hero payload is unchanged; a move notice (enter-town, pickup) rides in a header
        if (games.LastMoveMessage != null) ctx.Response.Headers["X-Move-Message"] = games.LastMoveMessage;
        if (games.LastMoveNotices.Count > 0)
            ctx.Response.Headers["X-Move-Events"] = JsonSerializer.Serialize(games.LastMoveNotices, Json);
        return Results.Ok(HeroDto(hero!));
    }

    [HttpPost("heroes/{heroId:guid}/treasure")]
    public async Task<IResult> PostHeroesTreasure(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] TreasureReq? req, [FromServices] GameService games, [FromServices] HommDb db, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (ok, error, message) = await games.ResolveTreasureAsync(heroId, HommCaller.UserIdOf(ctx), req.Choice ?? "");
        if (!ok) return Results.BadRequest(new { error });
        var hero = await db.Heroes.FirstAsync(h => h.Id == heroId);
        await ws.BroadcastAsync(hero.GameId, "heroMoved", new { heroId });
        return Results.Ok(new { message, notices = games.LastMoveNotices });
    }

    // Rearrange or split stacks within a hero's own army (the hero screen).
    [HttpPost("heroes/{heroId:guid}/army")]
    public async Task<IResult> PostHeroesArmy(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ArmyMoveReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.Id == heroId);
        if (hero == null) return Results.NotFound();
        var player = await db.Players.FirstAsync(p => p.Id == hero.PlayerId);
        if (player.UserId != sp.UserId) return Results.BadRequest(new { error = "Not your hero." });
        if (await InactiveGameAsync(db, hero.GameId) is { } inactive) return inactive;

        var army = GameService.ParseArmy(hero.ArmyJson);
        var error = TownRules.Transfer(army, req.FromSlot, army, req.ToSlot, req.Count, true, true);
        if (error != null) return Results.BadRequest(new { error });
        hero.ArmyJson = GameService.SerializeArmy(army);
        await db.SaveChangesAsync();
        return Results.Ok(new { army });
    }

    // Legacy combat spells remain learnable catalogue entries, never paid no-op casts.
    [HttpPost("heroes/{heroId:guid}/cast")]
    public async Task<IResult> PostHeroesCast(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CastReq? req, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.Id == heroId);
        if (hero == null) return Results.NotFound();
        var player = await db.Players.FirstAsync(p => p.Id == hero.PlayerId);
        if (player.UserId != sp.UserId) return Results.BadRequest(new { error = "Not your hero." });

        if (hero.PendingEncounterJson != null || hero.PendingTreasureJson != null || hero.PendingLevelJson != null)
            return Results.BadRequest(new { error = "Resolve the pending encounter or treasure choice first." });
        var key = Spells.CanonicalKey(req.Spell ?? "");
        if (!Spells.All.TryGetValue(key, out var spell)) return Results.BadRequest(new { error = "Unknown spell." });
        if (!spell.Adventure) return Results.BadRequest(new { error = "That spell is not available in this peaceful game." });
        var known = GameService.ParseStringArray(hero.SpellsJson).Select(Spells.CanonicalKey);
        if (!known.Contains(key)) return Results.BadRequest(new { error = "Your hero does not know that spell." });
        if (!TownRules.HasGear(hero, TownRules.Spellbook)) return Results.BadRequest(new { error = "Your hero has no spellbook." });
        var skills = GameService.ParseSkills(hero.SkillsJson);
        var manaCost = Spells.ManaCost(spell, skills);
        if (hero.Mana < manaCost) return Results.BadRequest(new { error = "Not enough spell points." });

        var game = await db.Games.FirstAsync(g => g.Id == hero.GameId);
        if (game.State != GameState.InProgress) return Results.BadRequest(new { error = "The game is not in progress." });

        string message;
        object? view = null;
        var effects = GameService.Effects(hero);
        switch (key)
        {
            case "fly":
                var air = Math.Clamp(skills.GetValueOrDefault("air"), 0, 3);
                GameService.SetEffects(hero, effects with
                {
                    FlightTurn = game.CurrentTurn,
                    FlightPenalty = air >= 3 ? 0 : air >= 2 ? 20 : 40
                });
                message = "You can fly until tomorrow. Choose a legal landing tile.";
                break;
            case "haste":
                if (effects.HasteTurn == game.CurrentTurn)
                    return Results.BadRequest(new { error = "Haste is already active today." });
                var haste = skills.GetValueOrDefault("air") >= 2 ? 500 : 300;
                GameService.SetEffects(hero, effects with { HasteTurn = game.CurrentTurn, HasteBonus = haste });
                hero.MaxMovement += haste;
                hero.Movement += haste;
                message = $"Haste grants {haste} movement for today.";
                break;
            case "cure":
                GameService.SetEffects(hero, effects with { MovementPenalty = 0 });
                hero.MaxMovement = GameService.MaxMovement(hero) + (TownRules.StabledThisWeek(hero, game) ? 400 : 0)
                    + (effects.HasteTurn == game.CurrentTurn ? effects.HasteBonus : 0);
                message = effects.MovementPenalty > 0 ? "Cure removes the negative movement effect." : "Cure finds no negative adventure effects.";
                break;
            case "viewAir":
            case "viewEarth":
            {
                var map = await games.LoadMapAsync(game);
                var mastery = Math.Clamp(skills.GetValueOrDefault(spell.School), 0, 3);
                var locations = new List<object>();
                for (var y = 0; y < map.Height; y++)
                for (var x = 0; x < map.Width; x++)
                {
                    var tile = map.At(x, y);
                    var show = key == "viewAir" ? tile.ObjectKind == "artifact"
                        : tile.ObjectKind == "resource" || mastery >= 2 && tile.ObjectKind == "mine";
                    if (!show) continue;
                    var name = tile.ObjectKind == "artifact" ? Artifacts.Of(tile.ObjectData ?? "").Name
                        : (tile.ObjectData ?? "").Split(':')[0] + (tile.ObjectKind == "mine" ? " mine" : "");
                    locations.Add(new { kind = tile.ObjectKind, x, y, name });
                }
                if (key == "viewAir" && mastery >= 2)
                    foreach (var seen in await db.Heroes.Where(h => h.GameId == game.Id).ToListAsync())
                        locations.Add(new { kind = "hero", x = seen.X, y = seen.Y, name = seen.Name });
                if (key == "viewAir" && mastery >= 3)
                    foreach (var seen in await db.Towns.Where(t => t.GameId == game.Id).ToListAsync())
                        locations.Add(new { kind = "town", x = seen.X, y = seen.Y, name = seen.Name });
                var fog = GameService.ParseFog(player.FogJson, map.Width * map.Height);
                view = new
                {
                    width = map.Width, height = map.Height,
                    terrain = map.Tiles.Select((t, i) => key == "viewEarth" && mastery >= 3 || fog[i] > 0 ? t.Terrain : null),
                    locations
                };
                message = $"{spell.Name} reveals {locations.Count} locations on the world view.";
                break;
            }
            case "townPortal":
            {
                var mastery = Spells.Mastery(spell, skills);
                var towns = await db.Towns.Where(t => t.PlayerId == player.Id).ToListAsync();
                var town = mastery >= 2 ? towns.FirstOrDefault(t => t.Id == req.TownId)
                    : towns.OrderBy(t => (long)(t.X - hero.X) * (t.X - hero.X) + (long)(t.Y - hero.Y) * (t.Y - hero.Y)).ThenBy(t => t.Id).FirstOrDefault();
                if (town == null) return Results.BadRequest(new { error = mastery >= 2 ? "Choose an unoccupied town." : "You have no town." });
                if (await db.Heroes.AnyAsync(h => h.GameId == game.Id && h.X == town.X && h.Y == town.Y))
                    return Results.BadRequest(new { error = "That town already has a visiting hero." });
                var cost = mastery >= 3 ? 200 : 300;
                if (hero.Movement < cost) return Results.BadRequest(new { error = "Not enough movement points." });
                hero.X = town.X; hero.Y = town.Y; hero.Movement -= cost;
                GameService.VisitOwnTown(game, hero, town);
                message = $"You return to {town.Name}.";
                break;
            }
            case "dimensionDoor":
            {
                if (req.X is not { } tx || req.Y is not { } ty)
                    return Results.BadRequest(new { error = "Choose a destination." });
                var mastery = Spells.Mastery(spell, skills);
                var casts = effects.DoorTurn == game.CurrentTurn ? effects.DoorCasts : 0;
                if (casts >= mastery + 1) return Results.BadRequest(new { error = "Dimension Door has reached its daily limit." });
                if (hero.Movement <= 0) return Results.BadRequest(new { error = "Not enough movement points." });
                if (Math.Abs((long)tx - hero.X) > 9 || Math.Abs((long)ty - hero.Y) > 8)
                    return Results.BadRequest(new { error = "That destination is out of range." });
                var map = await games.LoadMapAsync(game);
                if (!map.InBounds(tx, ty) || (!map.At(tx, ty).Passable && map.At(tx, ty).Terrain != "water")
                    || map.At(tx, ty).Terrain == "rock"
                    || map.At(tx, ty).ObjectKind != null || (tx == hero.X && ty == hero.Y))
                    return Results.BadRequest(new { error = "You cannot appear there." });
                if (await db.Heroes.AnyAsync(h => h.GameId == game.Id && h.Id != hero.Id && h.X == tx && h.Y == ty))
                    return Results.BadRequest(new { error = "Another hero stands there." });
                var failed = map.At(tx, ty).Terrain == "water";
                if (!failed) { hero.X = tx; hero.Y = ty; }
                hero.Movement = Math.Max(0, hero.Movement - (mastery >= 3 ? 200 : 300));
                GameService.SetEffects(hero, effects with { DoorTurn = game.CurrentTurn, DoorCasts = casts + 1 });
                message = failed ? "Dimension Door failed!" : "You step through a door in space.";
                break;
            }
            case "visions":
                GameService.SetEffects(hero, effects with { VisionsTurn = game.CurrentTurn, VisionsMastery = Spells.Mastery(spell, skills) });
                message = "Visions reveals nearby creatures until tomorrow.";
                break;
            default:
                return Results.BadRequest(new { error = "That spell is not available in this peaceful game." });
        }

        hero.Mana -= manaCost;
        if (key is "townPortal" or "dimensionDoor")
        {
            var map = await games.LoadMapAsync(game);
            var fog = GameService.ParseFog(player.FogJson, map.Width * map.Height);
            GameService.RecomputeFog(fog, map.Width, map.Height,
                await db.Heroes.Where(h => h.PlayerId == player.Id).ToListAsync(),
                await db.Towns.Where(t => t.PlayerId == player.Id).ToListAsync());
            player.FogJson = GameService.SerializeFog(fog);
        }
        await db.SaveChangesAsync();
        return Results.Ok(new { message, mana = hero.Mana, x = hero.X, y = hero.Y, view });
    }

    [HttpPost("heroes/{heroId:guid}/encounter")]
    public async Task<IResult> PostHeroesEncounter(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] EncounterReq? req, [FromServices] SocialService social, [FromServices] HommDb db, [FromServices] WsHub ws)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var playerId = HommCaller.UserIdOf(ctx);
        var (ok, error, message) = await social.ResolveEncounterAsync(heroId, playerId, req.Action ?? "");
        if (!ok) return Results.BadRequest(new { error });
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.Id == heroId);
        if (hero != null)
            await ws.BroadcastAsync(hero.GameId, "encounter", new { heroId, action = req.Action });
        return Results.Ok(new { message });
    }

    [HttpGet("heroes/{heroId:guid}/visions")]
    public async Task<IResult> GetHeroesVisions(Guid heroId, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        var (hero, error) = await OwnHeroAsync(db, ctx, heroId);
        if (error != null) return error;
        var effects = GameService.Effects(hero!);
        var game = await db.Games.FirstAsync(g => g.Id == hero!.GameId);
        var targets = new List<VisionTarget>();
        if (effects.VisionsTurn != game.CurrentTurn) return Results.Ok(targets);
        var map = await games.LoadMapAsync(game);
        var player = await db.Players.FirstAsync(p => p.Id == hero!.PlayerId);
        var fog = GameService.ParseFog(player.FogJson, map.Width * map.Height);
        var radius = Math.Max(3, Math.Max(1, hero!.Power + Artifacts.Bonus(hero).Power) * Math.Max(1, effects.VisionsMastery));
        bool Visible(int x, int y) => map.InBounds(x, y) && fog[y * map.Width + x] == 2
            && (long)(x - hero.X) * (x - hero.X) + (long)(y - hero.Y) * (y - hero.Y) < (long)radius * radius;
        for (var y = 0; y < map.Height; y++)
        for (var x = 0; x < map.Width; x++)
        {
            var tile = map.At(x, y);
            if (tile.ObjectKind != "monster" || !Visible(x, y)) continue;
            var parts = (tile.ObjectData ?? "").Split(':');
            if (parts.Length < 2 || !Creatures.All.TryGetValue(parts[0], out var creature)
                || !int.TryParse(parts[1], out var count) || count <= 0) continue;
            var join = Encounters.CanRecruit(Encounters.Strength(hero.ArmyJson), Encounters.StackStrength(creature.AiValue, count));
            targets.Add(new("monster", creature.Name, x, y, [new(parts[0], count)], CanRecruit: join, Gold: Encounters.RecruitCost(creature.Gold, count)));
        }
        if (effects.VisionsMastery >= 2)
            foreach (var other in await db.Heroes.Where(h => h.GameId == game.Id && h.Id != hero.Id).ToListAsync())
                if (Visible(other.X, other.Y)) targets.Add(new("hero", other.Name, other.X, other.Y, GameService.ParseArmy(other.ArmyJson), other.Level));
        if (effects.VisionsMastery >= 3)
            foreach (var town in await db.Towns.Where(t => t.GameId == game.Id).ToListAsync())
                if (Visible(town.X, town.Y)) targets.Add(new("town", town.Name, town.X, town.Y, GameService.ParseArmy(town.GarrisonJson)));
        return Results.Ok(targets);
    }

    [HttpPost("heroes/{heroId:guid}/level-up")]
    public async Task<IResult> PostHeroesLevelUp(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] LevelUpReq? req, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (hero, error) = await OwnHeroAsync(db, ctx, heroId);
        if (error != null) return error;
        var choiceError = HeroProgression.Choose(hero!, req.Skill);
        if (choiceError != null) return Results.BadRequest(new { error = choiceError });
        var game = await db.Games.FirstAsync(g => g.Id == hero!.GameId);
        hero!.MaxMovement = GameService.MaxMovement(hero) + (TownRules.StabledThisWeek(hero, game) ? 400 : 0)
            + GameService.Effects(hero).HasteBonus;
        var player = await db.Players.FirstAsync(p => p.Id == hero.PlayerId);
        var map = await games.LoadMapAsync(game);
        var fog = GameService.ParseFog(player.FogJson, map.Width * map.Height);
        GameService.RecomputeFog(fog, map.Width, map.Height,
            await db.Heroes.Where(h => h.PlayerId == player.Id).ToListAsync(),
            await db.Towns.Where(t => t.PlayerId == player.Id).ToListAsync());
        player.FogJson = GameService.SerializeFog(fog);
        await db.SaveChangesAsync();
        return Results.Ok(HeroDto(hero));
    }

    [HttpPost("heroes/{heroId:guid}/exchange")]
    public async Task<IResult> PostHeroesExchange(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] HeroExchangeReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (hero, error) = await OwnHeroAsync(db, ctx, heroId);
        if (error != null) return error;
        var other = await db.Heroes.FirstOrDefaultAsync(h => h.Id == req.OtherHeroId);
        if (other == null || !CanExchange(hero!, other))
            return Results.BadRequest(new { error = "Your heroes must meet before exchanging belongings." });
        if (req.FromSlot.HasValue || req.ToSlot.HasValue)
        {
            if (!req.FromSlot.HasValue || !req.ToSlot.HasValue) return Results.BadRequest(new { error = "Choose both slots." });
            var from = GameService.ParseArmy(hero!.ArmyJson);
            var to = GameService.ParseArmy(other.ArmyJson);
            var transfer = TownRules.Transfer(from, req.FromSlot.Value, to, req.ToSlot.Value, req.Count, true, true);
            if (transfer != null) return Results.BadRequest(new { error = transfer });
            hero.ArmyJson = GameService.SerializeArmy(from);
            other.ArmyJson = GameService.SerializeArmy(to);
            await RefreshArmyMovementAsync(db, hero, other);
        }
        TeachScholar(hero!, other);
        await db.SaveChangesAsync();
        return Results.Ok(new { hero = HeroDto(hero!), other = HeroDto(other) });
    }

    [HttpPost("heroes/{heroId:guid}/dismiss-stack")]
    public async Task<IResult> PostHeroesDismissStack(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] DismissStackReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (hero, error) = await OwnHeroAsync(db, ctx, heroId);
        if (error != null) return error;
        if (!req.Confirmed) return Results.BadRequest(new { error = "Confirm dismissal first." });
        var army = GameService.ParseArmy(hero!.ArmyJson);
        if (req.Slot is < 0 or > 6 || army[req.Slot].Creature == null || army[req.Slot].Count <= 0)
            return Results.BadRequest(new { error = "Choose a creature stack." });
        if (army.Count(s => s.Creature != null && s.Count > 0) <= 1)
            return Results.BadRequest(new { error = "A hero must keep at least one stack." });
        army[req.Slot] = new(null, 0);
        hero.ArmyJson = GameService.SerializeArmy(army);
        await RefreshArmyMovementAsync(db, hero);
        await db.SaveChangesAsync();
        return Results.Ok(HeroDto(hero));
    }

    [HttpPost("heroes/{heroId:guid}/dismiss")]
    public async Task<IResult> PostHeroesDismiss(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ConfirmReq? req, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (hero, error) = await OwnHeroAsync(db, ctx, heroId);
        if (error != null) return error;
        if (!req.Confirmed) return Results.BadRequest(new { error = "Confirm dismissal first." });
        if (!await db.Towns.AnyAsync(t => t.PlayerId == hero!.PlayerId)
            && !await db.Heroes.AnyAsync(h => h.PlayerId == hero!.PlayerId && h.Id != hero.Id))
            return Results.BadRequest(new { error = "You cannot dismiss your last hero without a town." });
        db.Heroes.Remove(hero!);
        await db.SaveChangesAsync();
        await RefreshHeroSightAsync(db, games, hero!);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    [HttpPost("heroes/{heroId:guid}/artifacts")]
    public async Task<IResult> PostHeroesArtifacts(Guid heroId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ArtifactMoveReq? req, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (hero, error) = await OwnHeroAsync(db, ctx, heroId);
        if (error != null) return error;
        var other = req.ToHeroId == null || req.ToHeroId == heroId ? hero
            : await db.Heroes.FirstOrDefaultAsync(h => h.Id == req.ToHeroId);
        if (other == null || (other != hero && !CanExchange(hero!, other)))
            return Results.BadRequest(new { error = "Your heroes must meet before exchanging artifacts." });
        var from = Artifacts.Layout(hero!);
        var to = other == hero ? from : Artifacts.Layout(other);
        if (req.From == req.To && other == hero) return Results.BadRequest(new { error = "Choose another slot." });
        if (string.IsNullOrEmpty(req.From) || string.IsNullOrEmpty(req.To))
            return Results.BadRequest(new { error = "Choose both artifact slots." });
        bool Backpack(string place, out int index)
        {
            index = -1;
            return place.StartsWith("backpack:", StringComparison.Ordinal) && int.TryParse(place.AsSpan(9), out index);
        }
        string? At(Artifacts.Equipment e, string place)
        {
            if (Backpack(place, out var n)) return n >= 0 && n < e.Backpack.Count ? e.Backpack[n] : null;
            return e.Worn.GetValueOrDefault(place);
        }
        bool Valid(Artifacts.Equipment e, string place, string? key) => Backpack(place, out var n)
            ? n >= 0 && n <= e.Backpack.Count && (n < e.Backpack.Count || key == null || e.Backpack.Count < 64)
            : Artifacts.Slots.Contains(place) && (key == null || Artifacts.Fits(place, key));
        void Put(Artifacts.Equipment e, string place, string? key)
        {
            if (Backpack(place, out var n))
            {
                if (key == null) e.Backpack.RemoveAt(n);
                else if (n == e.Backpack.Count) e.Backpack.Add(key);
                else e.Backpack[n] = key;
            }
            else if (key == null) e.Worn.Remove(place);
            else e.Worn[place] = key;
        }
        var item = At(from, req.From);
        var displaced = At(to, req.To);
        if (item == null || !Valid(to, req.To, item) || !Valid(from, req.From, displaced))
            return Results.BadRequest(new { error = "The artifact does not fit that slot, or the backpack is full." });
        // Write the destination first: removing a source backpack entry shifts later indices.
        Put(to, req.To, item);
        Put(from, req.From, displaced);
        Artifacts.Save(hero!, from);
        if (other != hero) Artifacts.Save(other, to);
        if (other != hero) TeachScholar(hero!, other);
        await RefreshHeroSightAsync(db, games, hero!);
        await db.SaveChangesAsync();
        return Results.Ok(new { hero = HeroDto(hero!), other = other == hero ? null : HeroDto(other) });
    }
}
