namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>
/// Spell catalogue. Levels 1-5 match the Mage Guild tiers.
/// </summary>
public record SpellDef(string Key, string Name, int Level, string School, int Cost, string Description, int Id = 0, int[]? ManaCosts = null)
{
    public bool Adventure => Spells.AdventureKeys.Contains(Key);
}

public static class Spells
{
    public static readonly Dictionary<string, SpellDef> All = new()
    {
        // ---- level 1
        ["bless"] = new("bless", "Bless", 1, "water", 5, "Raises the army's attack for the rest of the day."),
        ["curse"] = new("curse", "Curse", 1, "fire", 5, "Lowers an enemy stack's attack."),
        ["haste"] = new("haste", "Haste", 1, "air", 5, "Adds 300 movement today (500 with Advanced/Expert Air Magic); does not stack."),
        ["viewAir"] = new("viewAir", "View Air", 1, "air", 2, "Shows artifacts; Advanced Air Magic also shows heroes, Expert also towns."),
        ["viewEarth"] = new("viewEarth", "View Earth", 1, "earth", 2, "Shows resources; Advanced Earth Magic adds mines, Expert reveals terrain."),
        ["cure"] = new("cure", "Cure", 1, "water", 6, "Removes negative adventure movement effects without refilling movement."),
        ["slow"] = new("slow", "Slow", 1, "earth", 5, "Reduces an enemy stack's speed."),
        ["magicArrow"] = new("magicArrow", "Magic Arrow", 1, "all", 5, "Deals direct damage to one stack."),

        // ---- level 2
        ["blessing"] = new("blessing", "Blessing", 2, "water", 8, "Stronger Bless; affects every stack."),
        ["fireball"] = new("fireball", "Fireball", 2, "fire", 8, "Damages a target and its neighbours."),
        ["lightning"] = new("lightning", "Lightning Bolt", 2, "air", 8, "Heavy damage to a single stack."),
        ["stoneSkin"] = new("stoneSkin", "Stone Skin", 2, "earth", 8, "Raises the army's defense."),
        ["visions"] = new("visions", "Visions", 2, "all", 8, "Reveals the strength of a wandering stack."),

        // ---- level 3
        ["prayer"] = new("prayer", "Prayer", 3, "water", 12, "Raises attack, defense and speed."),
        ["inferno"] = new("inferno", "Inferno", 3, "fire", 12, "Damages every enemy stack."),
        ["chainLightning"] = new("chainLightning", "Chain Lightning", 3, "air", 12, "Damage that jumps between stacks."),
        ["animateDead"] = new("animateDead", "Animate Dead", 3, "earth", 12, "Restores fallen creatures to a stack."),
        ["teleport"] = new("teleport", "Teleport", 3, "all", 12, "Moves a stack anywhere on the field."),

        // ---- level 4
        ["townPortal"] = new("townPortal", "Town Portal", 4, "water", 16, "Returns the hero to the nearest town."),
        ["berserk"] = new("berserk", "Berserk", 4, "fire", 16, "Makes an enemy stack attack its neighbours."),
        ["implosion"] = new("implosion", "Implosion", 4, "earth", 16, "Massive damage to a single stack."),
        ["waterWalk"] = new("waterWalk", "Water Walk", 4, "all", 16, "Lets the hero cross water."),

        // ---- level 5
        ["dimensionDoor"] = new("dimensionDoor", "Dimension Door", 5, "water", 20, "Teleports the hero across the map."),
        ["armageddon"] = new("armageddon", "Armageddon", 5, "fire", 20, "Damages every stack on the field."),
        ["fly"] = new("fly", "Fly", 5, "air", 20, "Fly over obstacles until tomorrow; land on explored, unoccupied ground."),
        ["resurrection"] = new("resurrection", "Resurrection", 5, "earth", 20, "Returns a destroyed stack to the field."),
        ["sacrifice"] = new("sacrifice", "Sacrifice", 5, "all", 20, "Trades one stack's health for another's."),
    };

