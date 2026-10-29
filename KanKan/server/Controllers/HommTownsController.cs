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

/// <summary>HoMM game API (ported from City of Towers): towns routes under /api/homm.</summary>
[Authorize]
[ApiExplorerSettings(IgnoreApi = true)]
[Route("api/homm")]
public class HommTownsController : ControllerBase
{
    private static readonly JsonSerializerOptions Json = HommApi.Json;

    [HttpGet("towns/{townId:guid}")]
    public async Task<IResult> GetTownsById(Guid townId, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return Results.NotFound();
        if (await TownHiddenAsync(db, townId, HommCaller.UserIdOf(ctx)))
            return Results.BadRequest(new { error = "You have not discovered that town yet." });

        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
        var built = GameService.ParseStringArray(town.BuildingsJson);
        var avail = JsonSerializer.Deserialize<Dictionary<string, int>>(town.AvailableJson, Json) ?? [];
        var tiers = Creatures.BaseTiers(town.Faction);
        var selected = HommCaller.From(ctx);
        var tree = TownBuildings.For(town.Faction);
        var (machine, machinePrice) = TownBuildings.Blacksmith.TryGetValue(town.Faction, out var bs) ? bs : ("ballista", 2500);

        return Results.Ok(new
        {
            id = town.Id,
            gameId = town.GameId,
            name = town.Name,
            ownerName = player == null ? "Neutral" : GameService.SeatName(player),
            isOwner = player != null && selected != null && selected.UserId == player.UserId,
            faction = town.Faction,
            x = town.X,
            y = town.Y,
            buildings = built,
            builtThisTurn = player?.BuiltThisTurn ?? false,
            postSlots = SocialService.TowerSlots(built),
            goldIncome = TownBuildings.GoldIncome(built),
            growthMultiplier = TownBuildings.GrowthMultiplier(built),
            marketCount = await MarketCountAsync(db, town.GameId, town.PlayerId),
            available = Enumerable.Range(1, 7).Select(tier => new
            {
                tier,
                creature = tiers.Length >= tier ? tiers[tier - 1] : null,
                upgraded = tiers.Length >= tier ? Creatures.UpgradeOf(tiers[tier - 1]) : null,
                count = avail.TryGetValue(tier.ToString(), out var c) ? c : 0,
                dwellingBuilt = TownBuildings.HasDwelling(built, tier),
                upgradeBuilt = TownBuildings.HasUpgrade(built, tier),
                growth = TownBuildings.WeeklyGrowth(town.Faction, built, tier),
                dwellingName = tree.TryGetValue((TownBuildings.HasUpgrade(built, tier) ? "upg" : "dwelling") + tier, out var dn) ? dn.Name : ""
            }),
            blacksmith = new { machine, name = TownBuildings.MachineNames[machine], gold = machinePrice },
            garrison = GameService.ParseArmy(town.GarrisonJson),
            heroInTown = player == null ? null : await HeroInTownAsync(db, player.Id, town.X, town.Y),
            tavern = GameService.ParseStringArray(town.TavernJson),
            mageGuild = GameService.ParseStringArray(town.MageGuildJson).Select(Spells.CanonicalKey).Distinct(),
            resources = new
            {
                wood = player?.Wood ?? 0, ore = player?.Ore ?? 0, mercury = player?.Mercury ?? 0, sulfur = player?.Sulfur ?? 0,
                crystal = player?.Crystal ?? 0, gems = player?.Gems ?? 0, gold = player?.Gold ?? 0
            }
        });
    }

    [HttpPost("towns/{townId:guid}/build")]
    public async Task<IResult> PostTownsBuild(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] BuildReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return Results.NotFound();

        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
        if (player == null || player.UserId != sp.UserId) return Results.BadRequest(new { error = "You can only build in your own town." });

        var game = await db.Games.FirstAsync(g => g.Id == town.GameId);
        if (game.State != GameState.InProgress) return Results.BadRequest(new { error = "The game is not in progress." });
        if (player.BuiltThisTurn) return Results.BadRequest(new { error = "You have already built this turn." });

