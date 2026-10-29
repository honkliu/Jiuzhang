using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace KanKan.API.Services.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;
using KanKan.API.Repositories.Homm;


public class GameService
{
    private readonly HommDb _db;
    private readonly IServiceProvider _services;
    public GameService(HommDb db, IServiceProvider services)
    {
        _db = db;
        _services = services;
    }

    /// <summary>Resolved lazily: AiService depends on GameService, so injecting it directly would cycle.</summary>
    private AiService Ai => _services.GetRequiredService<AiService>();

    /// <summary>Message produced by the most recent move, e.g. "enter-town:{id}".</summary>
    public string? LastMoveMessage { get; private set; }
    public List<AdventureNotice> LastMoveNotices { get; } = [];

    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    /// <summary>The Player.UserId of a computer-controlled seat.</summary>
    public static string AiUserId(int seat) => $"ai:{seat}";

    /// <summary>Name shown for a seat: the seated user's (or computer's) name, or "Open seat".</summary>
    public static string SeatName(Player p) =>
        p.UserId == null ? "Open seat" : string.IsNullOrWhiteSpace(p.DisplayName) ? Seeded.Players[p.Seat].Name : p.DisplayName;

    // ---------------------------------------------------------------- helpers
    public static string NormaliseAnswer(string s)
    {
        var sb = new StringBuilder();
        var lastSpace = false;
        foreach (var ch in s.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch)) { sb.Append(ch); lastSpace = false; }
            else if (char.IsWhiteSpace(ch) && !lastSpace) { sb.Append(' '); lastSpace = true; }
        }
        return sb.ToString().Trim();
    }

    public static string HashAnswer(string answer) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(NormaliseAnswer(answer))));

    // ---------------------------------------------------------------- army
    public record ArmySlot(string? Creature, int Count);

    public static ArmySlot[] ParseArmy(string json)
    {
        try
        {
            var raw = JsonSerializer.Deserialize<List<ArmySlot?>>(json, Json) ?? [];
            var slots = new ArmySlot[7];
            for (var i = 0; i < 7; i++)
                slots[i] = i < raw.Count && raw[i] != null ? raw[i]! : new ArmySlot(null, 0);
            return slots;
        }
        catch
        {
            return Enumerable.Range(0, 7).Select(_ => new ArmySlot(null, 0)).ToArray();
        }
    }

    public static string SerializeArmy(ArmySlot[] slots) => JsonSerializer.Serialize(slots, Json);

    public static bool AddToArmy(ArmySlot[] slots, string creature, int count)
    {
        for (var i = 0; i < slots.Length; i++)
            if (slots[i].Creature == creature) { slots[i] = slots[i] with { Count = slots[i].Count + count }; return true; }
        for (var i = 0; i < slots.Length; i++)
            if (slots[i].Creature == null) { slots[i] = new ArmySlot(creature, count); return true; }
        return false;
    }

    public static int ArmyStrength(ArmySlot[] slots) =>
        slots.Where(s => s.Creature != null)
             .Sum(s => (Creatures.All.TryGetValue(s.Creature!, out var c) ? c.AiValue : 100) * s.Count);

    // ---------------------------------------------------------------- fog
    public static byte[] ParseFog(string json, int size)
    {
        try
        {
            var arr = JsonSerializer.Deserialize<byte[]>(json);
            if (arr != null && arr.Length == size) return arr;
        }
        catch { }
        return new byte[size];
    }

    public static string SerializeFog(byte[] fog) => JsonSerializer.Serialize(fog);

    /// <summary>Radius a town lets its owner see, and Cover of Darkness's shroud radius (VCMI DARKNESS 20).</summary>
    public const int TownSight = 5;
    public const int DarknessRadius = 20;

    public static void RecomputeFog(byte[] fog, int w, int h, IEnumerable<Hero> heroes, IEnumerable<Town>? towns = null)
    {
        for (var i = 0; i < fog.Length; i++) if (fog[i] == 2) fog[i] = 1;

        var eyes = heroes.Select(hero =>
        {
            var skills = ParseSkills(hero.SkillsJson);
            var scoutingArtifacts = Artifacts.Layout(hero).Worn.Values.Count(k => Artifacts.Of(k).Id is 52 or 53);
            return (hero.X, hero.Y, R: 5 + Math.Clamp(skills.GetValueOrDefault("scouting"), 0, 3) + scoutingArtifacts);
        }).Concat((towns ?? []).Select(t => (t.X, t.Y, R: TownSight)));

        foreach (var (cx, cy, radius) in eyes)
        {
            for (var y = cy - radius; y <= cy + radius; y++)
            for (var x = cx - radius; x <= cx + radius; x++)
            {
                if (x < 0 || y < 0 || x >= w || y >= h) continue;
                var dx = x - cx;
                var dy = y - cy;
                if (dx * dx + dy * dy > radius * radius) continue;
                fog[y * w + x] = 2;
            }
        }
    }

    /// <summary>Necropolis Cover of Darkness: re-shrouds the land around the town for everyone else, except what they see now.</summary>
    public static void ApplyDarkness(byte[] fog, int w, int h, Town dark)
    {
        var r = DarknessRadius;
        for (var y = dark.Y - r; y <= dark.Y + r; y++)
        for (var x = dark.X - r; x <= dark.X + r; x++)
        {
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            var dx = x - dark.X;
            var dy = y - dark.Y;
            if (dx * dx + dy * dy > r * r) continue;
            if (fog[y * w + x] == 1) fog[y * w + x] = 0;
        }
    }

    public static Dictionary<string, int> ParseSkills(string json)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, int>>(json, Json) ?? []; }
        catch { return []; }
    }

    public static string[] ParseStringArray(string json)
    {
        try { return JsonSerializer.Deserialize<string[]>(json, Json) ?? []; }
        catch { return []; }
    }

    // ---------------------------------------------------------------- hero
    public static Hero CreateHero(Guid gameId, Guid playerId, SeededPlayer sp, int x, int y)
    {
        var def = Heroes.All[sp.HeroKey];
        var skills = def.InitialSkills?.ToDictionary(kv => kv.Key, kv => kv.Value) ?? def.Skills.ToDictionary(s => s, _ => 1);
        var hero = new Hero
        {
            GameId = gameId,
            PlayerId = playerId,
            HeroKey = def.Key,
            Name = def.Name,
            Faction = def.Faction,
            Level = 1,
            Experience = 0,
            Attack = def.Attack,
            Defense = def.Defense,
            Power = def.Power,
            Knowledge = def.Knowledge,
            X = x,
            Y = y,
            SkillsJson = JsonSerializer.Serialize(skills, Json),
            SpellsJson = JsonSerializer.Serialize(def.StartingSpells ?? [], Json),
            // magic heroes start with a spellbook, as in HoMM3
            ArtifactsJson = def.Might ? "[]" : JsonSerializer.Serialize(new[] { TownRules.Spellbook }, Json)
        };
        hero.MaxMana = ManaCapacity(hero);
        hero.Mana = hero.MaxMana;
        var tiers = Creatures.BaseTiers(sp.Faction);
        var army = Enumerable.Range(0, 7).Select(_ => new ArmySlot(null, 0)).ToArray();
        if (tiers.Length > 0) army[0] = new ArmySlot(tiers[0], 25);
        if (tiers.Length > 1) army[1] = new ArmySlot(tiers[1], 8);
        hero.ArmyJson = SerializeArmy(army);
        hero.MaxMovement = MaxMovement(hero);
        hero.Movement = hero.MaxMovement;
        return hero;
    }

    private static readonly int[] LandMovement = [1300, 1360, 1430, 1500, 1560, 1630, 1700, 1760, 1830, 1900, 1960, 2000];

    public static int MaxMovement(Hero hero)
    {
        var skills = ParseSkills(hero.SkillsJson);
        var speed = ParseArmy(hero.ArmyJson).Where(s => s.Count > 0 && s.Creature != null && Creatures.All.ContainsKey(s.Creature))
            .Select(s => Creatures.All[s.Creature!].Speed).DefaultIfEmpty(3).Min();
        var movement = LandMovement[Math.Clamp(speed, 0, LandMovement.Length - 1)];
        var logistics = Math.Clamp(skills.GetValueOrDefault("logistics"), 0, 3);
        return Math.Max(0, movement + movement * logistics / 10 - Math.Max(0, Effects(hero).MovementPenalty));
    }

    public static AdventureEffects Effects(Hero hero)
    {
        try { return JsonSerializer.Deserialize<AdventureEffects>(hero.AdventureEffectsJson, Json) ?? new(); }
        catch (JsonException) { return new(); }
    }

    public static void SetEffects(Hero hero, AdventureEffects effects) =>
        hero.AdventureEffectsJson = JsonSerializer.Serialize(effects, Json);

    public static TreasureChoice? Treasure(Hero hero) => hero.PendingTreasureJson == null
        ? null : JsonSerializer.Deserialize<TreasureChoice>(hero.PendingTreasureJson, Json);

    public static int ManaCapacity(Hero hero)
    {
        var knowledge = Math.Max(1, hero.Knowledge + Artifacts.Bonus(hero).Knowledge);
        var intelligence = Math.Clamp(ParseSkills(hero.SkillsJson).GetValueOrDefault("intelligence"), 0, 3);
        var multiplier = intelligence switch { 1 => 1.25, 2 => 1.5, 3 => 2.0, _ => 1.0 };
        return (int)(10 * knowledge * multiplier);
    }

    // ---------------------------------------------------------------- game creation
    public async Task<Game> CreateGameAsync(string name, int capacity, int turnSeconds, int turnLimit, int mapSize, int aiPlayers = 0,
        string? hostUserId = null, string? hostName = null)
    {
        capacity = Math.Clamp(capacity, 2, 3);
        if (turnSeconds is not (30 or 60 or 300 or 86400)) turnSeconds = 300;
        if (turnLimit != 0) turnLimit = Math.Clamp(turnLimit, 10, 500);
        mapSize = Math.Clamp(mapSize, 36, 144);

        var riddle = Riddles.Pick(Random.Shared);
        var map = MapGenerator.Generate(mapSize, mapSize, Seeded.Players.Length, Random.Shared.Next());

        var game = new Game
        {
            Name = string.IsNullOrWhiteSpace(name) ? "The Three Cities" : name.Trim(),
            HostUserId = hostUserId,
            Capacity = capacity,
            TurnSeconds = turnSeconds,
            TurnLimit = turnLimit,
            RiddleId = Array.IndexOf(Riddles.All, riddle),
            PuzzleAnswerHash = HashAnswer(riddle.Answer),
            FragmentsJson = JsonSerializer.Serialize(riddle.Fragments),
            MapWidth = mapSize,
            MapHeight = mapSize,
            MapJson = JsonSerializer.Serialize(map, Json),
            State = GameState.InProgress,
            Day = 1,
            Week = 1,
            Month = 1,
            CurrentTurn = 1,
            TurnStartedAt = DateTime.UtcNow
        };

        var rng = new Random();
        for (var attempt = 0; attempt < 500; attempt++)
        {
            var gx = rng.Next(2, mapSize - 2);
            var gy = rng.Next(2, mapSize - 2);
            if (map.At(gx, gy) is { Passable: true, ObjectKind: null } && Math.Min(Math.Max(Math.Abs(gx - 8), Math.Abs(gy - 8)),
                    Math.Min(Math.Max(Math.Abs(gx - (mapSize - 9)), Math.Abs(gy - 8)), Math.Max(Math.Abs(gx - 8), Math.Abs(gy - (mapSize - 9))))) > 3)
            {
                game.GrailX = gx;
                game.GrailY = gy;
                break;
            }
        }

        // the whole game is written once at the end (one document per game)
        _db.Games.Add(game);

        var starts = new (int x, int y)[] { (8, 8), (mapSize - 9, 8), (8, mapSize - 9) };
        for (var i = 0; i < Seeded.Players.Length; i++)
        {
            var sp = Seeded.Players[i];
            var (sx, sy) = starts[i];

            // the host plays seat 0; the last `aiPlayers` seats are computer-controlled
            var isAi = aiPlayers > 0 && i >= Seeded.Players.Length - aiPlayers;
            var player = new Player
            {
                GameId = game.Id,
                Seat = i,
                UserId = isAi ? AiUserId(i) : i == 0 ? hostUserId : null,
                DisplayName = isAi ? sp.Name : i == 0 && hostUserId != null ? hostName ?? sp.Name : "",
                Faction = sp.Faction,
                CityName = sp.CityName,
                IsAi = isAi,
                Wood = 20, Ore = 20, Mercury = 5, Sulfur = 5, Crystal = 5, Gems = 5, Gold = 20000
            };
            _db.Players.Add(player);

            // a HoMM3 starting town: Village Hall, Fort, Tavern and the first two dwellings
            string[] startBuildings = ["villageHall", "fort", "tavern", "dwelling1", "dwelling2"];
            var town = new Town
            {
                GameId = game.Id,
                PlayerId = player.Id,
                Name = sp.CityName,
                Faction = sp.Faction,
                X = sx,
                Y = sy,
                BuildingsJson = JsonSerializer.Serialize(startBuildings, Json),
                AvailableJson = JsonSerializer.Serialize(new Dictionary<string, int>
                {
                    ["1"] = TownBuildings.WeeklyGrowth(sp.Faction, startBuildings, 1),
                    ["2"] = TownBuildings.WeeklyGrowth(sp.Faction, startBuildings, 2)
                }, Json),
                GarrisonJson = SerializeArmy(Enumerable.Range(0, 7).Select(_ => new ArmySlot(null, 0)).ToArray()),
                TavernJson = JsonSerializer.Serialize(
                    Heroes.ForFaction(sp.Faction).Where(h => h.Key != sp.HeroKey).Select(h => h.Key).Take(2).ToArray(), Json),
                MageGuildJson = "[]"
            };
            _db.Towns.Add(town);

            var tile = map.At(sx, sy);
            tile.ObjectKind = "town";
            tile.ObjectData = town.Id.ToString();
            tile.Owner = i;
            tile.Passable = false;
            Footprint.Stamp(map, sx, sy, "town", null);
            var gate = map.At(sx, sy + 1);
            gate.ObjectKind = null;
            gate.Passable = true;

            // the starting hero stands in the town's gate, as in HoMM3
            var hero = CreateHero(game.Id, player.Id, sp, sx, sy);
            _db.Heroes.Add(hero);

            var fog = new byte[mapSize * mapSize];
            RecomputeFog(fog, mapSize, mapSize, [hero], [town]);
            player.FogJson = SerializeFog(fog);
        }

        var playerTowns = _db.Towns.Local.Where(t => t.GameId == game.Id).ToList();
        var avoidTiles = new HashSet<(int x, int y)> { (game.GrailX, game.GrailY) };
        foreach (var t in playerTowns) avoidTiles.Add((t.X, t.Y + 1));
        _db.Towns.AddRange(PlaceNeutralTowns(game.Id, map, playerTowns, avoidTiles, NeutralTownCount(mapSize), rng));

        game.MapJson = JsonSerializer.Serialize(map, Json);
        _db.SharedProjects.AddRange(SharedProjectCatalog.Seed(game.Id));
        await _db.SaveChangesAsync();
        return game;
    }

    // ---------------------------------------------------------------- map
    public Task<AdventureMap> LoadMapAsync(Game game)
    {
        var map = JsonSerializer.Deserialize<AdventureMap>(game.MapJson, Json) ?? new AdventureMap();
        foreach (var tile in map.Tiles.Where(t => t.ObjectKind == Footprint.Block && t.ObjectData?.Contains(',') == true))
        {
            var parts = tile.ObjectData!.Split(',');
            if (parts.Length != 2 || !int.TryParse(parts[0], out var ax) || !int.TryParse(parts[1], out var ay)
                || !map.InBounds(ax, ay) || map.At(ax, ay).ObjectKind is not ("town" or "mine")) continue;
            tile.ObjectKind = null; tile.ObjectData = null; tile.Sprite = null;
            tile.Passable = Terrain.Passable(tile.Terrain);
        }
        // Saved flags and footprints predate the current collision rules.
        foreach (var tile in map.Tiles.Where(Pathfinder.Pinches)) tile.Passable = false;
        for (var y = 0; y < map.Height; y++)
        for (var x = 0; x < map.Width; x++)
        {
            var tile = map.At(x, y);
            if (tile.ObjectKind is "town" or "mine")
                Footprint.Stamp(map, x, y, tile.ObjectKind, tile.ObjectData);
            ObjectGeometry.AssignObstacle(map, x, y);
            if (tile.ObjectKind == "shrine")
            {
                var spell = Spells.All.GetValueOrDefault(Spells.CanonicalKey(tile.ObjectData ?? ""));
                tile.Sprite = $"AVXl{Math.Clamp(spell?.Level ?? 1, 1, 3)}sh0";
            }
        }
        return Task.FromResult(map);
    }

    public async Task SaveMapAsync(Game game, AdventureMap map)
    {
        game.MapJson = JsonSerializer.Serialize(map, Json);
        await _db.SaveChangesAsync();
    }

    // ---------------------------------------------------------------- neutral towns
    // original HoMM3 town names (townname.txt) for unowned towns
    private static readonly Dictionary<string, string[]> NeutralNames = new()
    {
        ["castle"] = ["Castellatus", "Cornerstone", "Kanan", "Highcastle", "Whitemoon", "Transom", "Middleheim", "Brettonia"],
        ["rampart"] = ["Wise Oak", "Forest", "Fortune Keep", "Still Water", "Elfwind", "Serenity", "Gladeroot", "Rainhaven"],
        ["necropolis"] = ["Haunt's Wind", "Cessacioun", "Agony", "Sanctum", "Terminus", "Blackquarter", "Death's Gate", "Grave Raven"]
    };

    public static int NeutralTownCount(int mapSize) => Math.Max(1, mapSize / 30);

    /// <summary>
    /// Places unowned towns on open ground, away from other towns and reachable from the first start.
    /// The first hero to enter one claims it.
    /// </summary>
    public static List<Town> PlaceNeutralTowns(Guid gameId, AdventureMap map, IReadOnlyCollection<Town> existing,
        ISet<(int x, int y)> avoid, int count, Random rng)
    {
        var placed = new List<Town>();
        var all = existing.ToList();
        var starts = all.Where(t => t.PlayerId != Guid.Empty).ToList();
        // small maps are crowded: shrink the gap to other towns, then let the walls cover scenery
        foreach (var (gap, overScenery) in new[] { (10, false), (8, false), (10, true), (8, true), (6, true) })
        for (var attempt = 0; attempt < 4000 && placed.Count < count; attempt++)
        {
            var x = rng.Next(3, map.Width - 3);
            var y = rng.Next(3, map.Height - 4);
            if (all.Any(t => Math.Max(Math.Abs(t.X - x), Math.Abs(t.Y - y)) < gap)) continue;
            if (avoid.Any(a => a.x >= x - 5 && a.x <= x + 2 && a.y >= y - 4 && a.y <= y + 2)) continue;
            if (!map.At(x, y).Passable || map.At(x, y).ObjectKind != null) continue;
            if (!(overScenery ? FitsOverScenery(map, x, y) : Footprint.Fits(map, x, y, "town", null))) continue;
            if (starts.Count > 0 && !starts.Any(s => Pathfinder.FindPath(map, s.X, s.Y + 1, x, y + 1) != null)) continue;
            if (!StampIfStillReachable(map, x, y, starts)) continue;

            var faction = TownBuildings.Factions[rng.Next(TownBuildings.Factions.Length)];
            var used = all.Select(t => t.Name).ToHashSet();
            var name = NeutralNames[faction].Where(n => !used.Contains(n)).DefaultIfEmpty($"Outpost {placed.Count + 1}")
                .ElementAt(0);
            string[] buildings = ["villageHall", "fort", "dwelling1"];
            var town = new Town
            {
                GameId = gameId,
                PlayerId = Guid.Empty,
                Name = name,
                Faction = faction,
                X = x,
                Y = y,
                BuildingsJson = JsonSerializer.Serialize(buildings, Json),
                AvailableJson = JsonSerializer.Serialize(new Dictionary<string, int>
                {
                    ["1"] = TownBuildings.WeeklyGrowth(faction, buildings, 1)
                }, Json),
                GarrisonJson = SerializeArmy(Enumerable.Range(0, 7).Select(_ => new ArmySlot(null, 0)).ToArray()),
                TavernJson = "[]",
                MageGuildJson = "[]"
            };
            var tile = map.At(x, y);
            tile.ObjectData = town.Id.ToString();
            placed.Add(town);
            all.Add(town);
        }
        return placed;
    }

    /// <summary>
    /// Stamps a neutral town at (x, y) unless its walls would cut its gate off from every start
    /// or cut the starts off from each other; in that case the map is left untouched.
    /// </summary>
    private static bool StampIfStillReachable(AdventureMap map, int x, int y, List<Town> starts)
    {
        var cells = Footprint.Offsets("town", null).Append((0, 0))
            .Select(o => (x: x + o.Item1, y: y + o.Item2)).Where(p => map.InBounds(p.x, p.y)).ToList();
        var saved = cells.Select(p => map.At(p.x, p.y)).Select(t => (t.ObjectKind, t.ObjectData, t.Owner, t.Passable)).ToList();
        bool Reach((int x, int y) a, (int x, int y) b) => Pathfinder.FindPath(map, a.x, a.y, b.x, b.y) != null;
        var gates = starts.Select(s => (s.X, s.Y + 1)).ToList();
        var linked = gates.Skip(1).Select(g => Reach(gates[0], g)).ToList();

        var tile = map.At(x, y);
        tile.ObjectKind = "town";
        tile.Owner = -1;
        tile.Passable = false;
        Footprint.Stamp(map, x, y, "town", null);
        var ok = gates.Count == 0
            || (gates.Any(g => Reach(g, (x, y + 1))) && gates.Skip(1).Select(g => Reach(gates[0], g)).SequenceEqual(linked));
        if (ok) return true;
        for (var i = 0; i < cells.Count; i++)
        {
            var t = map.At(cells[i].x, cells[i].y);
            (t.ObjectKind, t.ObjectData, t.Owner, t.Passable) = saved[i];
        }
        return false;
    }

    private static bool FitsOverScenery(AdventureMap map, int x, int y)
    {
        if (!map.InBounds(x, y + 1) || !map.At(x, y + 1).Passable || map.At(x, y + 1).ObjectKind != null) return false;
        return Footprint.Offsets("town", null).All(o =>
            map.InBounds(x + o.dx, y + o.dy)
            && (map.At(x + o.dx, y + o.dy) is var t && (t.ObjectKind is "tree" or "rock" or "mountain"
                || (t.ObjectKind == null && t.Passable))));
    }

    // ---------------------------------------------------------------- movement
    /// <summary>
    /// Where a hero appears at a town (hired, or Town Portal): inside the town if the gate is free,
    /// else the nearest open tile outside it — two heroes never share a tile.
    /// </summary>
    public async Task<(int x, int y)> ArrivalSpotAsync(Game game, int tx, int ty, Guid? exceptHero = null)
    {
        var occupied = (await _db.Heroes.Where(h => h.GameId == game.Id && h.Id != exceptHero)
            .Select(h => new { h.X, h.Y }).ToListAsync()).Select(h => (h.X, h.Y)).ToHashSet();
        if (!occupied.Contains((tx, ty))) return (tx, ty);
        var map = await LoadMapAsync(game);
        var seen = new HashSet<(int, int)> { (tx, ty) };
        var queue = new Queue<(int x, int y)>();
        queue.Enqueue((tx, ty));
        while (queue.Count > 0)
        {
            var (cx, cy) = queue.Dequeue();
            foreach (var (dx, dy) in new[] { (0, 1), (-1, 1), (1, 1), (-1, 0), (1, 0), (0, -1), (-1, -1), (1, -1) })
            {
                var n = (cx + dx, cy + dy);
                if (!map.InBounds(n.Item1, n.Item2) || !seen.Add(n)) continue;
                var t = map.At(n.Item1, n.Item2);
                if (!t.Passable) { if (t.ObjectKind is Footprint.Block or "town") queue.Enqueue(n); continue; }
                if (!occupied.Contains(n)) return n;
                queue.Enqueue(n);
            }
        }
        return (tx, ty);
    }

    public async Task<(bool ok, string? error, Hero? hero)> MoveHeroAsync(Guid heroId, string playerId, List<(int x, int y)> path)
    {
        LastMoveNotices.Clear();
        LastMoveMessage = null;
        var hero = await _db.Heroes.FirstOrDefaultAsync(h => h.Id == heroId);
        if (hero == null) return (false, "Hero not found.", null);

        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == hero.PlayerId);
        if (player == null) return (false, "Player not found.", null);

        if (player.UserId == null || player.UserId != playerId) return (false, "Not your hero.", null);

        var game = await _db.Games.FirstAsync(g => g.Id == hero.GameId);
        if (game.State != GameState.InProgress) return (false, "The game is not in progress.", null);
        if (hero.PendingEncounterJson != null) return (false, "Resolve the encounter first.", null);
        if (hero.PendingTreasureJson != null) return (false, "Choose the treasure reward first.", null);
        if (hero.PendingLevelJson != null) return (false, "Choose the level-up skill first.", null);

        var map = await LoadMapAsync(game);
        var others = await _db.Heroes.Where(h => h.GameId == hero.GameId && h.Id != hero.Id)
            .Select(h => new { h.X, h.Y }).ToListAsync();
        var effects = Effects(hero);
        if (effects.FlightTurn == game.CurrentTurn)
            return await FlyAsync(game, map, player, hero, path, others.Select(h => (h.X, h.Y)).ToHashSet(), effects.FlightPenalty);
        bool Corner(int x, int y) => Pathfinder.Pinches(map.At(x, y)) || others.Any(o => o.X == x && o.Y == y);
        var moved = false;
        var acted = false;
        string? blocked = null;
        LastMoveMessage = null;

        foreach (var (x, y) in path)
        {
            if (!map.InBounds(x, y)) { blocked = "Cannot move there."; break; }
            var dx = x - hero.X;
            var dy = y - hero.Y;
            if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != 1) { blocked = "Heroes move one tile at a time."; break; }
            if (others.Any(o => o.X == x && o.Y == y)) { blocked = "Another hero stands there."; break; }
            if (dx != 0 && dy != 0 && (Corner(hero.X + dx, hero.Y) || Corner(hero.X, hero.Y + dy)))
            { blocked = "Cannot cut that corner."; break; }

            var tile = map.At(x, y);
            var cost = Terrain.StepCost(map.At(hero.X, hero.Y).Terrain,
                ParseSkills(hero.SkillsJson).GetValueOrDefault("pathfinding"), NativeTerrain(hero),
                dx != 0 && dy != 0, hero.Movement);

            // Mines, creatures, shrines and obelisks are visited from the neighbouring tile. A town is
            // different: the hero steps onto its own town's tile and stands inside it, as in HoMM3.
            if (!tile.Passable && tile.ObjectKind is "mine" or "monster" or "town" or "obelisk" or "shrine")
            {
                if (tile.ObjectKind == "town")
                {
                    var townId = Guid.TryParse(tile.ObjectData, out var tid) ? tid : (Guid?)null;
                    var town = townId == null ? null : await _db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
                    var townOwner = town == null ? null : await _db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
                    // an unowned town is claimed by the first hero to enter it; another player's town
                    // is only visited, never taken
                    var claim = town != null && town.PlayerId == Guid.Empty;
                    if (town != null && (claim || townOwner != null && townOwner.Id == player.Id))
                    {
                        // own town: walk onto the tile so the hero is visibly inside
                        if (hero.Movement < cost) { blocked = "Not enough movement left today."; break; }
                        if (claim)
                        {
                            town.PlayerId = player.Id;
                            tile.Owner = player.Seat;
                        }
                        hero.Movement -= cost;
                        hero.X = x;
                        hero.Y = y;
                        ExhaustMovement(hero, map);
                        moved = true;
                        LastMoveMessage = $"enter-town:{town.Id}";
                        VisitOwnTown(game, hero, town);
                        break;
                    }
                }
                if (tile.ObjectKind != "town")
                {
                    if (hero.Movement < cost) { blocked = "Not enough movement left today."; break; }
                    hero.Movement -= cost;
                    ExhaustMovement(hero, map);
                }
                var (_, adjMsg) = await InteractAsync(game, map, player, hero, tile, x, y);
                if (adjMsg != null) LastMoveMessage = adjMsg;
                acted = true;
                break;
            }

            if (!tile.Passable) { blocked = "Cannot move there."; break; }
            if (hero.Movement < cost) { blocked = "Not enough movement left today."; break; }

            hero.Movement -= cost;
            hero.X = x;
            hero.Y = y;
            ExhaustMovement(hero, map);
            moved = true;

            var (stop, msg) = await InteractAsync(game, map, player, hero, tile, x, y);
            if (msg != null) LastMoveMessage = msg;
            if (stop) break;
        }

        if (moved || acted)
        {
            var fog = ParseFog(player.FogJson, map.Width * map.Height);
            var heroes = await _db.Heroes.Where(h => h.PlayerId == player.Id).ToListAsync();
            var ownTowns = (await _db.Towns.Where(t => t.PlayerId == player.Id).ToListAsync())
                .Union(_db.Towns.Local.Where(t => t.PlayerId == player.Id)).ToList();
            RecomputeFog(fog, map.Width, map.Height, heroes, ownTowns);
            player.FogJson = SerializeFog(fog);
            await SaveMapAsync(game, map);
            return (true, null, hero);
        }

        return (false, blocked ?? "Cannot move there.", hero);
    }

    public static string? NativeTerrain(Hero hero)
    {
        var terrains = ParseArmy(hero.ArmyJson).Where(s => s.Creature != null && s.Count > 0)
            .Select(s => Creatures.All.TryGetValue(s.Creature!, out var c) ? c.Faction switch
            {
                "castle" or "rampart" or "conflux" => "grass", "tower" => "snow",
                "inferno" => "lava", "necropolis" => "dirt", "dungeon" => "subterranean",
                "stronghold" => "rough", "fortress" => "swamp", _ => null
            } : null).Distinct().ToArray();
        return terrains.Length == 1 ? terrains[0] : null;
    }

    private static void ExhaustMovement(Hero hero, AdventureMap map)
    {
        var minimum = Terrain.MoveCost(map.At(hero.X, hero.Y).Terrain,
            ParseSkills(hero.SkillsJson).GetValueOrDefault("pathfinding"), NativeTerrain(hero));
        if (hero.Movement > 0 && hero.Movement < minimum) hero.Movement = 0;
    }

    /// <summary>A hero entering its own town learns the guild's spells and, in a Castle, visits the Stables.</summary>
    public static void VisitOwnTown(Game game, Hero hero, Town town)
    {
        TownRules.LearnGuildSpells(hero, town);
        TownRules.VisitStables(hero, game, ParseStringArray(town.BuildingsJson));
    }

    private (bool stop, string? message) Notify(string kind, string key, decimal amount, string message, int? icon = null)
    {
        LastMoveNotices.Add(new AdventureNotice(kind, key, amount, message, icon));
        return (true, message);
    }

    private async Task<(bool stop, string? message)> InteractAsync(Game game, AdventureMap map, Player player, Hero hero, MapTile tile, int tx, int ty)
    {
        switch (tile.ObjectKind)
        {
            case "resource":
            {
                var parts = (tile.ObjectData ?? "").Split(':');
                var type = parts[0];
                var amount = parts.Length > 1 ? int.Parse(parts[1]) : 0;
                AddResource(player, type, amount);
                tile.ObjectKind = null;
                tile.ObjectData = null;
                return Notify("resource", type, amount, $"You collect {type}.");
            }
            case "treasure":
            {
                var parts = (tile.ObjectData ?? "").Split(':');
                var gold = parts.Length > 0 ? int.Parse(parts[0]) : 0;
                var xp = parts.Length > 1 ? int.Parse(parts[1]) : 0;
                hero.PendingTreasureJson = JsonSerializer.Serialize(new TreasureChoice(gold, xp, tx, ty), Json);
                return (true, (string?)"treasure:choose");
            }
            case "mine":
            {
                var ownerIndex = player.Seat;
                var yield = tile.ObjectData is "wood" or "ore" ? 2 : tile.ObjectData == "gold" ? 1000 : 1;
                if (tile.Owner != 0 && tile.MineShared)
                    return Notify("mine", tile.ObjectData ?? "gold", yield / 2m,
                        "This shared mine supplies half its daily production to each city. Fractional resources accumulate until spendable.");
                var bit = 1 << ownerIndex;
                if ((tile.Owner & bit) != 0)
                    return Notify("mine", tile.ObjectData ?? "gold", yield, "This mine already supplies your city.");
                if (tile.Owner != 0)
                    return Notify("message", "Mine", 0, "This mine belongs to another city. Sharing requires its owner's permission.");
                tile.Owner |= bit;
                return Notify("mine", tile.ObjectData ?? "gold", yield, $"You claim the {tile.ObjectData} mine. It will supply your city each day.");
            }
            case "artifact":
            {
                var found = tile.ObjectData ?? "artifact";
                if (!Artifacts.Add(hero, found)) return Notify("message", "Backpack", 0, "The backpack is full.");
                tile.ObjectKind = null;
                tile.ObjectData = null;
                return Notify("artifact", found, 1, $"You discover the {Artifacts.Of(found).Name}.", Artifacts.Of(found).Id);
            }
            case "shrine":
            {
                // HoMM3: a shrine teaches nothing to a hero without a spellbook, and stays put
                if (!TownRules.HasGear(hero, TownRules.Spellbook))
                    return Notify("shrine", Spells.CanonicalKey(tile.ObjectData ?? ""), 0, "You need a spellbook to learn this spell.");
                var spells = ParseStringArray(hero.SpellsJson).Select(Spells.CanonicalKey).Distinct().ToList();
                var spell = Spells.CanonicalKey(tile.ObjectData ?? "spell");
                if (!Spells.All.TryGetValue(spell, out var shrineSpell))
                    return Notify("message", "Shrine", 0, "This shrine has no spell to teach.");
                var wisdom = ParseSkills(hero.SkillsJson).GetValueOrDefault("wisdom");
                if (shrineSpell.Level > Spells.MaxLearnable(wisdom))
                    return Notify("shrine", spell, 0, $"Greater Wisdom is required to learn {shrineSpell.Name}.");
                var known = spells.Contains(spell);
                if (!known) spells.Add(spell);
                hero.SpellsJson = JsonSerializer.Serialize(spells, Json);
                return Notify("shrine", spell, 1, known ? $"You already know {shrineSpell.Name}." : $"You learn {shrineSpell.Name}.");
            }
            case "monster":
            {
                // peaceful encounter: stop beside the stack and let the player choose
                var parts = (tile.ObjectData ?? "").Split(':');
                var creature = parts[0];
                var count = parts.Length > 1 && int.TryParse(parts[1], out var n) ? n : 5;
                hero.PendingEncounterJson = JsonSerializer.Serialize(
                    new { creature, count, x = tx, y = ty }, Json);
                return (true, (string?)"A wandering band blocks the way.");
            }
            case "town":
            {
                // stepping up to a town enters it: the client opens the town screen
                var townId = Guid.TryParse(tile.ObjectData, out var tid) ? tid : (Guid?)null;
                if (townId == null) return (true, (string?)null);
                var town = await _db.Towns.FirstOrDefaultAsync(t => t.Id == townId);
                if (town == null) return (true, (string?)null);
                var owner = await _db.Players.FirstOrDefaultAsync(p => p.Id == town.PlayerId);
                var mine = owner != null && owner.Id == player.Id;
                return (true, (string?)(mine ? $"enter-town:{townId}" : $"visit-town:{townId}"));
            }
            case "obelisk":
            {
                // reading the obelisk is the visit: the first time uncovers part of the puzzle map,
                // and the client opens the obelisk board
                var fresh = RecordObeliskVisit(game, map, player, tx, ty);
                return (true, (string?)(fresh ? "obelisk:open:new" : "obelisk:open"));
            }
            case "grail":
            {
                // digging takes the rest of the day
                game.GrailFound = true;
                game.GrailFinderPlayerId = player.Id;
                player.Precious = true;
                hero.Movement = 0;
                tile.ObjectKind = null;
                tile.ObjectData = null;
                return Notify("grail", "Grail", 1, "You uncover the Grail. Bring it to your town to build the Grail Structure.", 2);
            }
            default:
                return (false, (string?)null);
        }
    }

    public async Task<(bool ok, string? error, string? message)> ResolveTreasureAsync(Guid heroId, string playerId, string choice)
    {
        var hero = await _db.Heroes.FirstOrDefaultAsync(h => h.Id == heroId);
        if (hero == null) return (false, "Hero not found.", null);
        var player = await _db.Players.FirstAsync(p => p.Id == hero.PlayerId);
        if (player.UserId == null || player.UserId != playerId) return (false, "Not your hero.", null);
        var game = await _db.Games.FirstAsync(g => g.Id == hero.GameId);
        if (game.State != GameState.InProgress) return (false, "The game is not in progress.", null);
        if (choice is not ("gold" or "experience" or "leave")) return (false, "Choose gold or experience, or leave the chest.", null);
        var treasure = Treasure(hero);
        if (treasure == null) return (false, "There is no treasure choice pending.", null);
        var map = await LoadMapAsync(game);
        if (!map.InBounds(treasure.X, treasure.Y) || hero.X != treasure.X || hero.Y != treasure.Y
            || map.At(treasure.X, treasure.Y).ObjectKind != "treasure")
            return (false, "That chest is no longer here.", null);
        if (choice == "gold" && (long)player.Gold + treasure.Gold > int.MaxValue
            || choice == "experience" && (long)hero.Experience + treasure.Experience > int.MaxValue)
            return (false, "That reward is too large.", null);
        if (choice == "gold") player.Gold += treasure.Gold;
        if (choice == "experience") GainExperience(hero, treasure.Experience);
        if (choice != "leave")
        {
            map.At(treasure.X, treasure.Y).ObjectKind = null;
            map.At(treasure.X, treasure.Y).ObjectData = null;
        }
        hero.PendingTreasureJson = null;
        try { await SaveMapAsync(game, map); }
        catch (HommConcurrencyException)
        {
            _db.ChangeTracker.Clear();
            return (false, "The chest choice was already resolved.", null);
        }
        LastMoveNotices.Clear();
        if (choice != "leave")
            LastMoveNotices.Add(new AdventureNotice(choice == "gold" ? "resource" : "experience",
                choice == "gold" ? "gold" : "experience", choice == "gold" ? treasure.Gold : treasure.Experience,
                choice == "gold" ? "You keep the gold." : "You share the treasure and gain experience."));
        return (true, null, choice switch
        {
            "gold" => $"Found {treasure.Gold} gold.",
            "experience" => $"Gained {treasure.Experience} experience.",
            _ => "You leave the chest unopened."
        });
    }

    private async Task<(bool ok, string? error, Hero? hero)> FlyAsync(Game game, AdventureMap map, Player player,
        Hero hero, List<(int x, int y)> path, HashSet<(int x, int y)> occupied, int penalty)
    {
        LastMoveMessage = null;
        var fog = ParseFog(player.FogJson, map.Width * map.Height);
        var ownTowns = await _db.Towns.Where(t => t.PlayerId == player.Id).ToListAsync();
        bool CanLand(int x, int y) => !occupied.Contains((x, y)) && fog[y * map.Width + x] > 0
            && ((!Pathfinder.Pinches(map.At(x, y)) && Terrain.Passable(map.At(x, y).Terrain))
                || ownTowns.Any(t => t.X == x && t.Y == y));
        if (path.Count == 0) return (false, "Choose a landing tile.", hero);
        var end = path[^1];
        if (!map.InBounds(end.x, end.y)) return (false, "That flight route is blocked.", hero);
        var visit = !CanLand(end.x, end.y) && !occupied.Contains(end)
            && map.At(end.x, end.y).ObjectKind is "monster" or "mine" or "shrine" or "obelisk" or "town";
        var destination = visit ? path.Count > 1 ? path[^2] : (hero.X, hero.Y) : end;
        if (!map.InBounds(destination.Item1, destination.Item2) || fog[end.y * map.Width + end.x] == 0
            || !CanLand(destination.Item1, destination.Item2)
            || visit && Math.Max(Math.Abs(end.x - destination.Item1), Math.Abs(end.y - destination.Item2)) != 1)
            return (false, "Fly must end on explored, unoccupied ground or your town gate.", hero);

        var x = hero.X; var y = hero.Y; var spent = 0; var landingCost = 0;
        (int x, int y)? landing = visit && path.Count == 1 ? (hero.X, hero.Y) : null;
        foreach (var next in visit ? path.Take(path.Count - 1) : path)
        {
            var dx = Math.Abs(next.x - x); var dy = Math.Abs(next.y - y);
            if (!map.InBounds(next.x, next.y) || Math.Max(dx, dy) != 1 || map.At(next.x, next.y).Terrain == "rock")
                return (false, "That flight route is blocked.", hero);
            spent += (dx != 0 && dy != 0 ? 141 : 100) * (100 + penalty) / 100;
            x = next.x; y = next.y;
            if (spent <= hero.Movement && CanLand(x, y)) { landing = (x, y); landingCost = spent; }
        }
        if (landing is not { } target) return (false, "Not enough movement to reach a legal landing.", hero);
        hero.X = target.x; hero.Y = target.y; hero.Movement -= landingCost;
        var town = ownTowns.FirstOrDefault(t => t.X == hero.X && t.Y == hero.Y);
        var stopAtLanding = false;
        if (town != null)
        {
            VisitOwnTown(game, hero, town);
            LastMoveMessage = $"enter-town:{town.Id}";
        }
        else
        {
            var (stop, message) = await InteractAsync(game, map, player, hero, map.At(hero.X, hero.Y), hero.X, hero.Y);
            stopAtLanding = stop;
            LastMoveMessage = message;
        }
        if (visit && target == destination && !stopAtLanding)
        {
            var cost = map.At(end.x, end.y).ObjectKind == "town" ? 0
                : Terrain.StepCost(map.At(hero.X, hero.Y).Terrain,
                    ParseSkills(hero.SkillsJson).GetValueOrDefault("pathfinding"), NativeTerrain(hero),
                    hero.X != end.x && hero.Y != end.y, hero.Movement);
            if (hero.Movement >= cost)
            {
                hero.Movement -= cost;
                var (_, message) = await InteractAsync(game, map, player, hero, map.At(end.x, end.y), end.x, end.y);
                LastMoveMessage = message;
            }
            else LastMoveMessage = "Not enough movement left to visit the object.";
        }
        var heroes = await _db.Heroes.Where(h => h.PlayerId == player.Id).ToListAsync();
        RecomputeFog(fog, map.Width, map.Height, heroes, ownTowns);
        player.FogJson = SerializeFog(fog);
        await SaveMapAsync(game, map);
        return (true, null, hero);
    }

    private static void AddResource(Player p, string type, int amount)
    {
        switch (type)
        {
            case "wood": p.Wood += amount; break;
            case "ore": p.Ore += amount; break;
            case "mercury": p.Mercury += amount; break;
            case "sulfur": p.Sulfur += amount; break;
            case "crystal": p.Crystal += amount; break;
            case "gems": p.Gems += amount; break;
            case "gold": p.Gold += amount; break;
        }
    }

    public static void GainExperience(Hero hero, int xp)
    {
        var learning = Math.Clamp(ParseSkills(hero.SkillsJson).GetValueOrDefault("learning"), 0, 3);
        hero.Experience = (int)Math.Min(int.MaxValue, (long)hero.Experience + Math.Max(0, (long)xp * (100 + 5 * learning) / 100));
        HeroProgression.Advance(hero);
    }

    // ---------------------------------------------------------------- turns
    // TickAsync is called both by the background TurnTicker and by the _test/nextday
    // endpoint. Two concurrent ticks load the same Game row and both write it, so the
    // second SaveChanges finds 0 rows affected and throws HommConcurrencyException.
    internal static readonly SemaphoreSlim MutationLock = new(1, 1);

    public async Task<List<Guid>> TickAsync(bool acquireLock = true)
    {
        if (acquireLock) await MutationLock.WaitAsync();
        try
        {
            return await TickCoreAsync();
        }
        finally
        {
            if (acquireLock) MutationLock.Release();
        }
    }

    private async Task<List<Guid>> TickCoreAsync()
    {
        var now = DateTime.UtcNow;
        var advanced = new List<Guid>();
        // only games whose turn timer ran out are loaded (each game is a whole MongoDB document)
        var games = await _db.LoadGamesDueAsync(now);

        foreach (var game in games)
        {
            if ((now - game.TurnStartedAt).TotalSeconds < game.TurnSeconds) continue;

            game.CurrentTurn++;
            game.TurnStartedAt = now;
            game.Day++;
            if (game.Day > 7) { game.Day = 1; game.Week++; }
            if (game.Week > 4) { game.Week = 1; game.Month++; }

            var players = await _db.Players.Where(p => p.GameId == game.Id).ToListAsync();
            var towns = await _db.Towns.Where(t => t.GameId == game.Id).ToListAsync();
            var map = await LoadMapAsync(game);
            var caravan = await _db.SharedProjects.FirstOrDefaultAsync(sp =>
                sp.GameId == game.Id && sp.Completed && sp.Name == SharedProjectCatalog.CaravanRoad);
            var caravanMembers = caravan == null ? [] : ParseStringArray(caravan.ContributorsJson);

            foreach (var p in players)
            {
                p.BuiltThisTurn = false;
                p.WrongAnswers = 0;
                var openingGold = p.Gold;
                if (caravanMembers.Contains(p.Id.ToString())) p.Gold += SharedProjectCatalog.CaravanGoldPerDay;

                foreach (var town in towns.Where(t => t.PlayerId == p.Id))
                {
                    var built = ParseStringArray(town.BuildingsJson);
                    if (game.Day == 1 && town.Faction == "rampart" && built.Contains("special3"))
                        p.Gold += openingGold / 10;
                    p.Gold += TownBuildings.GoldIncome(built);
                    if (built.Contains("resourceSilo"))
                        foreach (var (r, v) in TownBuildings.SiloProduction(town.Faction))
                            TownRules.Add(p, r, v);
                }

                var ownerIndex = p.Seat;
                var halfUnits = ParseSkills(p.MineRemaindersJson);
                foreach (var t in map.Tiles)
                {
                    if (t.ObjectKind != "mine" || t.Owner <= 0
                        || (!t.MineShared && (t.Owner & (1 << ownerIndex)) == 0)
                        || !TownRules.IsResource(t.ObjectData ?? "")) continue;
                    var resource = t.ObjectData!;
                    var yield = resource is "wood" or "ore" ? 2 : resource == "gold" ? 1000 : 1;
                    var credit = halfUnits.GetValueOrDefault(resource) + (t.MineShared ? yield : 2 * yield);
                    TownRules.Add(p, resource, credit / 2);
                    halfUnits[resource] = credit % 2;
                }
                p.MineRemaindersJson = JsonSerializer.Serialize(halfUnits, Json);

                var heroes = await _db.Heroes.Where(h => h.PlayerId == p.Id).ToListAsync();
                foreach (var h in heroes)
                {
                    var estates = Math.Clamp(ParseSkills(h.SkillsJson).GetValueOrDefault("estates"), 0, 3);
                    p.Gold += estates switch { 1 => 125, 2 => 250, 3 => 500, _ => 0 };
                    var effects = Effects(h);
                    SetEffects(h, effects with { FlightTurn = 0, FlightPenalty = 0, HasteTurn = 0, HasteBonus = 0,
                        VisionsTurn = 0, VisionsMastery = 0, DoorTurn = 0, DoorCasts = 0 });
                    // Castle Stables' bonus lasts until the end of the week it was granted in
                    h.MaxMovement = MaxMovement(h) + (TownRules.StabledThisWeek(h, game) ? 400 : 0);
                    h.Movement = h.MaxMovement;
                    h.MaxMana = ManaCapacity(h);
                    var inGuild = towns.Any(t => t.PlayerId == p.Id && t.X == h.X && t.Y == h.Y
                        && ParseStringArray(t.BuildingsJson).Contains("mageGuild1"));
                    var regeneration = 1 + Math.Clamp(ParseSkills(h.SkillsJson).GetValueOrDefault("mysticism"), 0, 3);
                    if (h.Mana < h.MaxMana)
                        h.Mana = inGuild && TownRules.HasGear(h, TownRules.Spellbook)
                            ? h.MaxMana : Math.Min(h.MaxMana, h.Mana + regeneration);
                }

                // towns keep their surroundings in sight; Cover of Darkness re-shrouds rivals' land
                var mapFog = ParseFog(p.FogJson, map.Width * map.Height);
                RecomputeFog(mapFog, map.Width, map.Height, heroes, towns.Where(t => t.PlayerId == p.Id));
                foreach (var dark in towns.Where(t => t.PlayerId != p.Id && ParseStringArray(t.BuildingsJson).Contains("special1")
                                                      && t.Faction == "necropolis"))
                    ApplyDarkness(mapFog, map.Width, map.Height, dark);
                p.FogJson = SerializeFog(mapFog);
            }

            if (game.Day == 1)
            {
                foreach (var town in towns)
                {
                    var built = ParseStringArray(town.BuildingsJson);
                    var avail = JsonSerializer.Deserialize<Dictionary<string, int>>(town.AvailableJson, Json) ?? [];
                    for (var tier = 1; tier <= 7; tier++)
                    {
                        if (!TownBuildings.HasDwelling(built, tier)) continue;
                        var k = tier.ToString();
                        avail[k] = (avail.TryGetValue(k, out var cur) ? cur : 0) + TownBuildings.WeeklyGrowth(town.Faction, built, tier);
                    }
                    town.AvailableJson = JsonSerializer.Serialize(avail, Json);

                    var townOwner = players.FirstOrDefault(p => p.Id == town.PlayerId);
                    if (townOwner != null && town.Faction == "rampart")
                    {
                        // Mystic Pond: 1-4 of a random rare resource each week
                        if (built.Contains("special1"))
                        {
                            string[] rare = ["mercury", "sulfur", "crystal", "gems"];
                            TownRules.Add(townOwner, rare[Random.Shared.Next(rare.Length)], Random.Shared.Next(1, 5));
                        }
                    }

                    // the tavern offers two fresh heroes each day, never one already hired
                    if (built.Contains("tavern"))
                    {
                        var owner = players.FirstOrDefault(p => p.Id == town.PlayerId);
                        var hired = owner == null
                            ? []
                            : (await _db.Heroes.Where(h => h.PlayerId == owner.Id).Select(h => h.HeroKey).ToListAsync());
                        var pool = Heroes.ForFaction(town.Faction)
                            .Where(h => !hired.Contains(h.Key))
                            .OrderBy(_ => Random.Shared.Next())
                            .Take(2)
                            .Select(h => h.Key)
                            .ToArray();
                        town.TavernJson = JsonSerializer.Serialize(pool, Json);
                    }
                }
            }

            if (game.TurnLimit > 0 && game.CurrentTurn > game.TurnLimit)
                game.State = GameState.Finished;

            try
            {
                await _db.SaveChangesAsync();
            }
            catch (HommConcurrencyException)
            {
                // the game was deleted or finished by another request while this tick ran;
                // drop the pending changes for it and move on
                _db.Detach(game.Id);

                continue;
            }

            // computer seats take their turn after the day has rolled over
            if (game.State == GameState.InProgress && players.Any(p => p.IsAi))
                await Ai.PlayAsync(game);

            await SaveMapAsync(game, map);
            advanced.Add(game.Id);
        }

        if (advanced.Count > 0) await _db.SaveChangesAsync();
        return advanced;
    }

    // ---------------------------------------------------------------- obelisk
    public static int ObeliskTotal(AdventureMap map) => map.Tiles.Count(t => t.ObjectKind == "obelisk");

    public static HashSet<string> ParseVisitedObelisks(string json) => ParseStringArray(json).ToHashSet();

    /// <summary>
    /// A hero standing at an obelisk reads it: the first visit to each obelisk uncovers part of the
    /// player's puzzle map (as in HoMM3). Once every obelisk has been read the dig site is marked.
    /// </summary>
    private static bool RecordObeliskVisit(Game game, AdventureMap map, Player player, int x, int y)
    {
        var visited = ParseVisitedObelisks(player.ObelisksVisitedJson);
        if (!visited.Add($"{x},{y}")) return false;
        player.ObelisksVisitedJson = JsonSerializer.Serialize(visited.ToArray(), Json);
        player.ObeliskVisits = visited.Count;
        if (visited.Count >= ObeliskTotal(map)) RevealGrail(game, map);
        return true;
    }

    /// <summary>Marks the Grail tile on the in-hand map so a hero can walk there and dig.</summary>
    public static void RevealGrail(Game game, AdventureMap map)
    {
        if (game.GrailRevealed || game.GrailFound) return;
        game.GrailRevealed = true;
        if (game.GrailX >= 0 && game.GrailY >= 0 && map.InBounds(game.GrailX, game.GrailY))
        {
            var t = map.At(game.GrailX, game.GrailY);
            t.ObjectKind = "grail";
            t.ObjectData = null;
            t.Passable = true;
        }
    }
}
