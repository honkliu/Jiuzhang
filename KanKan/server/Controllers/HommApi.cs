using System.Text.Json;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Repositories.Homm;
using KanKan.API.Services.Homm;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace KanKan.API.Controllers.Homm;

/// <summary>Helpers shared by the HoMM controllers (ported from City of Towers' Endpoints).</summary>
public static partial class HommApi
{
    internal static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    internal static async Task NotifyTownAsync(HommDb db, WsHub ws, Guid townId, string type)
    {
        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town != null) await ws.BroadcastAsync(town.GameId, type, new { townId });
    }

    /// <summary>Marketplaces the player owns across all their towns (HoMM3 trade rates improve with each).</summary>
    internal static async Task<int> MarketCountAsync(HommDb db, Guid gameId, Guid playerId)
    {
        var towns = await db.Towns.Where(t => t.GameId == gameId && t.PlayerId == playerId).Select(t => t.BuildingsJson).ToListAsync();
        return towns.Count(b => GameService.ParseStringArray(b).Contains("marketplace"));
    }

    /// <summary>True when the caller is a player in the town's game who has not yet explored its tile.</summary>
    internal static async Task<bool> TownHiddenAsync(HommDb db, Guid townId, string? playerId)
    {
        var sp = HommCaller.From(playerId);
        if (sp == null) return false;
        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return false;
        var viewer = await db.Players.FirstOrDefaultAsync(p => p.GameId == town.GameId && p.UserId == sp.UserId);
        if (viewer == null || viewer.Id == town.PlayerId) return false;
        var game = await db.Games.FirstAsync(g => g.Id == town.GameId);
        var fog = GameService.ParseFog(viewer.FogJson, game.MapWidth * game.MapHeight);
        var i = town.Y * game.MapWidth + town.X;
        return i < 0 || i >= fog.Length || fog[i] == 0;
    }

    /// <summary>Loads a town and checks the caller owns it.</summary>
    internal static async Task<(Town? town, Player? player, IResult? error)> OwnTownAsync(HommDb db, HttpContext ctx, Guid townId)
    {
        var sp = HommCaller.From(ctx);
        if (sp == null) return (null, null, Results.BadRequest(new { error = "Unknown player." }));
        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return (null, null, Results.NotFound());
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
        if (player == null || player.UserId != sp.UserId) return (null, null, Results.BadRequest(new { error = "Not your town." }));
        if (await InactiveGameAsync(db, town.GameId) is { } inactive) return (null, null, inactive);
        return (town, player, null);
    }

    internal static async Task<IResult?> InactiveGameAsync(HommDb db, Guid gameId) =>
        await db.Games.AnyAsync(g => g.Id == gameId && g.State == GameState.InProgress)
            ? null : Results.BadRequest(new { error = "The game is not in progress." });

    internal static async Task<object?> HeroInTownAsync(HommDb db, Guid playerId, int x, int y)
    {
        // the hero steps onto its own town's tile, so "in town" means standing on it
        var hero = await db.Heroes.FirstOrDefaultAsync(h =>
            h.PlayerId == playerId && h.X == x && h.Y == y);
        if (hero == null) return null;
        return new
        {
            id = hero.Id, name = hero.Name, heroKey = hero.HeroKey, army = GameService.ParseArmy(hero.ArmyJson),
            spellbook = TownRules.HasGear(hero, TownRules.Spellbook),
            warMachines = TownRules.WarMachines(hero),
            spells = GameService.ParseStringArray(hero.SpellsJson),
            wisdom = GameService.ParseSkills(hero.SkillsJson).TryGetValue("wisdom", out var w) ? w : 0
        };
    }

    internal static object ArtifactDto(string key)
    {
        var d = Artifacts.Of(key);
        return new { key, id = d.Id, name = d.Name, slot = d.Slot, attack = d.Attack, defense = d.Defense, power = d.Power, knowledge = d.Knowledge };
    }

    internal static object HeroDto(Hero h)
    {
        var arts = TownRules.Artifacts(h);
        var (worn, backpack) = Artifacts.Layout(h);
        var bonus = Artifacts.Bonus(h);
        var effects = GameService.Effects(h);
        // HoMM3 shows the totals including worn artifacts; attack/defense floor at 0, power/knowledge at 1
        return new
        {
            id = h.Id,
            name = h.Name,
            heroKey = h.HeroKey,
            heroClass = NativeRules.ClassOf(h).Name,
            faction = h.Faction,
            level = h.Level,
            experience = h.Experience,
            nextLevel = Experience.NextThreshold(h.Level),
            attack = Math.Max(0, h.Attack + bonus.Attack),
            defense = Math.Max(0, h.Defense + bonus.Defense),
            power = Math.Max(1, h.Power + bonus.Power),
            knowledge = Math.Max(1, h.Knowledge + bonus.Knowledge),
            baseStats = new { attack = h.Attack, defense = h.Defense, power = h.Power, knowledge = h.Knowledge },
            mana = h.Mana,
            maxMana = h.MaxMana,
            movement = h.Movement,
            maxMovement = h.MaxMovement,
            nativeTerrain = GameService.NativeTerrain(h),
            x = h.X,
            y = h.Y,
            army = GameService.ParseArmy(h.ArmyJson),
            strength = GameService.ArmyStrength(GameService.ParseArmy(h.ArmyJson)),
            skills = GameService.ParseSkills(h.SkillsJson).Where(kv => !kv.Key.StartsWith('_')).ToDictionary(kv => kv.Key, kv => kv.Value),
            spells = GameService.ParseStringArray(h.SpellsJson).Select(Spells.CanonicalKey).Distinct(),
            artifacts = arts,
            worn = worn.ToDictionary(kv => kv.Key, kv => ArtifactDto(kv.Value)),
            backpack = backpack.Select(ArtifactDto),
            spellbook = TownRules.HasGear(h, TownRules.Spellbook),
            warMachines = TownRules.WarMachines(h),
            pendingEncounter = h.PendingEncounterJson,
            encounterOffer = SocialService.GetEncounterOffer(h),
            pendingTreasure = GameService.Treasure(h),
            pendingLevel = HeroProgression.Pending(h),
            flying = effects.FlightTurn > 0,
            flightPenalty = effects.FlightPenalty,
            hasteBonus = effects.HasteBonus,
            movementPenalty = effects.MovementPenalty,
            visions = effects.VisionsTurn > 0,
            visionRadius = effects.VisionsTurn > 0 ? Math.Max(3, Math.Max(1, h.Power + bonus.Power) * Math.Max(1, effects.VisionsMastery)) : 0,
            doorCasts = effects.DoorCasts
        };
    }

    internal static int GetRes(Player p, string r) => r switch
    {
        "wood" => p.Wood, "ore" => p.Ore, "mercury" => p.Mercury,
        "sulfur" => p.Sulfur, "crystal" => p.Crystal, "gems" => p.Gems,
        "gold" => p.Gold, _ => 0
    };

    internal static void SetRes(Player p, string r, int v)
    {
        switch (r)
        {
            case "wood": p.Wood = v; break;
            case "ore": p.Ore = v; break;
            case "mercury": p.Mercury = v; break;
            case "sulfur": p.Sulfur = v; break;
            case "crystal": p.Crystal = v; break;
            case "gems": p.Gems = v; break;
            case "gold": p.Gold = v; break;
        }
    }

    internal static async Task<(Hero? Hero, IResult? Error)> OwnHeroAsync(HommDb db, HttpContext ctx, Guid id)
    {
        var sp = HommCaller.From(ctx);
        if (sp == null) return (null, Results.BadRequest(new { error = "Unknown player." }));
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.Id == id);
        if (hero == null) return (null, Results.NotFound());
        var player = await db.Players.FirstAsync(p => p.Id == hero.PlayerId);
        if (player.UserId != sp.UserId) return (null, Results.BadRequest(new { error = "Not your hero." }));
        return (hero, await InactiveGameAsync(db, hero.GameId));
    }

    internal static bool CanExchange(Hero from, Hero to) => from.Id != to.Id
        && from.PlayerId == to.PlayerId && from.GameId == to.GameId
        && Math.Max(Math.Abs(from.X - to.X), Math.Abs(from.Y - to.Y)) <= 1;

    internal static async Task RefreshArmyMovementAsync(HommDb db, params Hero[] heroes)
    {
        var game = await db.Games.FirstAsync(g => g.Id == heroes[0].GameId);
        foreach (var hero in heroes)
        {
            var effects = GameService.Effects(hero);
            hero.MaxMovement = GameService.MaxMovement(hero) + (TownRules.StabledThisWeek(hero, game) ? 400 : 0)
                + (effects.HasteTurn == game.CurrentTurn ? effects.HasteBonus : 0);
        }
    }

    internal static async Task RefreshHeroSightAsync(HommDb db, GameService games, Hero hero)
    {
        var game = await db.Games.FirstAsync(g => g.Id == hero.GameId);
        var map = await games.LoadMapAsync(game);
        var player = await db.Players.FirstAsync(p => p.Id == hero.PlayerId);
        var fog = GameService.ParseFog(player.FogJson, map.Width * map.Height);
        GameService.RecomputeFog(fog, map.Width, map.Height,
            await db.Heroes.Where(h => h.PlayerId == player.Id).ToListAsync(),
            await db.Towns.Where(t => t.PlayerId == player.Id).ToListAsync());
        player.FogJson = GameService.SerializeFog(fog);
    }

    internal static void TeachScholar(Hero first, Hero second)
    {
        var level = Math.Max(GameService.ParseSkills(first.SkillsJson).GetValueOrDefault("scholar"),
            GameService.ParseSkills(second.SkillsJson).GetValueOrDefault("scholar"));
        if (level <= 0 || !TownRules.HasGear(first, TownRules.Spellbook) || !TownRules.HasGear(second, TownRules.Spellbook)) return;
        var shared = GameService.ParseStringArray(first.SpellsJson).Concat(GameService.ParseStringArray(second.SpellsJson))
            .Select(Spells.CanonicalKey).Distinct().ToArray();
        foreach (var hero in new[] { first, second })
        {
            var max = Math.Min(level + 1, Spells.MaxLearnable(GameService.ParseSkills(hero.SkillsJson).GetValueOrDefault("wisdom")));
            var spells = GameService.ParseStringArray(hero.SpellsJson).Select(Spells.CanonicalKey).ToHashSet();
            spells.UnionWith(shared.Where(key => Spells.All.TryGetValue(key, out var def) && def.Level <= max));
            hero.SpellsJson = JsonSerializer.Serialize(spells, Json);
        }
    }

}

