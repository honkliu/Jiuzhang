namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>
/// Town building definitions. Costs are Heroes III's own BUILDING.TXT values and the
/// requirements follow the original tree (as transcribed in VCMI's faction configs).
/// The neutral buildings are shared; dwellings and special buildings are per faction.
/// </summary>
public record TownBuildingDef(
    string Key,
    string Name,
    string Category,
    int Gold,
    int Wood,
    int Ore,
    int Mercury,
    int Sulfur,
    int Crystal,
    int Gems,
    string[] Requires,
    string Description,
    int Tier = 0);

public static class TownBuildings
{
    private static readonly Dictionary<string, Dictionary<string, TownBuildingDef>> ByFaction = new();

    /// <summary>Weekly growth bonus a horde building adds to its dwelling tier.</summary>
    public static readonly Dictionary<string, Dictionary<string, (int Tier, int Bonus)>> Hordes = new()
    {
        ["castle"] = new() { ["horde1"] = (3, 3) },
        ["rampart"] = new() { ["horde1"] = (2, 4), ["horde2"] = (5, 2) },
        ["necropolis"] = new() { ["horde1"] = (1, 6) }
    };

    /// <summary>The faction's war machine sold by its Blacksmith, with its price.</summary>
    public static readonly Dictionary<string, (string Machine, int Gold)> Blacksmith = new()
    {
        ["castle"] = ("ballista", 2500),
        ["rampart"] = ("firstAidTent", 750),
        ["necropolis"] = ("firstAidTent", 750)
    };

    public static readonly Dictionary<string, string> MachineNames = new()
    {
        ["ballista"] = "Ballista", ["firstAidTent"] = "First Aid Tent", ["ammoCart"] = "Ammo Cart"
    };

    private static readonly Dictionary<string, string[]> DwellingNames = new()
    {
        ["castle"] = ["Guardhouse", "Archers' Tower", "Griffin Tower", "Barracks", "Monastery", "Training Grounds", "Portal of Glory"],
        ["rampart"] = ["Centaur Stables", "Dwarf Cottage", "Homestead", "Enchanted Spring", "Dendroid Arches", "Unicorn Glade", "Dragon Cliffs"],
        ["necropolis"] = ["Cursed Temple", "Graveyard", "Tomb of Souls", "Estate", "Mausoleum", "Hall of Darkness", "Dragon Vault"]
    };

    // BUILDING.TXT column order: wood, mercury, ore, sulfur, crystal, gems, gold
    private record Cost(int W, int M, int O, int S, int C, int G, int Gold);

    private static readonly Dictionary<string, (Cost Base, Cost Upg)[]> DwellingCosts = new()
    {
        ["castle"] =
        [
            (new(0, 0, 10, 0, 0, 0, 500), new(0, 0, 5, 0, 0, 0, 1000)),
            (new(5, 0, 5, 0, 0, 0, 1000), new(5, 0, 5, 0, 0, 0, 1000)),
            (new(0, 0, 5, 0, 0, 0, 1000), new(0, 0, 5, 0, 0, 0, 1000)),
            (new(0, 0, 5, 0, 0, 0, 2000), new(0, 0, 5, 0, 5, 0, 2000)),
            (new(5, 2, 5, 2, 2, 2, 3000), new(2, 2, 2, 2, 2, 2, 1000)),
            (new(20, 0, 0, 0, 0, 0, 5000), new(10, 0, 0, 0, 0, 0, 3000)),
            (new(0, 10, 0, 10, 10, 10, 20000), new(0, 10, 0, 10, 10, 10, 20000))
        ],
        ["rampart"] =
        [
            (new(10, 0, 0, 0, 0, 0, 500), new(5, 0, 0, 0, 0, 0, 1000)),
            (new(5, 0, 0, 0, 0, 0, 1000), new(5, 0, 0, 0, 0, 0, 1000)),
            (new(10, 0, 0, 0, 0, 0, 1500), new(10, 0, 0, 0, 0, 0, 1500)),
            (new(0, 0, 0, 0, 10, 0, 2000), new(0, 0, 0, 0, 5, 0, 2000)),
            (new(0, 0, 0, 0, 0, 0, 2500), new(0, 0, 0, 0, 0, 0, 1500)),
            (new(5, 0, 5, 0, 0, 10, 4000), new(0, 0, 0, 0, 0, 5, 3000)),
            (new(0, 0, 30, 0, 20, 0, 10000), new(0, 0, 30, 0, 20, 0, 20000))
        ],
        ["necropolis"] =
        [
            (new(5, 0, 5, 0, 0, 0, 400), new(5, 0, 5, 0, 0, 0, 1000)),
            (new(0, 0, 5, 0, 0, 0, 1000), new(5, 0, 5, 0, 0, 0, 1000)),
            (new(5, 0, 5, 0, 0, 0, 1500), new(0, 5, 0, 0, 0, 0, 1500)),
            (new(5, 0, 5, 0, 0, 0, 2000), new(5, 0, 0, 0, 10, 10, 2000)),
            (new(0, 0, 10, 10, 0, 0, 2000), new(0, 0, 5, 5, 0, 0, 2000)),
            (new(10, 0, 10, 0, 0, 0, 6000), new(5, 2, 5, 2, 2, 2, 3000)),
            (new(5, 5, 5, 5, 5, 5, 10000), new(5, 20, 5, 0, 0, 0, 15000))
        ]
    };

