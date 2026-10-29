using System.Text.Json;

namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>
/// HoMM3 artifacts, indexed by their original id (the Artifact.def frame and AVA####.def map sprite).
/// Each artifact fits one body slot of the paper doll; when the slot is taken it goes to the backpack.
/// </summary>
public static class Artifacts
{
    public const string Head = "head", Shoulders = "shoulders", Neck = "neck", RightHand = "rightHand", LeftHand = "leftHand",
        Torso = "torso", Ring = "ring", Feet = "feet", Misc = "misc";

    /// <summary>Paper-doll slots in HoMM3 order; two rings and five misc slots.</summary>
    public static readonly string[] Slots =
        [Head, Shoulders, Neck, RightHand, LeftHand, Torso, "ring1", "ring2", Feet, "misc1", "misc2", "misc3", "misc4", "misc5"];

    public record Def(int Id, string Name, string Slot, int Attack = 0, int Defense = 0, int Power = 0, int Knowledge = 0);

    private static Def D(int id, string name, string slot, int a = 0, int d = 0, int p = 0, int k = 0) => new(id, name, slot, a, d, p, k);

    public static readonly Dictionary<int, Def> ById = new Def[]
    {
        D(7, "Centaur's Axe", RightHand, a: 2), D(8, "Blackshard of the Dead Knight", RightHand, a: 3),
        D(9, "Greater Gnoll's Flail", RightHand, a: 4), D(10, "Ogre's Club of Havoc", RightHand, a: 5),
        D(11, "Sword of Hellfire", RightHand, a: 6), D(12, "Titan's Gladius", RightHand, a: 12, d: -3),
        D(13, "Shield of the Dwarven Lords", LeftHand, d: 2), D(14, "Shield of the Yawning Dead", LeftHand, d: 3),
        D(15, "Buckler of the Gnoll King", LeftHand, d: 4), D(16, "Targ of the Rampaging Ogre", LeftHand, d: 5),
        D(17, "Shield of the Damned", LeftHand, d: 6), D(18, "Sentinel's Shield", LeftHand, a: -3, d: 12),
        D(19, "Helm of the Alabaster Unicorn", Head, k: 1), D(20, "Skull Helmet", Head, k: 2),
        D(21, "Helm of Chaos", Head, k: 3), D(22, "Crown of the Supreme Magi", Head, k: 4),
        D(23, "Hellstorm Helmet", Head, k: 5), D(24, "Thunder Helmet", Head, p: -2, k: 10),
        D(25, "Breastplate of Petrified Wood", Torso, p: 1), D(26, "Rib Cage", Torso, p: 2),
        D(27, "Scales of the Greater Basilisk", Torso, p: 3), D(28, "Tunic of the Cyclops King", Torso, p: 4),
        D(29, "Breastplate of Brimstone", Torso, p: 5), D(30, "Titan's Cuirass", Torso, p: 10, k: -2),
        D(31, "Armor of Wonder", Torso, 1, 1, 1, 1), D(32, "Sandals of the Saint", Feet, 2, 2, 2, 2),
        D(33, "Celestial Necklace of Bliss", Neck, 3, 3, 3, 3), D(34, "Lion's Shield of Courage", LeftHand, 4, 4, 4, 4),
        D(35, "Sword of Judgement", RightHand, 5, 5, 5, 5), D(36, "Helm of Heavenly Enlightenment", Head, 6, 6, 6, 6),
        D(37, "Quiet Eye of the Dragon", Ring, a: 1, d: 1), D(38, "Red Dragon Flame Tongue", RightHand, a: 2, d: 2),
        D(39, "Dragon Scale Shield", LeftHand, a: 3, d: 3), D(40, "Dragon Scale Armor", Torso, a: 4, d: 4),
        D(41, "Dragonbone Greaves", Feet, p: 1, k: 1), D(42, "Dragon Wing Tabard", Shoulders, p: 2, k: 2),
        D(43, "Necklace of Dragonteeth", Neck, p: 3, k: 3), D(44, "Crown of Dragontooth", Head, p: 4, k: 4),
        D(45, "Still Eye of the Dragon", Ring), D(46, "Clover of Fortune", Misc), D(47, "Cards of Prophecy", Misc),
        D(48, "Ladybird of Luck", Misc), D(49, "Badge of Courage", Misc), D(50, "Crest of Valor", Misc),
        D(51, "Glyph of Gallantry", Misc), D(52, "Speculum", Misc), D(53, "Spyglass", Misc),
        D(54, "Amulet of the Undertaker", Neck), D(55, "Vampire's Cowl", Shoulders), D(56, "Dead Man's Boots", Feet),
        D(57, "Garniture of Interference", Neck), D(58, "Surcoat of Counterpoise", Shoulders), D(59, "Boots of Polarity", Feet),
        D(60, "Bow of Elven Cherrywood", Misc), D(61, "Bowstring of the Unicorn's Mane", Misc), D(62, "Angel Feather Arrows", Misc),
        D(63, "Bird of Perception", Misc), D(64, "Stoic Watchman", Misc), D(65, "Emblem of Cognizance", Misc),
        D(66, "Statesman's Medal", Neck)
    }.ToDictionary(d => d.Id);