public record CreateGameReq(string? Name, int Capacity, int TurnSeconds, int TurnLimit, int MapSize, int AiPlayers = 0);
public record MoveReq(List<Point>? Path);
public record Point(int X, int Y);
public record BuildReq(string? BuildingKey);
public record RecruitReq(int Tier, int Count, string? Creature = null);
public record ArmyMoveReq(string? FromArmy, int FromSlot, string? ToArmy, int ToSlot, int Count);
public record StackReq(string? Army, int Slot);
public record TradeReq(string? From, string? To, int Amount);
public record HireReq(string? HeroKey);
public record GarrisonReq(string? Direction, int Slot, int Count);
public record CastReq(string? Spell, int? X, int? Y, Guid? TownId = null);
public record BodyReq(string? Body);
public record EncounterReq(string? Action);
public record TreasureReq(string? Choice);
public record AdventureFixtureReq(string[]? Spells, int MovementPenalty = 0, bool Treasure = false, bool FlightLane = false,
    bool SurveyTargets = false, string? ObjectKind = null, string? ObjectData = null, int Wisdom = 0, int? Movement = null,
    GameService.ArmySlot[]? Army = null, int? Gold = null, Dictionary<string, int>? Skills = null,
    string? Meeting = null, bool PortalTown = false, int Experience = 0, string[]? Buildings = null);