        var key = req.BuildingKey ?? "";
        var tree = TownBuildings.For(town.Faction);
        if (!tree.TryGetValue(key, out var def)) return Results.BadRequest(new { error = "Unknown building." });
        if (key == "grail" && !player.Precious)
            return Results.BadRequest(new { error = "Requires the Grail. Dig it up first." });

        var built = GameService.ParseStringArray(town.BuildingsJson).ToList();
        if (built.Contains(key)) return Results.BadRequest(new { error = "You have already built that." });

        foreach (var r in def.Requires)
            if (!built.Contains(r))
                return Results.BadRequest(new { error = "Requires: " + (tree.TryGetValue(r, out var rd) ? rd.Name : r) + "." });

        if (player.Gold < def.Gold || player.Wood < def.Wood || player.Ore < def.Ore ||
            player.Mercury < def.Mercury || player.Sulfur < def.Sulfur ||
            player.Crystal < def.Crystal || player.Gems < def.Gems)
            return Results.BadRequest(new { error = "Not enough resources." });

        player.Gold -= def.Gold;
        player.Wood -= def.Wood;
        player.Ore -= def.Ore;
        player.Mercury -= def.Mercury;
        player.Sulfur -= def.Sulfur;
        player.Crystal -= def.Crystal;
        player.Gems -= def.Gems;

        built.Add(key);
        town.BuildingsJson = JsonSerializer.Serialize(built, Json);
        player.BuiltThisTurn = true;
        if (key == "grail") player.Precious = false;

        // HoMM3: a new dwelling opens with its first week's creatures; a horde adds its bonus at once
        var avail = JsonSerializer.Deserialize<Dictionary<string, int>>(town.AvailableJson, Json) ?? [];
        if (key.StartsWith("dwelling"))
            avail[def.Tier.ToString()] = TownBuildings.WeeklyGrowth(town.Faction, built, def.Tier);
        else if (TownBuildings.Hordes.TryGetValue(town.Faction, out var hordes) && hordes.TryGetValue(key, out var horde))
            avail[horde.Tier.ToString()] = (avail.TryGetValue(horde.Tier.ToString(), out var cur) ? cur : 0) + horde.Bonus;
        town.AvailableJson = JsonSerializer.Serialize(avail, Json);

