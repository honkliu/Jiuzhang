namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


public record BuildingDef(
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
    string Description);

public static class Buildings
{
    public static readonly Dictionary<string, BuildingDef> All = new()
    {
        // ---- income ----
        ["townHall"] = new("townHall", "Town Hall", "Income", 0, 0, 0, 0, 0, 0, 0, [],
            "The heart of your city. +500 gold per turn."),
        ["woodcutter"] = new("woodcutter", "Woodcutter's Lodge", "Income", 500, 5, 0, 0, 0, 0, 0, [],
            "+2 wood per turn."),
        ["orePit"] = new("orePit", "Ore Pit", "Income", 500, 5, 0, 0, 0, 0, 0, [],
            "+2 ore per turn."),
        ["alchemist"] = new("alchemist", "Alchemist's Lab", "Income", 1000, 5, 5, 0, 0, 0, 0, [],
            "+1 mercury per turn."),
        ["sulfurDune"] = new("sulfurDune", "Sulfur Dune", "Income", 1000, 5, 5, 0, 0, 0, 0, [],
            "+1 sulfur per turn."),
        ["crystalCavern"] = new("crystalCavern", "Crystal Cavern", "Income", 1000, 5, 5, 0, 0, 0, 0, [],
            "+1 crystal per turn."),
        ["gemPond"] = new("gemPond", "Gem Pond", "Income", 1000, 5, 5, 0, 0, 0, 0, [],
            "+1 gems per turn."),

        // ---- civic ----
        ["marketplace"] = new("marketplace", "Marketplace", "Civic", 500, 5, 0, 0, 0, 0, 0, ["townHall"],
            "Shows resource totals to visitors."),
        ["tavern"] = new("tavern", "Tavern", "Civic", 500, 5, 0, 0, 0, 0, 0, ["townHall"],
            "A gathering place. Shows your visitor count."),
        ["granary"] = new("granary", "Granary", "Civic", 1000, 5, 5, 0, 0, 0, 0, ["woodcutter", "orePit"],
            "+50% wood and ore income."),
        ["treasury"] = new("treasury", "Treasury", "Civic", 2000, 0, 10, 0, 0, 0, 0, ["townHall"],
            "+250 gold per turn."),
        ["cityHall"] = new("cityHall", "City Hall", "Civic", 2000, 10, 10, 0, 0, 0, 0, ["townHall"],
            "+500 gold per turn."),

        // ---- magic ----
        ["magicTower1"] = new("magicTower1", "Magic Tower I", "Magic", 1000, 5, 5, 0, 0, 0, 0, ["townHall"],
            "Holds 3 blog posts."),
        ["magicTower2"] = new("magicTower2", "Magic Tower II", "Magic", 1500, 5, 5, 0, 0, 4, 0, ["magicTower1"],
            "Holds 6 blog posts."),
        ["magicTower3"] = new("magicTower3", "Magic Tower III", "Magic", 2000, 5, 5, 0, 0, 0, 6, ["magicTower2"],
            "Holds 10 blog posts."),
        ["magicTower4"] = new("magicTower4", "Magic Tower IV", "Magic", 2500, 5, 5, 0, 6, 0, 0, ["magicTower3"],
            "Holds 15 blog posts."),
        ["magicTower5"] = new("magicTower5", "Magic Tower V", "Magic", 3000, 5, 5, 6, 0, 0, 0, ["magicTower4"],
            "Holds 25 blog posts."),

        // ---- monument ----
        ["obeliskMonument"] = new("obeliskMonument", "Monument of the Obelisk", "Monument", 2000, 0, 10, 0, 0, 0, 0, ["townHall"],
            "Grants access to the standalone Obelisk."),

        // ---- ultimate ----
        ["grandArchive"] = new("grandArchive", "The Grand Archive", "Ultimate", 10000, 20, 20, 10, 10, 10, 10, ["obeliskMonument"],
            "The ultimate building. Requires the Precious. Ends the game.")
    };

    public static int PostSlots(IEnumerable<string> built)
    {
        var set = built.ToHashSet();
        if (set.Contains("magicTower5")) return 25;
        if (set.Contains("magicTower4")) return 15;
        if (set.Contains("magicTower3")) return 10;
        if (set.Contains("magicTower2")) return 6;
        if (set.Contains("magicTower1")) return 3;
        return 0;
    }

    /// <summary>Per-turn income for a city with the given buildings.</summary>
    public static (int gold, int wood, int ore, int mercury, int sulfur, int crystal, int gems) Income(IEnumerable<string> built)
    {
        var set = built.ToHashSet();
        int gold = 0, wood = 0, ore = 0, mercury = 0, sulfur = 0, crystal = 0, gems = 0;

        if (set.Contains("townHall")) gold += 500;
        if (set.Contains("cityHall")) gold += 500;
        if (set.Contains("treasury")) gold += 250;

        if (set.Contains("woodcutter")) wood += 2;
        if (set.Contains("orePit")) ore += 2;
        if (set.Contains("alchemist")) mercury += 1;
        if (set.Contains("sulfurDune")) sulfur += 1;
        if (set.Contains("crystalCavern")) crystal += 1;
        if (set.Contains("gemPond")) gems += 1;

        if (set.Contains("granary"))
        {
            wood = (int)Math.Floor(wood * 1.5);
            ore = (int)Math.Floor(ore * 1.5);
        }

        return (gold, wood, ore, mercury, sulfur, crystal, gems);
    }
}