public record MessageReq(string? ToPlayerId, string? Body);
public record TradeOfferReq(string? ToPlayerId, string? Give, int GiveAmount, string? Want, int WantAmount);
public record RespondReq(bool Accept);
public record ContributeReq(int Gold, int Wood, int Ore);
public record AnnotationReq(int X, int Y, string? Text);
public record PostReq(string? Title, string? Body, string? ImageUrl);
public record WallReq(string? Body, Guid? ParentId);
public record HeroExchangeReq(Guid OtherHeroId, int? FromSlot = null, int? ToSlot = null, int Count = 0);
public record DismissStackReq(int Slot, bool Confirmed);
public record ConfirmReq(bool Confirmed);
public record ArtifactMoveReq(string From, string To, Guid? ToHeroId = null);
public record LevelUpReq(string? Skill);
public record VisionTarget(string Kind, string Name, int X, int Y, GameService.ArmySlot[] Army, int? Level = null, bool? CanRecruit = null, int? Gold = null);
public record MineShareReq(int X, int Y, bool Shared);
public record AgreementReq(bool Agree);

/// <summary>The authenticated Kankan user making a HoMM request (replaces the seeded X-Player-Id identity).</summary>
public sealed record HommCaller(string UserId)
{
    public static string UserIdOf(HttpContext ctx) =>
        ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "";

    public static HommCaller? From(HttpContext ctx) => From(UserIdOf(ctx));

    public static HommCaller? From(string? userId) => string.IsNullOrEmpty(userId) ? null : new HommCaller(userId);
}
