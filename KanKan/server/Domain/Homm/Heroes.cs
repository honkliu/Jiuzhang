namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>Hero roster per faction. Might heroes favour Attack/Defense; magic heroes Power/Knowledge.</summary>
public record HeroDef(string Key, string Name, string Faction, bool Might, int Attack, int Defense, int Power, int Knowledge, string[] Skills,
    IReadOnlyDictionary<string, int>? InitialSkills = null, string[]? StartingSpells = null);

public static class Heroes
{
    public static readonly Dictionary<string, HeroDef> All = new()
    {
        // Castle
        ["christian"] = new("christian", "Christian", "castle", true, 2, 2, 1, 1, ["pathfinding", "leadership"]),
        ["adela"] = new("adela", "Adela", "castle", false, 1, 1, 2, 2, ["wisdom", "diplomacy"]),
        ["sorsha"] = new("sorsha", "Sorsha", "castle", true, 2, 2, 1, 1, ["leadership", "luck"]),
        ["cuthbert"] = new("cuthbert", "Cuthbert", "castle", false, 1, 1, 2, 2, ["wisdom", "earth"]),

        // Rampart
        ["ryland"] = new("ryland", "Ryland", "rampart", true, 2, 2, 1, 1, ["leadership", "pathfinding"]),
        ["clancy"] = new("clancy", "Clancy", "rampart", false, 1, 1, 2, 2, ["wisdom", "earth"]),
        ["mephala"] = new("mephala", "Mephala", "rampart", true, 2, 2, 1, 1, ["armorer", "leadership"]),
        ["elle"] = new("elle", "Elle", "rampart", false, 1, 1, 2, 2, ["wisdom", "water"]),

        // Tower
        ["tyris"] = new("tyris", "Tyris", "tower", true, 2, 2, 1, 1, ["leadership", "luck"]),
        ["solmyr"] = new("solmyr", "Solmyr", "tower", false, 1, 1, 2, 2, ["wisdom", "air"]),
        ["piquedram"] = new("piquedram", "Piquedram", "tower", true, 2, 2, 1, 1, ["artillery", "leadership"]),
        ["cyra"] = new("cyra", "Cyra", "tower", false, 1, 1, 2, 2, ["wisdom", "water"]),

        // Inferno
        ["rashka"] = new("rashka", "Rashka", "inferno", true, 2, 2, 1, 1, ["leadership", "artillery"]),
        ["pyre"] = new("pyre", "Pyre", "inferno", false, 1, 1, 2, 2, ["wisdom", "fire"]),
        ["marius"] = new("marius", "Marius", "inferno", true, 2, 2, 1, 1, ["leadership", "tactics"]),
        ["xarfax"] = new("xarfax", "Xarfax", "inferno", false, 1, 1, 2, 2, ["wisdom", "fire"]),

        // Necropolis
        ["vidomina"] = new("vidomina", "Vidomina", "necropolis", true, 2, 2, 1, 1, ["leadership", "pathfinding"]),
        ["thant"] = new("thant", "Thant", "necropolis", false, 1, 1, 2, 2, ["wisdom", "earth"]),
        ["straker"] = new("straker", "Straker", "necropolis", true, 2, 2, 1, 1, ["leadership", "armorer"]),
        ["sephinroth"] = new("sephinroth", "Sephinroth", "necropolis", false, 1, 1, 2, 2, ["wisdom", "earth"]),

        // Dungeon
        ["lorelei"] = new("lorelei", "Lorelei", "dungeon", true, 2, 2, 1, 1, ["leadership", "tactics"]),
        ["alamar"] = new("alamar", "Alamar", "dungeon", false, 1, 1, 2, 2, ["wisdom", "water"]),
        ["ajit"] = new("ajit", "Ajit", "dungeon", true, 2, 2, 1, 1, ["leadership", "luck"]),
        ["jeddite"] = new("jeddite", "Jeddite", "dungeon", false, 1, 1, 2, 2, ["wisdom", "earth"]),

        // Stronghold
        ["crag"] = new("crag", "Crag Hack", "stronghold", true, 2, 2, 1, 1, ["leadership", "artillery"]),
        ["gundula"] = new("gundula", "Gundula", "stronghold", false, 1, 1, 2, 2, ["wisdom", "fire"]),
        ["jabarkas"] = new("jabarkas", "Jabarkas", "stronghold", true, 2, 2, 1, 1, ["leadership", "pathfinding"]),
        ["saurug"] = new("saurug", "Saurug", "stronghold", false, 1, 1, 2, 2, ["wisdom", "earth"]),

        // Fortress
        ["tazar"] = new("tazar", "Tazar", "fortress", true, 2, 2, 1, 1, ["leadership", "resistance"]),
        ["alagar"] = new("alagar", "Alagar", "fortress", false, 1, 1, 2, 2, ["wisdom", "water"]),
        ["bron"] = new("bron", "Bron", "fortress", true, 2, 2, 1, 1, ["leadership", "armorer"]),
        ["mirlanda"] = new("mirlanda", "Mirlanda", "fortress", false, 1, 1, 2, 2, ["wisdom", "earth"]),

        // Conflux
        ["pasis"] = new("pasis", "Pasis", "conflux", true, 2, 2, 1, 1, ["leadership", "luck"]),
        ["luna"] = new("luna", "Luna", "conflux", false, 1, 1, 2, 2, ["wisdom", "fire"]),
        ["ignatius"] = new("ignatius", "Ignatius", "conflux", true, 2, 2, 1, 1, ["leadership", "tactics"]),
        ["ciele"] = new("ciele", "Ciele", "conflux", false, 1, 1, 2, 2, ["wisdom", "water"])
    };