    public static readonly string[] AdventureKeys = ["viewAir", "viewEarth", "visions", "townPortal", "dimensionDoor", "fly", "haste", "cure"];
    private static readonly Dictionary<string, NativeRules.Spell> Native = new();

    static Spells()
    {
        var old = new Dictionary<string, SpellDef>(All);
        All.Clear();
        foreach (var (native, index) in NativeRules.Data.Spells.Take(70).Select((s, i) => (s, i)))
        {
            var words = native.Name.Replace("Prot.", "Protection").Replace("'", "").Split([' ', '-'], StringSplitOptions.RemoveEmptyEntries);
            var key = char.ToLowerInvariant(words[0][0]) + words[0][1..] + string.Concat(words.Skip(1).Select(w => char.ToUpperInvariant(w[0]) + w[1..]));
            key = key switch { "lightningBolt" => "lightning", _ => key };
            var school = native.Schools.Length == 1 ? native.Schools[0] : "all";
            var description = AdventureKeys.Contains(key) && old.TryGetValue(key, out var previous)
                ? previous.Description : "Not castable in this peaceful ruleset.";
            description = key switch
            {
                "townPortal" => "Return to the nearest own town; Advanced/Expert Earth Magic permits choosing. Movement cost: 300, or 200 at Expert.",
                "dimensionDoor" => "Teleport within 9 horizontal and 8 vertical tiles, including unexplored land. Daily casts: 1/2/3/4. Movement cost: 300, or 200 at Expert.",
                "visions" => "Reveal nearby creature counts and joining intent today; Advanced adds hero armies and Expert adds town garrisons.",
                _ => description
            };
            All[key] = new(key, native.Name, native.Level, school, native.Mana[0], description, index, native.Mana);
            Native[key] = native;
        }
    }

    public static string CanonicalKey(string key) => key switch { "fly5" => "fly", "blessing" => "bless", "lightningBolt" => "lightning", _ => key };

    public static int Mastery(SpellDef spell, IReadOnlyDictionary<string, int> skills) =>
        Math.Clamp(spell.School == "all" ? new[] { "air", "earth", "fire", "water" }.Max(s => skills.GetValueOrDefault(s))
            : skills.GetValueOrDefault(spell.School), 0, 3);

    public static int ManaCost(SpellDef spell, IReadOnlyDictionary<string, int> skills)
    {
        return spell.ManaCosts?[Mastery(spell, skills)] ?? spell.Cost;
    }

    public static SpellDef[] OfLevel(int level) =>
        All.Values.Where(s => s.Level == level).OrderBy(s => s.Key, StringComparer.Ordinal).ToArray();

    /// <summary>
    /// Spells a newly built guild level adds, as in HoMM3: 5 level-1 spells, 4 level-2,
    /// 3 level-3, 2 level-4 and 1 level-5, chosen at random from that level.
    /// </summary>
    public static string[] ForGuildLevel(int level, Random rng, string? faction = null)
    {
        if (level is < 1 or > 5) return [];
        var factionIndex = Array.IndexOf(new[] { "castle", "rampart", "tower", "inferno", "necropolis", "dungeon", "stronghold", "fortress", "conflux" }, faction);
        var pool = OfLevel(level).Where(s => factionIndex < 0 ? Native[s.Key].Chance.Any(v => v > 0) : Native[s.Key].Chance[factionIndex] > 0).ToList();
        var result = new List<string>();
        while (result.Count < 6 - level && pool.Count > 0)
        {
            var total = pool.Sum(s => factionIndex < 0 ? 1 : Native[s.Key].Chance[factionIndex]);
            var chance = rng.Next(total);
            var chosen = pool[^1];
            foreach (var spell in pool)
            {
                chance -= factionIndex < 0 ? 1 : Native[spell.Key].Chance[factionIndex];
                if (chance < 0) { chosen = spell; break; }
            }
            pool.Remove(chosen); result.Add(chosen.Key);
        }
        return result.ToArray();
    }

    /// <summary>Highest spell level a hero can learn: 2 without Wisdom, then 3/4/5 for Basic/Advanced/Expert.</summary>
    public static int MaxLearnable(int wisdom) => 2 + Math.Clamp(wisdom, 0, 3);
}