    // requirements beyond "the upgraded dwelling needs its base dwelling"
    private static readonly Dictionary<string, Dictionary<string, string[]>> DwellingRequires = new()
    {
        ["castle"] = new()
        {
            ["dwelling1"] = ["fort"], ["dwelling2"] = ["dwelling1"], ["dwelling3"] = ["dwelling4"],
            ["dwelling4"] = ["blacksmith", "dwelling1"], ["dwelling5"] = ["mageGuild1", "dwelling4"],
            ["dwelling6"] = ["special2"], ["dwelling7"] = ["dwelling5"]
        },
        ["rampart"] = new()
        {
            ["dwelling1"] = ["fort"], ["dwelling2"] = ["dwelling1"], ["dwelling3"] = ["dwelling1"],
            ["dwelling4"] = ["dwelling3"], ["dwelling5"] = ["dwelling3"], ["dwelling6"] = ["dwelling4", "dwelling5"],
            ["dwelling7"] = ["dwelling6", "mageGuild2"], ["upg7"] = ["mageGuild3"]
        },
        ["necropolis"] = new()
        {
            ["dwelling1"] = ["fort"], ["dwelling2"] = ["dwelling1"], ["dwelling3"] = ["dwelling1"],
            ["dwelling4"] = ["dwelling2"], ["dwelling5"] = ["mageGuild1", "dwelling2"],
            ["dwelling6"] = ["dwelling4", "dwelling5"], ["dwelling7"] = ["dwelling6"], ["upg4"] = ["special2"]
        }
    };

    private static readonly Dictionary<string, int> MaxGuild = new() { ["castle"] = 4, ["rampart"] = 5, ["necropolis"] = 5 };

    public static readonly string[] Factions = ["castle", "rampart", "necropolis"];

    private static TownBuildingDef Def(string key, string name, string cat, Cost c, string[] req, string desc, int tier = 0) =>
        new(key, name, cat, c.Gold, c.W, c.O, c.M, c.S, c.C, c.G, req, desc, tier);

