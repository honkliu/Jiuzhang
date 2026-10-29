namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>
/// Creature definition. Statistics are the Heroes III: Shadow of Death values.
/// </summary>
public record CreatureDef(
    string Key,
    string Name,
    string Faction,
    int Tier,
    int Attack,
    int Defense,
    int DamageMin,
    int DamageMax,
    int Health,
    int Speed,
    int Growth,
    int Gold,
    int Wood,
    int Ore,
    int Mercury,
    int Sulfur,
    int Crystal,
    int Gems,
    int Shots,
    int AiValue,
    string[] Abilities,
    string? UpgradeOf = null);

public static class Creatures
{
    public static readonly Dictionary<string, CreatureDef> All = new();

    private static void Add(CreatureDef c) => All[c.Key] = c;

    static Creatures()
    {
        // ---------------------------------------------------------- Castle
        Add(new("pikeman", "Pikeman", "castle", 1, 4, 5, 1, 3, 10, 4, 14, 60, 0, 0, 0, 0, 0, 0, 0, 80, []));
        Add(new("halberdier", "Halberdier", "castle", 1, 6, 5, 2, 3, 10, 5, 14, 75, 0, 0, 0, 0, 0, 0, 0, 115, [], "pikeman"));
        Add(new("archer", "Archer", "castle", 2, 6, 3, 2, 3, 10, 4, 9, 100, 0, 0, 0, 0, 0, 0, 12, 126, ["shooter"]));
        Add(new("marksman", "Marksman", "castle", 2, 6, 3, 2, 3, 10, 6, 9, 150, 0, 0, 0, 0, 0, 0, 24, 184, ["shooter", "doubleShot"], "archer"));
        Add(new("griffin", "Griffin", "castle", 3, 8, 8, 3, 6, 25, 6, 7, 200, 0, 0, 0, 0, 0, 0, 0, 351, ["flyer", "retaliate2"]));
        Add(new("royalGriffin", "Royal Griffin", "castle", 3, 9, 9, 3, 6, 25, 9, 7, 240, 0, 0, 0, 0, 0, 0, 0, 448, ["flyer", "unlimitedRetaliation"], "griffin"));
        Add(new("swordsman", "Swordsman", "castle", 4, 10, 12, 6, 9, 35, 5, 4, 300, 0, 0, 0, 0, 0, 0, 0, 445, []));
        Add(new("crusader", "Crusader", "castle", 4, 12, 12, 7, 10, 35, 6, 4, 400, 0, 0, 0, 0, 0, 0, 0, 588, ["doubleStrike"], "swordsman"));
        Add(new("monk", "Monk", "castle", 5, 12, 7, 10, 12, 30, 5, 3, 400, 0, 0, 0, 0, 0, 0, 12, 582, ["shooter"]));
        Add(new("zealot", "Zealot", "castle", 5, 12, 10, 10, 12, 30, 7, 3, 450, 0, 0, 0, 0, 0, 0, 24, 750, ["shooter", "noMeleePenalty"], "monk"));
        Add(new("cavalier", "Cavalier", "castle", 6, 15, 15, 15, 25, 100, 7, 2, 1000, 0, 0, 0, 0, 0, 0, 0, 1946, ["jousting"]));
        Add(new("champion", "Champion", "castle", 6, 16, 16, 20, 25, 100, 9, 2, 1200, 0, 0, 0, 0, 0, 0, 0, 2100, ["jousting"], "cavalier"));
        Add(new("angel", "Angel", "castle", 7, 20, 20, 50, 50, 200, 12, 1, 3000, 0, 0, 0, 0, 0, 1, 0, 5019, ["flyer", "morale1"]));
        Add(new("archangel", "Archangel", "castle", 7, 30, 30, 50, 50, 250, 18, 1, 5000, 0, 0, 0, 0, 0, 3, 0, 8776, ["flyer", "morale1", "resurrect"], "angel"));

        // ---------------------------------------------------------- Rampart
        Add(new("centaur", "Centaur", "rampart", 1, 5, 3, 2, 3, 8, 6, 14, 70, 0, 0, 0, 0, 0, 0, 0, 100, []));
        Add(new("centaurCaptain", "Centaur Captain", "rampart", 1, 6, 3, 2, 3, 10, 8, 14, 90, 0, 0, 0, 0, 0, 0, 0, 138, [], "centaur"));
        Add(new("dwarf", "Dwarf", "rampart", 2, 6, 7, 2, 4, 20, 3, 8, 120, 0, 0, 0, 0, 0, 0, 0, 138, ["magicResist20"]));
        Add(new("battleDwarf", "Battle Dwarf", "rampart", 2, 7, 7, 2, 4, 20, 5, 8, 150, 0, 0, 0, 0, 0, 0, 0, 209, ["magicResist40"], "dwarf"));
        Add(new("woodElf", "Wood Elf", "rampart", 3, 9, 5, 3, 5, 15, 6, 7, 200, 0, 0, 0, 0, 0, 0, 24, 234, ["shooter"]));
        Add(new("grandElf", "Grand Elf", "rampart", 3, 9, 5, 3, 5, 15, 7, 7, 225, 0, 0, 0, 0, 0, 0, 24, 331, ["shooter", "doubleShot"], "woodElf"));
        Add(new("pegasus", "Pegasus", "rampart", 4, 9, 8, 5, 9, 30, 8, 5, 250, 0, 0, 0, 0, 0, 0, 0, 518, ["flyer", "magicDamper"]));
        Add(new("silverPegasus", "Silver Pegasus", "rampart", 4, 9, 10, 5, 9, 30, 12, 5, 275, 0, 0, 0, 0, 0, 0, 0, 532, ["flyer", "magicDamper"], "pegasus"));
        Add(new("dendroid", "Dendroid Guard", "rampart", 5, 9, 12, 10, 14, 55, 3, 3, 350, 0, 0, 0, 0, 0, 0, 0, 517, ["bind"]));
        Add(new("dendroidSoldier", "Dendroid Soldier", "rampart", 5, 9, 12, 10, 14, 65, 4, 3, 425, 0, 0, 0, 0, 0, 0, 0, 600, ["bind"], "dendroid"));
        Add(new("unicorn", "Unicorn", "rampart", 6, 15, 14, 18, 22, 90, 7, 2, 850, 0, 0, 0, 0, 0, 0, 0, 1806, ["blind", "auraResist"]));
        Add(new("warUnicorn", "War Unicorn", "rampart", 6, 15, 14, 18, 22, 110, 9, 2, 950, 0, 0, 0, 0, 0, 0, 0, 2030, ["blind", "auraResist"], "unicorn"));
        Add(new("greenDragon", "Green Dragon", "rampart", 7, 18, 18, 40, 50, 180, 10, 1, 2400, 0, 0, 0, 0, 1, 0, 0, 4872, ["flyer", "breath", "spellImmune3"]));
        Add(new("goldDragon", "Gold Dragon", "rampart", 7, 27, 27, 40, 50, 250, 16, 1, 4000, 0, 0, 0, 0, 2, 0, 0, 8613, ["flyer", "breath", "spellImmune4"], "greenDragon"));

        // ---------------------------------------------------------- Tower
        Add(new("gremlin", "Gremlin", "tower", 1, 3, 3, 1, 2, 4, 4, 16, 30, 0, 0, 0, 0, 0, 0, 0, 44, []));
        Add(new("masterGremlin", "Master Gremlin", "tower", 1, 4, 4, 1, 2, 4, 5, 16, 40, 0, 0, 0, 0, 0, 0, 8, 66, ["shooter"], "gremlin"));
        Add(new("stoneGargoyle", "Stone Gargoyle", "tower", 2, 6, 6, 2, 3, 16, 6, 9, 130, 0, 0, 0, 0, 0, 0, 0, 165, ["flyer", "unliving"]));
        Add(new("obsidianGargoyle", "Obsidian Gargoyle", "tower", 2, 7, 7, 2, 3, 16, 9, 9, 160, 0, 0, 0, 0, 0, 0, 0, 201, ["flyer", "unliving"], "stoneGargoyle"));
        Add(new("stoneGolem", "Stone Golem", "tower", 3, 7, 10, 4, 5, 30, 3, 6, 150, 0, 0, 0, 0, 0, 0, 0, 250, ["unliving", "spellResist50"]));
        Add(new("ironGolem", "Iron Golem", "tower", 3, 9, 10, 4, 5, 35, 5, 6, 200, 0, 0, 0, 0, 0, 0, 0, 412, ["unliving", "spellResist75"], "stoneGolem"));
        Add(new("mage", "Mage", "tower", 4, 11, 8, 7, 9, 25, 5, 4, 350, 0, 0, 0, 0, 0, 0, 24, 570, ["shooter", "noMeleePenalty"]));
        Add(new("archMage", "Arch Mage", "tower", 4, 12, 9, 7, 9, 30, 7, 4, 450, 0, 0, 0, 0, 0, 0, 24, 680, ["shooter", "noMeleePenalty"], "mage"));
        Add(new("genie", "Genie", "tower", 5, 12, 12, 13, 16, 40, 7, 3, 550, 0, 0, 0, 0, 0, 0, 0, 884, ["flyer"]));
        Add(new("masterGenie", "Master Genie", "tower", 5, 12, 12, 13, 16, 40, 11, 3, 600, 0, 0, 0, 0, 0, 0, 0, 942, ["flyer"], "genie"));
        Add(new("naga", "Naga", "tower", 6, 16, 13, 20, 20, 110, 5, 2, 1100, 0, 0, 0, 0, 0, 0, 0, 2016, ["noRetaliation"]));
        Add(new("nagaQueen", "Naga Queen", "tower", 6, 16, 13, 30, 30, 110, 7, 2, 1600, 0, 0, 0, 0, 0, 0, 0, 2840, ["noRetaliation"], "naga"));
        Add(new("giant", "Giant", "tower", 7, 19, 16, 40, 60, 150, 7, 1, 2000, 0, 0, 0, 0, 0, 1, 0, 3718, ["mindImmune"]));
        Add(new("titan", "Titan", "tower", 7, 24, 24, 40, 60, 300, 11, 1, 5000, 0, 0, 0, 0, 0, 2, 24, 7500, ["shooter", "noMeleePenalty", "mindImmune"], "giant"));

        // ---------------------------------------------------------- Inferno
        Add(new("imp", "Imp", "inferno", 1, 2, 3, 1, 2, 4, 5, 15, 50, 0, 0, 0, 0, 0, 0, 0, 50, []));
        Add(new("familiar", "Familiar", "inferno", 1, 4, 4, 1, 2, 4, 7, 15, 60, 0, 0, 0, 0, 0, 0, 0, 60, [], "imp"));
        Add(new("gog", "Gog", "inferno", 2, 6, 4, 2, 4, 13, 4, 8, 125, 0, 0, 0, 0, 0, 0, 12, 159, ["shooter"]));
        Add(new("magog", "Magog", "inferno", 2, 7, 4, 2, 4, 13, 6, 8, 175, 0, 0, 0, 0, 0, 0, 24, 240, ["shooter", "fireball"], "gog"));
        Add(new("hellHound", "Hell Hound", "inferno", 3, 10, 6, 2, 7, 25, 7, 5, 200, 0, 0, 0, 0, 0, 0, 0, 357, []));
        Add(new("cerberus", "Cerberus", "inferno", 3, 10, 8, 2, 7, 25, 8, 5, 250, 0, 0, 0, 0, 0, 0, 0, 392, ["noRetaliation", "tripleStrike"], "hellHound"));
        Add(new("demon", "Demon", "inferno", 4, 10, 10, 7, 9, 35, 5, 4, 250, 0, 0, 0, 0, 0, 0, 0, 445, []));
        Add(new("hornedDemon", "Horned Demon", "inferno", 4, 10, 10, 7, 9, 40, 6, 4, 270, 0, 0, 0, 0, 0, 0, 0, 480, [], "demon"));
        Add(new("pitFiend", "Pit Fiend", "inferno", 5, 13, 13, 13, 17, 45, 6, 3, 500, 0, 0, 0, 0, 0, 0, 0, 765, []));
        Add(new("pitLord", "Pit Lord", "inferno", 5, 13, 13, 13, 17, 45, 7, 3, 700, 0, 0, 0, 0, 0, 0, 0, 1224, ["summonDemons"], "pitFiend"));
        Add(new("efreet", "Efreeti", "inferno", 6, 16, 12, 16, 24, 90, 9, 2, 900, 0, 0, 0, 0, 0, 0, 0, 1670, ["flyer", "fireImmune"]));
        Add(new("efreetSultan", "Efreet Sultan", "inferno", 6, 16, 14, 16, 24, 90, 13, 2, 1100, 0, 0, 0, 0, 0, 0, 0, 1848, ["flyer", "fireImmune", "fireShield"], "efreet"));
        Add(new("devil", "Devil", "inferno", 7, 19, 21, 30, 40, 160, 11, 1, 2700, 0, 0, 1, 0, 0, 0, 0, 5101, ["flyer", "noRetaliation", "luck-1"]));
        Add(new("archDevil", "Arch Devil", "inferno", 7, 26, 28, 30, 40, 200, 17, 1, 4500, 0, 0, 2, 0, 0, 0, 0, 7115, ["flyer", "noRetaliation", "luck-1"], "devil"));

        // ---------------------------------------------------------- Necropolis
        Add(new("skeleton", "Skeleton", "necropolis", 1, 5, 4, 1, 3, 6, 4, 12, 60, 0, 0, 0, 0, 0, 0, 0, 75, ["undead"]));
        Add(new("skeletonWarrior", "Skeleton Warrior", "necropolis", 1, 6, 6, 1, 3, 6, 5, 12, 70, 0, 0, 0, 0, 0, 0, 0, 85, ["undead"], "skeleton"));
        Add(new("walkingDead", "Walking Dead", "necropolis", 2, 5, 5, 2, 3, 15, 3, 8, 100, 0, 0, 0, 0, 0, 0, 0, 98, ["undead"]));
        Add(new("zombie", "Zombie", "necropolis", 2, 5, 5, 2, 3, 20, 4, 8, 125, 0, 0, 0, 0, 0, 0, 0, 128, ["undead", "disease"], "walkingDead"));
        Add(new("wight", "Wight", "necropolis", 3, 7, 7, 3, 5, 18, 5, 7, 200, 0, 0, 0, 0, 0, 0, 0, 252, ["undead", "flyer", "regen"]));
        Add(new("wraith", "Wraith", "necropolis", 3, 7, 7, 3, 5, 18, 7, 7, 230, 0, 0, 0, 0, 0, 0, 0, 315, ["undead", "flyer", "regen"], "wight"));
        Add(new("vampire", "Vampire", "necropolis", 4, 10, 9, 5, 8, 30, 6, 4, 360, 0, 0, 0, 0, 0, 0, 0, 518, ["undead", "flyer", "noRetaliation"]));
        Add(new("vampireLord", "Vampire Lord", "necropolis", 4, 10, 10, 5, 8, 40, 9, 4, 500, 0, 0, 0, 0, 0, 0, 0, 783, ["undead", "flyer", "noRetaliation", "lifesteal"], "vampire"));
        Add(new("lich", "Lich", "necropolis", 5, 13, 10, 11, 13, 30, 6, 3, 550, 0, 0, 0, 0, 0, 0, 12, 848, ["shooter", "undead", "deathCloud"]));
        Add(new("powerLich", "Power Lich", "necropolis", 5, 13, 10, 11, 15, 40, 7, 3, 600, 0, 0, 0, 0, 0, 0, 24, 1079, ["shooter", "undead", "deathCloud"], "lich"));
        Add(new("blackKnight", "Black Knight", "necropolis", 6, 16, 16, 15, 30, 120, 7, 2, 1200, 0, 0, 0, 0, 0, 0, 0, 2087, ["undead", "curse"]));
        Add(new("dreadKnight", "Dread Knight", "necropolis", 6, 18, 18, 15, 30, 120, 9, 2, 1500, 0, 0, 0, 0, 0, 0, 0, 2583, ["undead", "curse", "doubleStrike"], "blackKnight"));
        Add(new("boneDragon", "Bone Dragon", "necropolis", 7, 17, 15, 25, 50, 150, 9, 1, 1800, 0, 0, 0, 0, 0, 0, 0, 3388, ["undead", "flyer", "morale-1"]));
        Add(new("ghostDragon", "Ghost Dragon", "necropolis", 7, 19, 17, 25, 50, 200, 14, 1, 3000, 0, 0, 1, 0, 0, 0, 0, 4696, ["undead", "flyer", "morale-1", "aging"], "boneDragon"));

        // ---------------------------------------------------------- Dungeon
        Add(new("troglodyte", "Troglodyte", "dungeon", 1, 4, 3, 1, 3, 5, 4, 14, 50, 0, 0, 0, 0, 0, 0, 0, 59, ["blindImmune"]));
        Add(new("infernalTroglodyte", "Infernal Troglodyte", "dungeon", 1, 5, 4, 1, 3, 6, 5, 14, 65, 0, 0, 0, 0, 0, 0, 0, 84, ["blindImmune"], "troglodyte"));
        Add(new("harpy", "Harpy", "dungeon", 2, 6, 5, 1, 4, 14, 6, 8, 130, 0, 0, 0, 0, 0, 0, 0, 154, ["flyer", "returnStrike"]));
        Add(new("harpyHag", "Harpy Hag", "dungeon", 2, 6, 6, 1, 4, 14, 9, 8, 170, 0, 0, 0, 0, 0, 0, 0, 191, ["flyer", "returnStrike", "noRetaliation"], "harpy"));
        Add(new("beholder", "Beholder", "dungeon", 3, 9, 7, 3, 5, 22, 5, 7, 250, 0, 0, 0, 0, 0, 0, 12, 336, ["shooter", "noMeleePenalty"]));
        Add(new("evilEye", "Evil Eye", "dungeon", 3, 10, 8, 3, 5, 22, 7, 7, 280, 0, 0, 0, 0, 0, 0, 24, 367, ["shooter", "noMeleePenalty"], "beholder"));
        Add(new("medusa", "Medusa", "dungeon", 4, 9, 9, 6, 8, 25, 5, 4, 300, 0, 0, 0, 0, 0, 0, 4, 517, ["shooter", "noMeleePenalty", "petrify"]));
        Add(new("medusaQueen", "Medusa Queen", "dungeon", 4, 10, 10, 6, 8, 30, 6, 4, 330, 0, 0, 0, 0, 0, 0, 8, 577, ["shooter", "noMeleePenalty", "petrify"], "medusa"));
        Add(new("minotaur", "Minotaur", "dungeon", 5, 14, 12, 12, 20, 50, 6, 3, 500, 0, 0, 0, 0, 0, 0, 0, 835, ["morale1"]));
        Add(new("minotaurKing", "Minotaur King", "dungeon", 5, 15, 15, 12, 20, 50, 8, 3, 575, 0, 0, 0, 0, 0, 0, 0, 1068, ["morale1"], "minotaur"));
        Add(new("manticore", "Manticore", "dungeon", 6, 15, 13, 14, 20, 80, 7, 2, 850, 0, 0, 0, 0, 0, 0, 0, 1547, ["flyer"]));
        Add(new("scorpicore", "Scorpicore", "dungeon", 6, 16, 14, 14, 20, 80, 11, 2, 1050, 0, 0, 0, 0, 0, 0, 0, 1589, ["flyer", "paralyze"], "manticore"));
        Add(new("redDragon", "Red Dragon", "dungeon", 7, 19, 19, 40, 50, 180, 11, 1, 2500, 0, 0, 0, 1, 0, 0, 0, 4702, ["flyer", "breath", "spellImmune3"]));
        Add(new("blackDragon", "Black Dragon", "dungeon", 7, 25, 25, 40, 50, 300, 15, 1, 4000, 0, 0, 0, 2, 0, 0, 0, 8721, ["flyer", "breath", "magicImmune"], "redDragon"));

        // ---------------------------------------------------------- Stronghold
        Add(new("goblin", "Goblin", "stronghold", 1, 4, 2, 1, 2, 5, 5, 15, 40, 0, 0, 0, 0, 0, 0, 0, 43, []));
        Add(new("hobgoblin", "Hobgoblin", "stronghold", 1, 5, 3, 1, 2, 5, 7, 15, 50, 0, 0, 0, 0, 0, 0, 0, 78, [], "goblin"));
        Add(new("wolfRider", "Wolf Rider", "stronghold", 2, 7, 5, 2, 4, 10, 6, 9, 100, 0, 0, 0, 0, 0, 0, 0, 130, []));
        Add(new("wolfRaider", "Wolf Raider", "stronghold", 2, 8, 5, 3, 4, 10, 8, 9, 140, 0, 0, 0, 0, 0, 0, 0, 203, ["doubleStrike"], "wolfRider"));
        Add(new("orc", "Orc", "stronghold", 3, 8, 4, 2, 5, 15, 4, 7, 150, 0, 0, 0, 0, 0, 0, 12, 192, ["shooter"]));
        Add(new("orcChieftain", "Orc Chieftain", "stronghold", 3, 8, 4, 2, 5, 20, 5, 7, 165, 0, 0, 0, 0, 0, 0, 24, 240, ["shooter"], "orc"));
        Add(new("ogre", "Ogre", "stronghold", 4, 13, 7, 6, 12, 40, 4, 4, 300, 0, 0, 0, 0, 0, 0, 0, 416, []));
        Add(new("ogreMage", "Ogre Mage", "stronghold", 4, 13, 7, 6, 12, 60, 5, 4, 400, 0, 0, 0, 0, 0, 0, 0, 672, ["bloodlust"], "ogre"));
        Add(new("roc", "Roc", "stronghold", 5, 13, 11, 11, 15, 60, 7, 3, 600, 0, 0, 0, 0, 0, 0, 0, 792, ["flyer"]));
        Add(new("thunderbird", "Thunderbird", "stronghold", 5, 13, 11, 11, 15, 60, 11, 3, 700, 0, 0, 0, 0, 0, 0, 0, 1106, ["flyer", "thunder"], "roc"));
        Add(new("cyclops", "Cyclops", "stronghold", 6, 15, 12, 16, 20, 70, 6, 2, 750, 0, 0, 0, 0, 0, 0, 16, 1266, ["shooter"]));
        Add(new("cyclopsKing", "Cyclops King", "stronghold", 6, 17, 13, 16, 20, 70, 8, 2, 1100, 0, 0, 0, 0, 0, 0, 24, 1443, ["shooter"], "cyclops"));
        Add(new("behemoth", "Behemoth", "stronghold", 7, 17, 17, 30, 50, 160, 6, 1, 1500, 0, 0, 0, 0, 0, 0, 0, 3165, ["ignoreDef40"]));
        Add(new("ancientBehemoth", "Ancient Behemoth", "stronghold", 7, 19, 19, 30, 50, 300, 9, 1, 3000, 0, 0, 0, 0, 1, 0, 0, 6168, ["ignoreDef80"], "behemoth"));

        // ---------------------------------------------------------- Fortress
        Add(new("gnoll", "Gnoll", "fortress", 1, 3, 5, 2, 3, 6, 4, 12, 50, 0, 0, 0, 0, 0, 0, 0, 56, []));
        Add(new("gnollMarauder", "Gnoll Marauder", "fortress", 1, 4, 6, 2, 3, 6, 5, 12, 70, 0, 0, 0, 0, 0, 0, 0, 90, [], "gnoll"));
        Add(new("lizardman", "Lizardman", "fortress", 2, 5, 6, 2, 3, 14, 4, 9, 110, 0, 0, 0, 0, 0, 0, 12, 126, ["shooter"]));
        Add(new("lizardWarrior", "Lizard Warrior", "fortress", 2, 6, 8, 2, 5, 15, 5, 9, 140, 0, 0, 0, 0, 0, 0, 24, 156, ["shooter"], "lizardman"));
        Add(new("serpentFly", "Serpent Fly", "fortress", 3, 7, 9, 2, 5, 20, 9, 8, 220, 0, 0, 0, 0, 0, 0, 0, 268, ["flyer", "dispel"]));
        Add(new("dragonFly", "Dragon Fly", "fortress", 3, 8, 10, 2, 5, 20, 13, 8, 240, 0, 0, 0, 0, 0, 0, 0, 312, ["flyer", "dispel", "weakness"], "serpentFly"));
        Add(new("basilisk", "Basilisk", "fortress", 4, 11, 11, 6, 10, 35, 5, 4, 325, 0, 0, 0, 0, 0, 0, 0, 485, ["petrify"]));
        Add(new("greaterBasilisk", "Greater Basilisk", "fortress", 4, 12, 12, 6, 10, 40, 7, 4, 400, 0, 0, 0, 0, 0, 0, 0, 714, ["petrify"], "basilisk"));
        Add(new("gorgon", "Gorgon", "fortress", 5, 10, 14, 12, 16, 70, 5, 3, 525, 0, 0, 0, 0, 0, 0, 0, 890, []));
        Add(new("mightyGorgon", "Mighty Gorgon", "fortress", 5, 11, 16, 12, 16, 70, 6, 3, 600, 0, 0, 0, 0, 0, 0, 0, 1029, ["deathStare"], "gorgon"));
        Add(new("wyvern", "Wyvern", "fortress", 6, 14, 14, 14, 18, 70, 7, 2, 800, 0, 0, 0, 0, 0, 0, 0, 1350, ["flyer"]));
        Add(new("wyvernMonarch", "Wyvern Monarch", "fortress", 6, 14, 14, 18, 22, 70, 11, 2, 1100, 0, 0, 0, 0, 0, 0, 0, 1518, ["flyer", "poison"], "wyvern"));
        Add(new("hydra", "Hydra", "fortress", 7, 16, 18, 25, 45, 175, 5, 1, 2200, 0, 0, 0, 0, 0, 0, 0, 4120, ["noRetaliation", "multiAttack"]));
        Add(new("chaosHydra", "Chaos Hydra", "fortress", 7, 18, 20, 25, 45, 250, 7, 1, 3500, 0, 0, 0, 1, 0, 0, 0, 5931, ["noRetaliation", "multiAttack"], "hydra"));

        // ---------------------------------------------------------- Conflux
        Add(new("pixie", "Pixie", "conflux", 1, 2, 2, 1, 2, 3, 7, 20, 25, 0, 0, 0, 0, 0, 0, 0, 55, ["flyer"]));
        Add(new("sprite", "Sprite", "conflux", 1, 2, 2, 1, 3, 3, 9, 20, 30, 0, 0, 0, 0, 0, 0, 0, 95, ["flyer", "noRetaliation"], "pixie"));
        Add(new("airElemental", "Air Elemental", "conflux", 2, 9, 9, 2, 8, 25, 7, 6, 250, 0, 0, 0, 0, 0, 0, 0, 486, ["elemental", "immuneAir"]));
        Add(new("stormElemental", "Storm Elemental", "conflux", 2, 9, 9, 2, 8, 25, 8, 6, 275, 0, 0, 0, 0, 0, 0, 24, 486, ["elemental", "shooter", "immuneAir"], "airElemental"));
        Add(new("waterElemental", "Water Elemental", "conflux", 3, 8, 10, 3, 7, 30, 5, 6, 300, 0, 0, 0, 0, 0, 0, 0, 315, ["elemental", "immuneWater"]));
        Add(new("iceElemental", "Ice Elemental", "conflux", 3, 8, 10, 3, 7, 30, 6, 6, 375, 0, 0, 0, 0, 0, 0, 24, 380, ["elemental", "shooter", "immuneWater"], "waterElemental"));
        Add(new("fireElemental", "Fire Elemental", "conflux", 4, 10, 8, 4, 6, 35, 6, 5, 350, 0, 0, 0, 0, 0, 0, 0, 470, ["elemental", "fireImmune"]));
        Add(new("energyElemental", "Energy Elemental", "conflux", 4, 12, 8, 4, 6, 35, 8, 5, 400, 0, 0, 0, 0, 0, 0, 0, 470, ["elemental", "flyer", "fireImmune"], "fireElemental"));
        Add(new("earthElemental", "Earth Elemental", "conflux", 5, 10, 10, 4, 8, 40, 4, 4, 400, 0, 0, 0, 0, 0, 0, 0, 470, ["elemental", "immuneEarth"]));
        Add(new("magmaElemental", "Magma Elemental", "conflux", 5, 11, 11, 6, 10, 40, 6, 4, 500, 0, 0, 0, 0, 0, 0, 0, 600, ["elemental", "immuneEarth"], "earthElemental"));
        Add(new("psychicElemental", "Psychic Elemental", "conflux", 6, 15, 13, 10, 20, 75, 7, 2, 750, 0, 0, 0, 0, 0, 0, 0, 1669, ["elemental", "noRetaliation", "multiAttack"]));
        Add(new("magicElemental", "Magic Elemental", "conflux", 6, 15, 13, 15, 25, 80, 9, 2, 800, 0, 0, 0, 0, 0, 0, 0, 2012, ["elemental", "noRetaliation", "multiAttack", "magicImmune"], "psychicElemental"));
        Add(new("firebird", "Firebird", "conflux", 7, 18, 18, 30, 40, 150, 15, 2, 1500, 0, 0, 0, 0, 0, 0, 0, 4547, ["flyer", "breath", "fireImmune"]));
        Add(new("phoenix", "Phoenix", "conflux", 7, 21, 18, 30, 40, 200, 21, 2, 2000, 0, 0, 1, 0, 0, 0, 0, 6721, ["flyer", "breath", "fireImmune", "rebirth"], "firebird"));
    }

    /// <summary>The seven base creatures for a faction, in tier order.</summary>
    public static string[] BaseTiers(string faction) =>
        All.Values
            .Where(c => c.Faction == faction && c.UpgradeOf == null)
            .OrderBy(c => c.Tier)
            .Select(c => c.Key)
            .ToArray();

    /// <summary>The upgraded form of a creature, or null.</summary>
    public static string? UpgradeOf(string key) =>
        All.Values.FirstOrDefault(c => c.UpgradeOf == key)?.Key;
}