    /// <summary>
    /// The HoMM3 id of an artifact key. Map artifacts are keyed <c>artifact{n}</c>; the formula matches the
    /// client's map sprite and icon (<c>artifactSeed</c> in h3/catalog.ts), so what you pick up is what you see.
    /// </summary>
    public static int IdOf(string key)
    {
        var digits = new string(key.Reverse().TakeWhile(char.IsDigit).Reverse().ToArray());
        uint seed;
        if (digits.Length > 0 && int.TryParse(digits, out var n)) seed = (uint)(n * 7);
        else { seed = 0; foreach (var c in key) seed = unchecked(seed * 31 + c); }
        return 7 + (int)(seed % 60);
    }

    public static Def Of(string key) => ById[IdOf(key)];

    public sealed record Equipment(Dictionary<string, string> Worn, List<string> Backpack);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static bool Fits(string slot, string key) =>
        Slots.Contains(slot) && (slot == Of(key).Slot
            || (Of(key).Slot is Ring or Misc && slot.StartsWith(Of(key).Slot, StringComparison.Ordinal)));

    public static Equipment Layout(Hero hero)
    {
        var keys = TownRules.Artifacts(hero).ToList();
        Equipment? stored = null;
        try { stored = JsonSerializer.Deserialize<Equipment>(hero.ArtifactLayoutJson, Json); }
        catch (JsonException) { }
        var worn = new Dictionary<string, string>();
        var backpack = new List<string>();
        if (stored?.Worn != null && stored.Backpack != null)
        {
            foreach (var (slot, key) in stored.Worn)
                if (Fits(slot, key) && keys.Remove(key)) worn.Add(slot, key);
            foreach (var key in stored.Backpack)
                if (keys.Remove(key)) backpack.Add(key);
        }
        foreach (var key in keys)
        {
            var slot = Slots.FirstOrDefault(s => !worn.ContainsKey(s) && Fits(s, key));
            if (slot != null) worn.Add(slot, key); else backpack.Add(key);
        }
        return new(worn, backpack);
    }

    public static void Save(Hero hero, Equipment equipment)
    {
        var gear = GameService.ParseStringArray(hero.ArtifactsJson).Where(TownRules.IsGear);
        hero.ArtifactsJson = JsonSerializer.Serialize(gear.Concat(equipment.Worn.Values).Concat(equipment.Backpack), Json);
        hero.ArtifactLayoutJson = JsonSerializer.Serialize(equipment, Json);
        hero.MaxMana = GameService.ManaCapacity(hero);
    }

    public static bool Add(Hero hero, string key)
    {
        var layout = Layout(hero);
        var slot = Slots.FirstOrDefault(s => !layout.Worn.ContainsKey(s) && Fits(s, key));
        if (slot != null) layout.Worn.Add(slot, key);
        else if (layout.Backpack.Count < 64) layout.Backpack.Add(key);
        else return false;
        Save(hero, layout);
        return true;
    }

    public static (int Attack, int Defense, int Power, int Knowledge) Bonus(Hero hero) =>
        Sum(Layout(hero).Worn.Values);

    /// <summary>HoMM3 auto-equip: each artifact takes the first free slot of its kind, in pickup order; the rest go to the backpack.</summary>
    public static (Dictionary<string, string> Worn, List<string> Backpack) Arrange(IEnumerable<string> keys)
    {
        var worn = new Dictionary<string, string>();
        var backpack = new List<string>();
        foreach (var key in keys)
        {
            var kind = Of(key).Slot;
            var slot = Slots.FirstOrDefault(s => !worn.ContainsKey(s) && (s == kind || (kind is Ring or Misc && s.StartsWith(kind))));
            if (slot != null) worn[slot] = key; else backpack.Add(key);
        }
        return (worn, backpack);
    }

    /// <summary>Primary-skill bonus from the worn artifacts (backpack items give nothing).</summary>
    public static (int Attack, int Defense, int Power, int Knowledge) Bonus(IEnumerable<string> keys)
        => Sum(Arrange(keys).Worn.Values);

    private static (int Attack, int Defense, int Power, int Knowledge) Sum(IEnumerable<string> keys)
    {
        int a = 0, d = 0, p = 0, k = 0;
        foreach (var key in keys)
        {
            var def = Of(key);
            a += def.Attack; d += def.Defense; p += def.Power; k += def.Knowledge;
        }
        return (a, d, p, k);
    }
}
