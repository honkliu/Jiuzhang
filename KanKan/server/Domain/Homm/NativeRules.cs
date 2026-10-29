using System.Text.Json;

namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


public static class NativeRules
{
    public record Class(string Name, int[] Initial, int[] Low, int[] High, Dictionary<string, int> Secondary);
    public record HeroProfile(string Name, string Faction, string Class, Dictionary<string, int> Skills, string[] Spells);
    public record Spell(string Name, int Level, string[] Schools, int[] Mana, int[] Chance);
    public record Creature(string Name, int[] Cost, int Growth, int Hp, int Speed, int Attack, int Defense, int[] Damage);
    public record Building(string Section, string Name, int[] Cost);
    public record Rules(Class[] Classes, Dictionary<string, HeroProfile> Heroes, Spell[] Spells, Creature[] Creatures, Building[] Buildings);

    public static readonly Rules Data = Load();
    public static readonly Dictionary<string, Class> Classes =
        Data.Classes.ToDictionary(c => c.Name.Replace(" ", "").ToLowerInvariant());

    private static Rules Load()
    {
        using var stream = typeof(NativeRules).Assembly.GetManifestResourceStream("KanKan.API.Homm.NativeRules.json")!;
        return JsonSerializer.Deserialize<Rules>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    }

    public static string HeroKey(string key) => key.ToLowerInvariant() switch
    {
        "elle" => "elleshar", "crag" => "craghack", _ => key.ToLowerInvariant()
    };

    public static Class ClassOf(Hero hero)
    {
        if (Data.Heroes.TryGetValue(HeroKey(hero.HeroKey), out var native)) return Classes[native.Class.ToLowerInvariant()];
        return Classes[hero.Faction switch
        {
            "rampart" => "ranger", "tower" => "alchemist", "inferno" => "demoniac",
            "necropolis" => "deathknight", "dungeon" => "overlord", "stronghold" => "barbarian",
            "fortress" => "beastmaster", "conflux" => "planeswalker", _ => "knight"
        }];
    }
}
