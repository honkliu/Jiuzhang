using System.Text.Json;

namespace KanKan.API.Services.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;
using KanKan.API.Repositories.Homm;


/// <summary>
/// A simple computer opponent. Each day it builds the cheapest affordable structure,
/// recruits what it can afford, and walks its hero toward the nearest unclaimed mine.
/// It never fights (there is no combat) and never touches another player's town.
/// </summary>
public class AiService
{
    private readonly HommDb _db;
    private readonly GameService _games;

    public AiService(HommDb db, GameService games)
    {
        _db = db;
        _games = games;
    }

    /// <summary>Play one day for every computer-controlled seat in the game.</summary>
    public async Task PlayAsync(Game game)
    {
        var players = await _db.Players.Where(p => p.GameId == game.Id && p.IsAi).ToListAsync();
        foreach (var player in players)
        {
            try
            {
                await BuildAsync(game, player);
                await RecruitAsync(game, player);
                await ExploreAsync(game, player);
            }
            catch
            {
                // a single failed action must not stall the other seats
            }
        }
        await _db.SaveChangesAsync();
    }

    private async Task BuildAsync(Game game, Player player)
    {
        if (player.BuiltThisTurn) return;
        var town = await _db.Towns.FirstOrDefaultAsync(t => t.PlayerId == player.Id);
        if (town == null) return;

        var built = GameService.ParseStringArray(town.BuildingsJson).ToHashSet();
        var candidates = TownBuildings.For(town.Faction).Values
            .Where(b => b.Key != "grail")
            .Where(b => !built.Contains(b.Key))
            .Where(b => b.Requires.All(built.Contains))
            .Where(b => CanAfford(player, b))
            .OrderBy(b => b.Gold + b.Wood * 50 + b.Ore * 50)
            .ToList();

        var pick = candidates.FirstOrDefault();
        if (pick == null) return;

        player.Gold -= pick.Gold;
        player.Wood -= pick.Wood;
        player.Ore -= pick.Ore;
        player.Mercury -= pick.Mercury;
        player.Sulfur -= pick.Sulfur;
        player.Crystal -= pick.Crystal;
        player.Gems -= pick.Gems;

        built.Add(pick.Key);
        town.BuildingsJson = JsonSerializer.Serialize(built.ToArray());
        player.BuiltThisTurn = true;

        var avail = JsonSerializer.Deserialize<Dictionary<string, int>>(town.AvailableJson) ?? [];
        if (pick.Key.StartsWith("dwelling"))
            avail[pick.Tier.ToString()] = TownBuildings.WeeklyGrowth(town.Faction, built, pick.Tier);
        town.AvailableJson = JsonSerializer.Serialize(avail);
        TownRules.StockGuild(town, pick.Key);
    }
    private async Task RecruitAsync(Game game, Player player)
    {
        var town = await _db.Towns.FirstOrDefaultAsync(t => t.PlayerId == player.Id);
        if (town == null) return;
        var hero = await _db.Heroes.FirstOrDefaultAsync(h => h.PlayerId == player.Id);
        if (hero == null) return;

        var built = GameService.ParseStringArray(town.BuildingsJson).ToHashSet();
        var avail = JsonSerializer.Deserialize<Dictionary<string, int>>(town.AvailableJson) ?? [];
        var tiers = Creatures.BaseTiers(town.Faction);

        for (var tier = 7; tier >= 1; tier--)
        {
            if (!TownBuildings.HasDwelling(built, tier)) continue;
            var key = tiers[tier - 1];
            if (TownBuildings.HasUpgrade(built, tier)) key = Creatures.UpgradeOf(key) ?? key;
            if (!avail.TryGetValue(tier.ToString(), out var count) || count <= 0) continue;

            var affordable = Math.Min(count, TownRules.Affordable(player, Creatures.All[key]));
            if (affordable <= 0) continue;

            // like a human player: recruits join a hero standing in town, otherwise the garrison
            var inTown = hero.X == town.X && hero.Y == town.Y;
            var army = GameService.ParseArmy(inTown ? hero.ArmyJson : town.GarrisonJson);
            if (!GameService.AddToArmy(army, key, affordable)) continue;

            if (inTown) hero.ArmyJson = GameService.SerializeArmy(army);
            else town.GarrisonJson = GameService.SerializeArmy(army);
            TownRules.Pay(player, TownRules.CostOf(Creatures.All[key], affordable));
            avail[tier.ToString()] = count - affordable;
            town.AvailableJson = JsonSerializer.Serialize(avail);
            return;
        }
    }

    private async Task ExploreAsync(Game game, Player player)
    {
        var hero = await _db.Heroes.FirstOrDefaultAsync(h => h.PlayerId == player.Id);
        if (hero == null || hero.Movement <= 0) return;
        while (HeroProgression.Pending(hero) is { } level) HeroProgression.Choose(hero, level.Choices.FirstOrDefault()?.Key);

        var map = await _games.LoadMapAsync(game);
        var target = NearestMine(map, player, hero);
        if (target == null) return;

        // step one tile toward the target; the move endpoint handles the rest
        var step = StepToward(map, hero.X, hero.Y, target.Value.x, target.Value.y,
            GameService.ParseSkills(hero.SkillsJson).GetValueOrDefault("pathfinding"), GameService.NativeTerrain(hero));
        if (step == null) return;
        var playerId = player.UserId ?? GameService.AiUserId(player.Seat);
        await _games.MoveHeroAsync(hero.Id, playerId, [step.Value]);
        while (HeroProgression.Pending(hero) is { } level) HeroProgression.Choose(hero, level.Choices.FirstOrDefault()?.Key);
    }

    private static (int x, int y)? NearestMine(AdventureMap map, Player player, Hero hero)
    {
        var seat = player.Seat;
        if (seat < 0) return null;
        (int x, int y)? best = null;
        var bestDist = int.MaxValue;
        for (var y = 0; y < map.Height; y++)
        {
            for (var x = 0; x < map.Width; x++)
            {
                var t = map.At(x, y);
                if (t.ObjectKind != "mine" || t.Owner != 0) continue;
                var d = Math.Abs(x - hero.X) + Math.Abs(y - hero.Y);
                if (d < bestDist) { bestDist = d; best = (x, y); }
            }
        }
        return best;
    }

    private static (int x, int y)? StepToward(AdventureMap map, int sx, int sy, int tx, int ty, int pathfinding, string? nativeTerrain)
    {
        var path = Pathfinder.FindPath(map, sx, sy, tx, ty, pathfinding, nativeTerrain);
        return path is { Count: > 1 } ? path[1] : null;
    }

    private static bool CanAfford(Player p, TownBuildingDef b) =>
        p.Gold >= b.Gold && p.Wood >= b.Wood && p.Ore >= b.Ore &&
        p.Mercury >= b.Mercury && p.Sulfur >= b.Sulfur && p.Crystal >= b.Crystal && p.Gems >= b.Gems;
}