    static Heroes()
    {
        string[] might = ["knight", "ranger", "alchemist", "demoniac", "deathknight", "overlord", "barbarian", "beastmaster", "planeswalker"];
        foreach (var (key, def) in All.ToArray())
        {
            if (!NativeRules.Data.Heroes.TryGetValue(NativeRules.HeroKey(key), out var native)) continue;
            var profile = NativeRules.Classes[native.Class.ToLowerInvariant()];
            All[key] = def with { Name = native.Name, Faction = native.Faction, Might = might.Contains(native.Class.ToLowerInvariant()),
                Attack = profile.Initial[0], Defense = profile.Initial[1], Power = profile.Initial[2], Knowledge = profile.Initial[3],
                Skills = native.Skills.Keys.ToArray(), InitialSkills = native.Skills, StartingSpells = native.Spells };
        }
    }

    public static HeroDef[] ForFaction(string faction) =>
        All.Values.Where(h => h.Faction == faction).ToArray();
}

/// <summary>Secondary skills and their levels.</summary>
public static class Skills
{
    public static readonly string[] All =
    [
        "pathfinding", "archery", "logistics", "scouting", "diplomacy", "navigation",
        "leadership", "luck", "ballistics", "eagleEye", "estates", "wisdom",
        "mysticism", "intelligence", "sorcery", "resistance", "firstAid", "artillery",
        "learning", "tactics", "armorer", "air", "earth", "fire", "water", "scholar", "offence", "necromancy"
    ];

    public static readonly string[] Names =
    [
        "Pathfinding", "Archery", "Logistics", "Scouting", "Diplomacy", "Navigation",
        "Leadership", "Luck", "Ballistics", "Eagle Eye", "Estates", "Wisdom",
        "Mysticism", "Intelligence", "Sorcery", "Resistance", "First Aid", "Artillery",
        "Learning", "Tactics", "Armorer", "Air Magic", "Earth Magic", "Fire Magic", "Water Magic", "Scholar", "Offense", "Necromancy"
    ];

    public static string Name(string key)
    {
        var i = Array.IndexOf(All, key);
        return i >= 0 ? Names[i] : key;
    }

    public static readonly string[] Levels = ["None", "Basic", "Advanced", "Expert"];
    public static readonly string[] Adventure =
        ["pathfinding", "logistics", "scouting", "wisdom", "mysticism", "intelligence", "estates", "learning", "scholar", "air", "earth", "water"];
}

/// <summary>Experience thresholds (HoMM3 table).</summary>
public static class Experience
{
    private static readonly int[] Thresholds = BuildThresholds();

    private static int[] BuildThresholds()
    {
        var result = new List<int> { 0, 1000, 2000, 3200, 4600, 6200, 8000, 10000, 12200, 14700, 17500, 20600, 24320, 28784, 34140 };
        while (true)
        {
            var difference = result[^1] - result[^2];
            var next = (long)result[^1] + difference + difference / 5;
            if (next > int.MaxValue) return result.ToArray();
            result.Add((int)next);
        }
    }

    public static int LevelFor(int xp)
    {
        var lvl = 1;
        for (var i = 1; i < Thresholds.Length; i++)
        {
            if (xp >= Thresholds[i]) lvl = i + 1;
            else break;
        }
        return lvl;
    }

    public static int NextThreshold(int level) =>
        level < Thresholds.Length ? Thresholds[level] : int.MaxValue;
}

/// <summary>Terrain types and their movement costs.</summary>
public static class Terrain
{
    public static readonly string[] Types =
        ["dirt", "sand", "grass", "snow", "swamp", "rough", "subterranean", "lava", "water", "rock"];

    public static int MoveCost(string t, int pathfinding = 0, string? nativeTerrain = null, bool diagonal = false)
    {
        var cost = t switch
        {
            "rough" => 125,
            "snow" or "sand" => 150,
            "swamp" => 175,
            "water" or "rock" => 0,
            _ => 100
        };
        if (cost == 0) return 0;
        cost = t == nativeTerrain ? 100 : Math.Max(100, cost - 25 * Math.Clamp(pathfinding, 0, 3));
        return diagonal ? (int)(cost * Math.Sqrt(2)) : cost;
    }

    public static int StepCost(string source, int pathfinding, string? nativeTerrain, bool diagonal, int remaining)
    {
        var straight = MoveCost(source, pathfinding, nativeTerrain);
        var cost = MoveCost(source, pathfinding, nativeTerrain, diagonal);
        return diagonal && remaining >= straight && remaining < cost ? remaining : cost;
    }

    public static bool Passable(string t) => t != "water" && t != "rock";
}