        TownRules.StockGuild(town, key);
        var visitor = await db.Heroes.FirstOrDefaultAsync(h => h.PlayerId == player.Id && h.X == town.X && h.Y == town.Y);
        if (visitor != null) GameService.VisitOwnTown(game, visitor, town);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    [HttpPost("towns/{townId:guid}/recruit")]
    public async Task<IResult> PostTownsRecruit(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RecruitReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return Results.NotFound();

        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
        if (player == null || player.UserId != sp.UserId) return Results.BadRequest(new { error = "You can only recruit in your own town." });
        if (await InactiveGameAsync(db, town.GameId) is { } inactive) return inactive;

        var built = GameService.ParseStringArray(town.BuildingsJson);
        if (req.Tier is < 1 or > 7 || !TownBuildings.HasDwelling(built, req.Tier))
            return Results.BadRequest(new { error = "That dwelling is not built." });

        // an upgraded dwelling recruits either form from the same weekly pool
        var tiers = Creatures.BaseTiers(town.Faction);
        var baseKey = tiers[req.Tier - 1];
        var upgKey = Creatures.UpgradeOf(baseKey);
        var creatureKey = string.IsNullOrEmpty(req.Creature) ? baseKey : req.Creature;
        if (creatureKey != baseKey && creatureKey != upgKey)
            return Results.BadRequest(new { error = "That dwelling does not house that creature." });
        if (creatureKey == upgKey && !TownBuildings.HasUpgrade(built, req.Tier))
            return Results.BadRequest(new { error = "Upgrade the dwelling first." });

        var avail = JsonSerializer.Deserialize<Dictionary<string, int>>(town.AvailableJson, Json) ?? [];
        var k = req.Tier.ToString();
        var have = avail.TryGetValue(k, out var c) ? c : 0;
        if (req.Count > have) return Results.BadRequest(new { error = "Not that many creatures are available." });
        var count = req.Count;
        if (count <= 0) return Results.BadRequest(new { error = "No creatures available." });

        var def = Creatures.All[creatureKey];
        var cost = TownRules.CostOf(def, count);
        if (!TownRules.CanAfford(player, cost)) return Results.BadRequest(new { error = "Not enough resources." });

        var hero = await db.Heroes.FirstOrDefaultAsync(h =>
            h.PlayerId == player.Id && h.X == town.X && h.Y == town.Y);
        // HoMM3 recruits into the garrison; a visiting hero takes them only if the garrison is full
        var garrison = GameService.ParseArmy(town.GarrisonJson);
        if (GameService.AddToArmy(garrison, creatureKey, count))
            town.GarrisonJson = GameService.SerializeArmy(garrison);
        else
        {
            var army = hero == null ? null : GameService.ParseArmy(hero.ArmyJson);
            if (army == null || !GameService.AddToArmy(army, creatureKey, count))
                return Results.BadRequest(new { error = "There is no room for them in the garrison." });
            hero!.ArmyJson = GameService.SerializeArmy(army);
            await RefreshArmyMovementAsync(db, hero);
        }

        TownRules.Pay(player, cost);
        avail[k] = have - count;
        town.AvailableJson = JsonSerializer.Serialize(avail, Json);

        await db.SaveChangesAsync();
        return Results.Ok(new { recruited = count, creature = creatureKey });
    }

    [HttpPost("towns/{townId:guid}/trade")]
    public async Task<IResult> PostTownsTrade(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] TradeReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return Results.NotFound();
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
        if (player == null || player.UserId != sp.UserId) return Results.BadRequest(new { error = "Not your town." });
        if (await InactiveGameAsync(db, town.GameId) is { } inactive) return inactive;

        var built = GameService.ParseStringArray(town.BuildingsJson);
        if (!built.Contains("marketplace")) return Results.BadRequest(new { error = "No Marketplace built." });

        var from = req.From ?? "";
        var to = req.To ?? "";
        var lots = req.Amount;
        if (lots <= 0) return Results.BadRequest(new { error = "Trade amount must be positive." });
        if (!TownRules.IsResource(from) || !TownRules.IsResource(to)) return Results.BadRequest(new { error = "Unknown resource." });
        if (from == to) return Results.BadRequest(new { error = "Cannot trade a resource for itself." });

