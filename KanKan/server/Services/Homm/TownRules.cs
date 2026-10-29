using System.Text.Json;
using static KanKan.API.Services.Homm.GameService;

namespace KanKan.API.Services.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;
using KanKan.API.Repositories.Homm;


/// <summary>
/// HoMM3 rules shared by the town endpoints, the turn ticker and the AI: moving stacks
/// between armies, a hero's spellbook and war machines, Mage Guild learning, and costs.
/// </summary>
public static class TownRules
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    // ---------------------------------------------------------------- marketplace
    // HoMM3 trade values; the exchange improves with every Marketplace the player owns.
    private static readonly Dictionary<string, double> ResourceValue = new()
    {
        ["wood"] = 250, ["ore"] = 250, ["mercury"] = 500, ["sulfur"] = 500, ["crystal"] = 500, ["gems"] = 500, ["gold"] = 1
    };

    public static bool IsResource(string key) => ResourceValue.ContainsKey(key);

    /// <summary>One trade lot: give <c>Give</c> of <paramref name="from"/> to receive <c>Get</c> of <paramref name="to"/>.</summary>
    public static (int Give, int Get) MarketRate(string from, string to, int markets)
    {
        var effectiveness = Math.Min((markets + 1) / 20.0, 0.5);
        double r = ResourceValue[from], g = ResourceValue[to] / effectiveness;
        return r > g ? (1, (int)Math.Ceiling(r / g)) : ((int)(g / r + 0.5), 1);
    }

    // ---------------------------------------------------------------- hero gear
    // The spellbook and war machines live in the hero's artifact list under reserved keys;
    // the hero DTO splits them out so they never show as ordinary artifacts.
    public const string Spellbook = "spellBook";
    public static readonly string[] Machines = ["ballista", "ammoCart", "firstAidTent"];

    public static bool IsGear(string key) => key == Spellbook || Machines.Contains(key);

    public static bool HasGear(Hero hero, string key) => ParseStringArray(hero.ArtifactsJson).Contains(key);

    public static void AddGear(Hero hero, string key)
    {
        var arts = ParseStringArray(hero.ArtifactsJson).ToList();
        if (!arts.Contains(key)) arts.Add(key);
        hero.ArtifactsJson = JsonSerializer.Serialize(arts, Json);
    }

    /// <summary>Artifacts proper (the paper-doll items), without the spellbook and war machines.</summary>
    public static string[] Artifacts(Hero hero) => ParseStringArray(hero.ArtifactsJson).Where(a => !IsGear(a)).ToArray();

    public static string[] WarMachines(Hero hero) => ParseStringArray(hero.ArtifactsJson).Where(Machines.Contains).ToArray();

    // ---------------------------------------------------------------- mage guild
    /// <summary>
    /// A hero with a spellbook visiting a town learns every guild spell up to the level its
    /// Wisdom allows (HoMM3: levels 1-2 without Wisdom, 3/4/5 at Basic/Advanced/Expert).
    /// </summary>
    public static string[] LearnGuildSpells(Hero hero, Town town)
    {
        if (!HasGear(hero, Spellbook)) return [];
        var wisdom = ParseSkills(hero.SkillsJson).TryGetValue("wisdom", out var w) ? w : 0;
        var max = Spells.MaxLearnable(wisdom);
        var known = ParseStringArray(hero.SpellsJson).Select(Spells.CanonicalKey).Distinct().ToList();
        var learned = new List<string>();
        foreach (var key in ParseStringArray(town.MageGuildJson).Select(Spells.CanonicalKey))
        {
            if (known.Contains(key) || !Spells.All.TryGetValue(key, out var s) || s.Level > max) continue;
            known.Add(key);
            learned.Add(key);
        }
        if (learned.Count > 0) hero.SpellsJson = JsonSerializer.Serialize(known, Json);
        return learned.ToArray();
    }

    /// <summary>Adds the spells a newly built guild level holds to the town.</summary>
    public static void StockGuild(Town town, string buildingKey)
    {
        if (!buildingKey.StartsWith("mageGuild")) return;
        var level = int.TryParse(buildingKey.AsSpan("mageGuild".Length), out var lv) ? lv : 1;
        var known = ParseStringArray(town.MageGuildJson).ToList();
        foreach (var spell in Spells.ForGuildLevel(level, Random.Shared, town.Faction))
            if (!known.Contains(spell)) known.Add(spell);
        town.MageGuildJson = JsonSerializer.Serialize(known, Json);
    }

    // ---------------------------------------------------------------- stables
    public static int WeekIndex(Game game) => (game.Month - 1) * 4 + game.Week;

    /// <summary>Castle Stables: +400 movement now and on every remaining day of the week.</summary>
    public static bool VisitStables(Hero hero, Game game, IEnumerable<string> built)
    {
        if (!built.Contains("special2")) return false;
        var skills = ParseSkills(hero.SkillsJson);
        var week = WeekIndex(game);
        if (skills.TryGetValue("_stables", out var w) && w == week) return false;
        skills["_stables"] = week;
        hero.SkillsJson = JsonSerializer.Serialize(skills, Json);
        hero.Movement += 400;
        hero.MaxMovement += 400;
        return true;
    }

    public static bool StabledThisWeek(Hero hero, Game game) =>
        ParseSkills(hero.SkillsJson).TryGetValue("_stables", out var w) && w == WeekIndex(game);

    // ---------------------------------------------------------------- costs
    public static readonly string[] Resources = ["gold", "wood", "ore", "mercury", "sulfur", "crystal", "gems"];

    public static Dictionary<string, int> CostOf(CreatureDef c, int count = 1) => new()
    {
        ["gold"] = c.Gold * count, ["wood"] = c.Wood * count, ["ore"] = c.Ore * count,
        ["mercury"] = c.Mercury * count, ["sulfur"] = c.Sulfur * count,
        ["crystal"] = c.Crystal * count, ["gems"] = c.Gems * count
    };

    /// <summary>HoMM3 upgrade price: the difference between the two creatures' costs.</summary>
    public static Dictionary<string, int> UpgradeCost(CreatureDef from, CreatureDef to, int count)
    {
        var a = CostOf(from, count);
        var b = CostOf(to, count);
        return Resources.ToDictionary(r => r, r => Math.Max(0, b[r] - a[r]));
    }

    public static int Get(Player p, string r) => r switch
    {
        "wood" => p.Wood, "ore" => p.Ore, "mercury" => p.Mercury, "sulfur" => p.Sulfur,
        "crystal" => p.Crystal, "gems" => p.Gems, "gold" => p.Gold, _ => 0
    };

    public static void Add(Player p, string r, int v)
    {
        switch (r)
        {
            case "wood": p.Wood += v; break;
            case "ore": p.Ore += v; break;
            case "mercury": p.Mercury += v; break;
            case "sulfur": p.Sulfur += v; break;
            case "crystal": p.Crystal += v; break;
            case "gems": p.Gems += v; break;
            case "gold": p.Gold += v; break;
        }
    }

    public static bool CanAfford(Player p, Dictionary<string, int> cost) => cost.All(kv => Get(p, kv.Key) >= kv.Value);

    public static void Pay(Player p, Dictionary<string, int> cost)
    {
        foreach (var (r, v) in cost) Add(p, r, -v);
    }

    /// <summary>How many of a creature the player can pay for.</summary>
    public static int Affordable(Player p, CreatureDef c)
    {
        var max = int.MaxValue;
        foreach (var (r, v) in CostOf(c))
            if (v > 0) max = Math.Min(max, Get(p, r) / v);
        return max == int.MaxValue ? 0 : max;
    }

    // ---------------------------------------------------------------- armies
    /// <summary>
    /// HoMM3 stack exchange between two armies (or within one): drop a whole stack on an empty
    /// slot to move it, on the same creature to merge, on another creature to swap; a partial
    /// count splits the stack into an empty slot or merges it into the same creature.
    /// <paramref name="fromIsHero"/>/<paramref name="toIsHero"/> enforce that a hero keeps one stack.
    /// </summary>
    public static string? Transfer(ArmySlot[] from, int fromSlot, ArmySlot[] to, int toSlot, int count,
        bool fromIsHero, bool toIsHero)
    {
        if (fromSlot is < 0 or > 6 || toSlot is < 0 or > 6) return "Unknown slot.";
        var same = ReferenceEquals(from, to);
        if (same && fromSlot == toSlot) return null;
        var src = from[fromSlot];
        if (src.Creature == null || src.Count <= 0) return "That slot is empty.";
        if (count < 0 || count > src.Count) return "Invalid creature count.";
        var dst = to[toSlot];
        var n = count <= 0 || count >= src.Count ? src.Count : count;
        var whole = n == src.Count;
        var source = from.ToArray();
        var destination = same ? source : to.ToArray();

        if (dst.Creature == null || dst.Count <= 0)
        {
            destination[toSlot] = new ArmySlot(src.Creature, n);
            source[fromSlot] = whole ? new ArmySlot(null, 0) : src with { Count = src.Count - n };
        }
        else if (dst.Creature == src.Creature)
        {
            if ((long)dst.Count + n > int.MaxValue) return "That stack would be too large.";
            destination[toSlot] = dst with { Count = dst.Count + n };
            source[fromSlot] = whole ? new ArmySlot(null, 0) : src with { Count = src.Count - n };
        }
        else
        {
            if (!whole) return "Split a stack only onto an empty slot or the same creature.";
            destination[toSlot] = src;
            source[fromSlot] = dst;
        }

        if (fromIsHero && source.All(s => s.Creature == null || s.Count <= 0)) return "A hero must keep at least one stack.";
        if (toIsHero && destination.All(s => s.Creature == null || s.Count <= 0)) return "A hero must keep at least one stack.";
        Array.Copy(source, from, source.Length);
        if (!same) Array.Copy(destination, to, destination.Length);
        return null;
    }
}