    static TownBuildings()
    {
        foreach (var faction in Factions)
        {
            var d = new Dictionary<string, TownBuildingDef>();
            void Add(TownBuildingDef b) => d[b.Key] = b;

            Add(Def("villageHall", "Village Hall", "Hall", new(0, 0, 0, 0, 0, 0, 0), [], "Provides 500 gold per day."));
            Add(Def("townHall", "Town Hall", "Hall", new(0, 0, 0, 0, 0, 0, 2500), ["villageHall", "tavern"], "Provides 1000 gold per day."));
            Add(Def("cityHall", "City Hall", "Hall", new(0, 0, 0, 0, 0, 0, 5000), ["townHall", "mageGuild1", "marketplace", "blacksmith"], "Provides 2000 gold per day."));
            Add(Def("capitol", "Capitol", "Hall", new(0, 0, 0, 0, 0, 0, 10000), ["cityHall", "castle"], "Provides 4000 gold per day."));

            Add(Def("fort", "Fort", "Fortification", new(20, 0, 20, 0, 0, 0, 5000), [], "Walls and a moat. Allows dwellings to be built."));
            Add(Def("citadel", "Citadel", "Fortification", new(0, 0, 5, 0, 0, 0, 2500), ["fort"], "Adds a tower. Creature growth +50%."));
            Add(Def("castle", "Castle", "Fortification", new(10, 0, 10, 0, 0, 0, 5000), ["citadel"], "Adds two towers. Creature growth +100%."));

            var guildCosts = new Cost[]
            {
                new(5, 0, 5, 0, 0, 0, 2000), new(5, 4, 5, 4, 4, 4, 1000), new(5, 6, 5, 6, 6, 6, 1000),
                new(5, 8, 5, 8, 8, 8, 1000), new(5, 10, 5, 10, 10, 10, 1000)
            };
            for (var lv = 1; lv <= MaxGuild[faction]; lv++)
                Add(Def("mageGuild" + lv, "Mage Guild Level " + lv, "Mage Guild", guildCosts[lv - 1],
                    lv > 1 ? ["mageGuild" + (lv - 1)] : [],
                    $"Holds {6 - lv} level {lv} spell{(lv < 5 ? "s" : "")}. Heroes with a spellbook learn them on visiting."));

            Add(Def("tavern", "Tavern", "Civic", new(5, 0, 0, 0, 0, 0, 500), [], "Hire heroes."));
            Add(Def("marketplace", "Marketplace", "Civic", new(5, 0, 0, 0, 0, 0, 500), [], "Trade resources."));
            Add(Def("resourceSilo", "Resource Silo", "Civic", new(0, 0, 5, 0, 0, 0, 5000), ["marketplace"],
                faction == "rampart" ? "Produces 1 crystal per day." : "Produces 1 wood and 1 ore per day."));
            var (machine, price) = Blacksmith[faction];
            Add(Def("blacksmith", "Blacksmith", "Civic", new(5, 0, 0, 0, 0, 0, 1000), [],
                $"Sells the {MachineNames[machine]} ({price} gold) to a visiting hero."));
            Add(Def("grail", "Grail Structure", "Grail", new(0, 0, 0, 0, 0, 0, 0), [], "Requires the Grail. +5000 gold per day, creature growth +50%."));

            var names = DwellingNames[faction];
            var costs = DwellingCosts[faction];
            var reqs = DwellingRequires[faction];
            for (var t = 1; t <= 7; t++)
            {
                var (b, u) = costs[t - 1];
                var creature = Creatures.All[Creatures.BaseTiers(faction)[t - 1]];
                var upgraded = Creatures.All[Creatures.UpgradeOf(creature.Key)!];
                Add(Def("dwelling" + t, names[t - 1], "Dwelling", b,
                    reqs.TryGetValue("dwelling" + t, out var r) ? r : [],
                    $"Produces {creature.Growth} {creature.Name} per week.", t));
                Add(Def("upg" + t, "Upg. " + names[t - 1], "Dwelling", u,
                    ["dwelling" + t, .. reqs.TryGetValue("upg" + t, out var ru) ? ru : []],
                    $"Allows recruiting {upgraded.Name} and upgrading {creature.Name}.", t));
            }

            switch (faction)
            {
                case "castle":
                    Add(Def("special2", "Stables", "Special", new(10, 0, 0, 0, 0, 0, 2000), ["dwelling4"],
                        "Visiting heroes gain +400 movement points every day for the rest of the week."));
                    Add(Def("special3", "Brotherhood of the Sword", "Special", new(5, 0, 0, 0, 0, 0, 500), ["tavern"],
                        "Upgrades the Tavern. Garrison morale +2 during sieges."));
                    Add(Def("horde1", "Griffin Bastion", "Special", new(0, 0, 0, 0, 0, 0, 1000), ["dwelling3"],
                        "Griffin production +3 per week."));
                    break;
                case "rampart":
                    Add(Def("special1", "Mystic Pond", "Special", new(2, 2, 2, 2, 2, 2, 2000), [],
                        "Produces a small random amount of a rare resource each week."));
                    Add(Def("special2", "Fountain of Fortune", "Special", new(0, 0, 0, 0, 10, 0, 1500), ["special1"],
                        "Garrison luck +2 during sieges."));
                    Add(Def("special3", "Treasury", "Special", new(5, 0, 10, 0, 0, 0, 5000), ["horde1"],
                        "Earns 10% interest on your gold at the start of each week."));
                    Add(Def("horde1", "Miners' Guild", "Special", new(0, 0, 0, 0, 0, 0, 1000), ["dwelling2"],
                        "Dwarf production +4 per week."));
                    Add(Def("horde2", "Dendroid Saplings", "Special", new(0, 0, 0, 0, 0, 0, 2000), ["dwelling5"],
                        "Dendroid production +2 per week."));
                    break;
                case "necropolis":
                    Add(Def("special1", "Cover of Darkness", "Special", new(0, 0, 0, 0, 0, 0, 1000), ["fort"],
                        "Shrouds the land around the town from other players."));
                    Add(Def("special2", "Necromancy Amplifier", "Special", new(0, 0, 0, 0, 0, 0, 1000), ["mageGuild1"],
                        "Necromancy of all your heroes +10%."));
                    Add(Def("special3", "Skeleton Transformer", "Special", new(0, 0, 0, 0, 0, 0, 1000), ["dwelling1"],
                        "Turns living creatures into Skeletons."));
                    Add(Def("horde1", "Unearthed Graves", "Special", new(0, 0, 0, 0, 0, 0, 1000), ["dwelling1", "special3"],
                        "Skeleton production +6 per week."));
                    break;
            }
            ByFaction[faction] = d;
        }
    }