        // amount is the number of lots at the HoMM3 rate, which depends on how many Marketplaces the player owns
        var markets = await MarketCountAsync(db, town.GameId, town.PlayerId);
        var (give, get) = TownRules.MarketRate(from, to, markets);
        var have = GetRes(player, from);
        var totalGive = (long)give * lots;
        var totalGet = (long)get * lots;
        if (have < totalGive) return Results.BadRequest(new { error = "Not enough " + from + "." });
        if ((long)GetRes(player, to) + totalGet > int.MaxValue) return Results.BadRequest(new { error = "That trade is too large." });
        SetRes(player, from, have - (int)totalGive);
        SetRes(player, to, GetRes(player, to) + (int)totalGet);

        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    [HttpPost("towns/{townId:guid}/hire")]
    public async Task<IResult> PostTownsHire(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] HireReq? req, [FromServices] HommDb db, [FromServices] GameService games)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return Results.NotFound();
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
        if (player == null || player.UserId != sp.UserId) return Results.BadRequest(new { error = "Not your town." });
        if (await InactiveGameAsync(db, town.GameId) is { } inactive) return inactive;

        var built = GameService.ParseStringArray(town.BuildingsJson);
        if (!built.Contains("tavern")) return Results.BadRequest(new { error = "No Tavern built." });
        if (await db.Heroes.AnyAsync(h => h.GameId == town.GameId && h.X == town.X && h.Y == town.Y))
            return Results.BadRequest(new { error = "A hero is already visiting this town." });
        if (player.Gold < 2500) return Results.BadRequest(new { error = "Not enough gold (2500)." });

        var pool = GameService.ParseStringArray(town.TavernJson).ToList();
        var key = req.HeroKey ?? "";
        if (!pool.Contains(key)) return Results.BadRequest(new { error = "That hero is not available." });

        var count = await db.Heroes.CountAsync(h => h.PlayerId == player.Id);
        if (count >= 8) return Results.BadRequest(new { error = "You already have 8 heroes." });

        player.Gold -= 2500;
        pool.Remove(key);
        town.TavernJson = JsonSerializer.Serialize(pool, Json);

        var hireGame = await db.Games.FirstAsync(g => g.Id == town.GameId);
        var (hx, hy) = await games.ArrivalSpotAsync(hireGame, town.X, town.Y);
        var hero = GameService.CreateHero(town.GameId, player.Id, Seeded.Players[player.Seat] with { HeroKey = key }, hx, hy);
        if (hx == town.X && hy == town.Y) GameService.VisitOwnTown(hireGame, hero, town);
        db.Heroes.Add(hero);
        await db.SaveChangesAsync();
        return Results.Ok(new { heroId = hero.Id });
    }

    // Move a stack between the hero standing in town and the garrison.
    [HttpPost("towns/{townId:guid}/garrison")]
    public async Task<IResult> PostTownsGarrison(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] GarrisonReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var sp = HommCaller.From(ctx);
        if (sp == null) return Results.BadRequest(new { error = "Unknown player." });

        var town = await db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
        if (town == null) return Results.NotFound();
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
        if (player == null || player.UserId != sp.UserId) return Results.BadRequest(new { error = "Not your town." });
        if (await InactiveGameAsync(db, town.GameId) is { } inactive) return inactive;

        var hero = await db.Heroes.FirstOrDefaultAsync(h =>
            h.PlayerId == player.Id && h.X == town.X && h.Y == town.Y);
        if (hero == null) return Results.BadRequest(new { error = "No hero is in town." });

        var direction = req.Direction ?? "";
        if (direction is not ("toGarrison" or "toHero"))
            return Results.BadRequest(new { error = "Unknown direction." });
        if (req.Slot < 0 || req.Slot > 6) return Results.BadRequest(new { error = "Unknown slot." });

        var heroArmy = GameService.ParseArmy(hero.ArmyJson);
        var garrison = GameService.ParseArmy(town.GarrisonJson);
        var from = direction == "toGarrison" ? heroArmy : garrison;
        var to = direction == "toGarrison" ? garrison : heroArmy;

        var stack = from[req.Slot];
        if (stack.Creature == null || stack.Count <= 0)
            return Results.BadRequest(new { error = "That slot is empty." });

        var count = req.Count <= 0 ? stack.Count : Math.Min(req.Count, stack.Count);
        if (!GameService.AddToArmy(to, stack.Creature, count))
            return Results.BadRequest(new { error = "The destination army is full." });

        from[req.Slot] = stack with { Count = stack.Count - count };
        if (from[req.Slot].Count <= 0) from[req.Slot] = new GameService.ArmySlot(null, 0);
        if (direction == "toGarrison" && heroArmy.All(s => s.Creature == null || s.Count <= 0))
            return Results.BadRequest(new { error = "A hero must keep at least one stack." });

        hero.ArmyJson = GameService.SerializeArmy(heroArmy);
        await RefreshArmyMovementAsync(db, hero);
        town.GarrisonJson = GameService.SerializeArmy(garrison);
        await db.SaveChangesAsync();
        return Results.Ok(new { moved = count, creature = stack.Creature });
    }

    // HoMM3 army exchange between the visiting hero and the garrison (or within either):
    // move, merge, swap or split a stack into a chosen slot.
    [HttpPost("towns/{townId:guid}/army")]
    public async Task<IResult> PostTownsArmy(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ArmyMoveReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (town, player, err) = await OwnTownAsync(db, ctx, townId);
        if (err != null) return err;
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.PlayerId == player!.Id && h.X == town!.X && h.Y == town.Y);
        if ((req.FromArmy == "hero" || req.ToArmy == "hero") && hero == null)
            return Results.BadRequest(new { error = "No hero is in town." });
        if (req.FromArmy is not ("hero" or "garrison") || req.ToArmy is not ("hero" or "garrison"))
            return Results.BadRequest(new { error = "Unknown army." });

        var heroArmy = hero == null ? null : GameService.ParseArmy(hero.ArmyJson);
        var garrison = GameService.ParseArmy(town!.GarrisonJson);
        var from = req.FromArmy == "hero" ? heroArmy! : garrison;
        var to = req.ToArmy == "hero" ? heroArmy! : garrison;
        var error = TownRules.Transfer(from, req.FromSlot, to, req.ToSlot, req.Count,
            req.FromArmy == "hero", req.ToArmy == "hero");
        if (error != null) return Results.BadRequest(new { error });

        if (hero != null)
        {
            hero.ArmyJson = GameService.SerializeArmy(heroArmy!);
            await RefreshArmyMovementAsync(db, hero);
        }
        town.GarrisonJson = GameService.SerializeArmy(garrison);
        await db.SaveChangesAsync();
        return Results.Ok(new { hero = heroArmy, garrison });
    }

    // Upgrade a stack in the hero's army or the garrison (needs the upgraded dwelling; costs the price difference).
    [HttpPost("towns/{townId:guid}/upgrade")]
    public async Task<IResult> PostTownsUpgrade(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] StackReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (town, player, err) = await OwnTownAsync(db, ctx, townId);
        if (err != null) return err;
        if (req.Army is not ("hero" or "garrison")) return Results.BadRequest(new { error = "Unknown army." });
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.PlayerId == player!.Id && h.X == town!.X && h.Y == town.Y);
        if (req.Army == "hero" && hero == null) return Results.BadRequest(new { error = "No hero is in town." });
        var army = req.Army == "hero" ? GameService.ParseArmy(hero!.ArmyJson) : GameService.ParseArmy(town!.GarrisonJson);
        if (req.Slot is < 0 or > 6) return Results.BadRequest(new { error = "Unknown slot." });
        var stack = army[req.Slot];
        if (stack.Creature == null || !Creatures.All.TryGetValue(stack.Creature, out var from))
            return Results.BadRequest(new { error = "That slot is empty." });
        var upKey = Creatures.UpgradeOf(stack.Creature);
        if (upKey == null || from.Faction != town!.Faction)
            return Results.BadRequest(new { error = "This town cannot upgrade that creature." });
        if (!TownBuildings.HasUpgrade(GameService.ParseStringArray(town.BuildingsJson), from.Tier))
            return Results.BadRequest(new { error = "Build the upgraded dwelling first." });

        var cost = TownRules.UpgradeCost(from, Creatures.All[upKey], stack.Count);
        if (!TownRules.CanAfford(player!, cost)) return Results.BadRequest(new { error = "Not enough resources." });
        TownRules.Pay(player!, cost);
        army[req.Slot] = stack with { Creature = upKey };
        if (req.Army == "hero")
        {
            hero!.ArmyJson = GameService.SerializeArmy(army);
            await RefreshArmyMovementAsync(db, hero);
        }
        else town.GarrisonJson = GameService.SerializeArmy(army);
        await db.SaveChangesAsync();
        return Results.Ok(new { creature = upKey, cost });
    }

    // Blacksmith: sell the faction's war machine to the visiting hero.
    [HttpPost("towns/{townId:guid}/blacksmith")]
    public async Task<IResult> PostTownsBlacksmith(Guid townId, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        var (town, player, err) = await OwnTownAsync(db, ctx, townId);
        if (err != null) return err;
        if (!GameService.ParseStringArray(town!.BuildingsJson).Contains("blacksmith"))
            return Results.BadRequest(new { error = "No Blacksmith built." });
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.PlayerId == player!.Id && h.X == town.X && h.Y == town.Y);
        if (hero == null) return Results.BadRequest(new { error = "A hero must visit the town to buy a war machine." });
        var (machine, price) = TownBuildings.Blacksmith[town.Faction];
        if (TownRules.HasGear(hero, machine))
            return Results.BadRequest(new { error = $"{hero.Name} already has a {TownBuildings.MachineNames[machine]}." });
        if (player!.Gold < price) return Results.BadRequest(new { error = "Not enough gold." });
        player.Gold -= price;
        TownRules.AddGear(hero, machine);
        await db.SaveChangesAsync();
        return Results.Ok(new { machine });
    }

    // Mage Guild: a visiting hero without a spellbook may buy one for 500 gold.
    [HttpPost("towns/{townId:guid}/spellbook")]
    public async Task<IResult> PostTownsSpellbook(Guid townId, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        var (town, player, err) = await OwnTownAsync(db, ctx, townId);
        if (err != null) return err;
        if (!GameService.ParseStringArray(town!.BuildingsJson).Contains("mageGuild1"))
            return Results.BadRequest(new { error = "No Mage Guild built." });
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.PlayerId == player!.Id && h.X == town.X && h.Y == town.Y);
        if (hero == null) return Results.BadRequest(new { error = "No hero is in town." });
        if (TownRules.HasGear(hero, TownRules.Spellbook)) return Results.BadRequest(new { error = "The hero already has a spellbook." });
        if (player!.Gold < 500) return Results.BadRequest(new { error = "Not enough gold (500)." });
        player.Gold -= 500;
        TownRules.AddGear(hero, TownRules.Spellbook);
        var learned = TownRules.LearnGuildSpells(hero, town);
        await db.SaveChangesAsync();
        return Results.Ok(new { learned });
    }

    // Necropolis Skeleton Transformer: turns a living stack into as many Skeletons.
    [HttpPost("towns/{townId:guid}/transform")]
    public async Task<IResult> PostTownsTransform(Guid townId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] StackReq? req, [FromServices] HommDb db)
    {
        var ctx = HttpContext;
        if (req is null) return Results.BadRequest(new { error = "A request body is required." });
        var (town, player, err) = await OwnTownAsync(db, ctx, townId);
        if (err != null) return err;
        if (town!.Faction != "necropolis" || !GameService.ParseStringArray(town.BuildingsJson).Contains("special3"))
            return Results.BadRequest(new { error = "No Skeleton Transformer built." });
        var hero = await db.Heroes.FirstOrDefaultAsync(h => h.PlayerId == player!.Id && h.X == town.X && h.Y == town.Y);
        if (hero == null) return Results.BadRequest(new { error = "A hero must visit the town." });
        if (req.Slot is < 0 or > 6) return Results.BadRequest(new { error = "Unknown slot." });
        var army = GameService.ParseArmy(hero.ArmyJson);
        var stack = army[req.Slot];
        if (stack.Creature == null || !Creatures.All.TryGetValue(stack.Creature, out var c))
            return Results.BadRequest(new { error = "That slot is empty." });
        if (c.Faction == "necropolis" || c.Abilities.Contains("undead")) return Results.BadRequest(new { error = "The undead cannot be transformed." });
        army[req.Slot] = stack with { Creature = "skeleton" };
        hero.ArmyJson = GameService.SerializeArmy(army);
        await RefreshArmyMovementAsync(db, hero);
        await db.SaveChangesAsync();
        return Results.Ok(new { creature = "skeleton", count = stack.Count });
    }
}