    /// <summary>The building tree for a faction (castle's for unknown factions).</summary>
    public static IReadOnlyDictionary<string, TownBuildingDef> For(string faction) =>
        ByFaction.TryGetValue(faction, out var d) ? d : ByFaction["castle"];

    /// <summary>Gold income per day for a town with the given buildings.</summary>
    public static int GoldIncome(IEnumerable<string> built)
    {
        var set = built.ToHashSet();
        var grail = set.Contains("grail") ? 5000 : 0;
        if (set.Contains("capitol")) return 4000 + grail;
        if (set.Contains("cityHall")) return 2000 + grail;
        if (set.Contains("townHall")) return 1000 + grail;
        return (set.Contains("villageHall") ? 500 : 0) + grail;
    }

    /// <summary>Growth multiplier on base growth from fortifications and the Grail.</summary>
    public static double GrowthMultiplier(IEnumerable<string> built)
    {
        var set = built.ToHashSet();
        var m = set.Contains("castle") ? 2.0 : set.Contains("citadel") ? 1.5 : 1.0;
        if (set.Contains("grail")) m *= 1.5;
        return m;
    }

    /// <summary>Creatures a dwelling tier adds each week, as in HoMM3: base × fort bonus + horde buildings.</summary>
    public static int WeeklyGrowth(string faction, IEnumerable<string> built, int tier)
    {
        var set = built.ToHashSet();
        if (!HasDwelling(set, tier)) return 0;
        var tiers = Creatures.BaseTiers(faction);
        if (tiers.Length < tier) return 0;
        var fortification = set.Contains("castle") ? 2.0 : set.Contains("citadel") ? 1.5 : 1.0;
        var growth = (int)Math.Floor(Creatures.All[tiers[tier - 1]].Growth * fortification);
        if (Hordes.TryGetValue(faction, out var hordes))
            foreach (var (key, (t, bonus)) in hordes)
                if (t == tier && set.Contains(key)) growth += bonus;
        return growth + (set.Contains("grail") ? growth / 2 : 0);
    }

    /// <summary>Resources the Resource Silo produces per day.</summary>
    public static Dictionary<string, int> SiloProduction(string faction) => faction switch
    {
        "rampart" => new() { ["crystal"] = 1 },
        _ => new() { ["wood"] = 1, ["ore"] = 1 }
    };

    /// <summary>Whether a dwelling for the given tier is built.</summary>
    public static bool HasDwelling(IEnumerable<string> built, int tier) =>
        built.Contains("dwelling" + tier);

    /// <summary>Whether the upgraded dwelling for the given tier is built.</summary>
    public static bool HasUpgrade(IEnumerable<string> built, int tier) =>
        built.Contains("upg" + tier);
}
