namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


/// <summary>A single map tile.</summary>
public class MapTile
{
    public string Terrain { get; set; } = "grass";
    public int Variant { get; set; }
    public bool Passable { get; set; } = true;
    /// <summary>Object kind: mine, resource, treasure, artifact, shrine, monster, town, tree, rock, mountain, null.</summary>
    public string? ObjectKind { get; set; }
    /// <summary>Object payload (resource type, mine type, creature key, amount, ...).</summary>
    public string? ObjectData { get; set; }
    public string? Sprite { get; set; }
    /// <summary>Owner player index for mines and towns; -1 for neutral.</summary>
    public int Owner { get; set; } = -1;
    public bool MineShared { get; set; }
}

public class AdventureMap
{
    public int Width { get; set; }
    public int Height { get; set; }
    public List<MapTile> Tiles { get; set; } = new();

    public MapTile At(int x, int y) => Tiles[y * Width + x];
    public bool InBounds(int x, int y) => x >= 0 && y >= 0 && x < Width && y < Height;
}

/// <summary>
/// Multi-tile object footprints, as in HoMM3: a town or mine sprite covers several tiles,
/// but only its entrance (the anchor tile, bottom row) is visited. The other covered tiles
/// are blocked and point back at the anchor ("block" tiles with ObjectData "x,y"), so
/// clicking anywhere on the building targets the entrance.
/// </summary>
public static class Footprint
{
    public const string Block = "block";

    /// <summary>Blocked offsets (dx, dy) around the anchor; matches the sprites the client draws.</summary>
    public static IEnumerable<(int dx, int dy)> Offsets(string kind, string? data)
    {
        var sprite = ObjectGeometry.Building(kind, data);
        if (sprite.Length == 0) yield break;
        foreach (var offset in ObjectGeometry.Blocked(sprite))
            if (offset != (0, 0)) yield return offset;
    }

    /// <summary>True when every footprint tile and the approach tile below the entrance are open ground.</summary>
    public static bool Fits(AdventureMap map, int x, int y, string kind, string? data)
    {
        if (!map.InBounds(x, y + 1)) return false;
        var front = map.At(x, y + 1);
        if (!front.Passable || front.ObjectKind != null) return false;
        foreach (var (dx, dy) in Offsets(kind, data))
        {
            if (!map.InBounds(x + dx, y + dy)) return false;
            var t = map.At(x + dx, y + dy);
            if (!t.Passable || t.ObjectKind != null) return false;
        }
        return true;
    }

    /// <summary>Marks the covered tiles impassable and links them to the anchor.</summary>
    public static void Stamp(AdventureMap map, int x, int y, string kind, string? data)
    {
        foreach (var (dx, dy) in Offsets(kind, data))
        {
            if (!map.InBounds(x + dx, y + dy)) continue;
            var t = map.At(x + dx, y + dy);
            if (t.ObjectKind != null && t.ObjectKind != Block && t.ObjectKind is not ("tree" or "rock" or "mountain"))
            {
                t.Passable = false;
                continue;
            }
            t.ObjectKind = Block;
            t.ObjectData = $"{x},{y}";
            t.Owner = -1;
            t.Passable = false;
        }
    }
}

public static class MapGenerator
{
    private static readonly string[] MineTypes = ["wood", "ore", "gold", "mercury", "sulfur", "crystal", "gems"];

    public static AdventureMap Generate(int width, int height, int playerCount, int seed)
    {
        var rng = new Random(seed);
        var map = new AdventureMap { Width = width, Height = height };

        // ---- terrain via value noise
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var n = Fbm(x / 14.0, y / 14.0, seed, 4);
                var t = n switch
                {
                    < 0.35 => "dirt",
                    < 0.42 => "rough",
                    > 0.75 => "snow",
                    > 0.68 => "sand",
                    _ => "grass"
                };
                map.Tiles.Add(new MapTile
                {
                    Terrain = t,
                    Variant = rng.Next(4),
                    Passable = true
                });
            }
        }

        // ---- lakes
        for (var i = 0; i < 6; i++)
        {
            var cx = rng.Next(6, width - 6);
            var cy = rng.Next(6, height - 6);
            var r = rng.Next(2, 5);
            for (var y = cy - r; y <= cy + r; y++)
            for (var x = cx - r; x <= cx + r; x++)
            {
                if (!map.InBounds(x, y)) continue;
                if (Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) < r)
                {
                    var t = map.At(x, y);
                    t.Terrain = "water";
                    t.Passable = false;
                }
            }
        }

        // ---- mountains and rocks
        for (var i = 0; i < 40; i++)
        {
            var cx = rng.Next(2, width - 2);
            var cy = rng.Next(2, height - 2);
            var r = rng.Next(1, 3);
            for (var y = cy - r; y <= cy + r; y++)
            for (var x = cx - r; x <= cx + r; x++)
            {
                if (!map.InBounds(x, y)) continue;
                if (Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) >= r) continue;
                if (rng.NextDouble() > 0.7) continue;
                var t = map.At(x, y);
                if (t.Terrain == "water") continue;
                t.ObjectKind = rng.Next(2) == 0 ? "mountain" : "rock";
                t.Passable = false;
            }
        }

        // ---- forests
        for (var i = 0; i < 260; i++)
        {
            var x = rng.Next(width);
            var y = rng.Next(height);
            var t = map.At(x, y);
            if (t.ObjectKind != null || !t.Passable) continue;
            if (t.Terrain is "sand" or "snow") continue;
            t.ObjectKind = "tree";
            t.Passable = false;
        }

        // ---- player start positions (corners, then edges)
        var corners = new (int x, int y)[]
        {
            (8, 8), (width - 9, 8), (8, height - 9), (width - 9, height - 9),
            (width / 2, 8), (width / 2, height - 9), (8, height / 2), (width - 9, height / 2),
            (width / 3, height / 3), (width * 2 / 3, height * 2 / 3)
        };

        var starts = new List<(int x, int y)>();
        for (var i = 0; i < playerCount && i < corners.Length; i++)
        {
            var (sx, sy) = corners[i];
            for (var y = sy - 4; y <= sy + 4; y++)
            for (var x = sx - 4; x <= sx + 4; x++)
            {
                if (!map.InBounds(x, y)) continue;
                var t = map.At(x, y);
                t.ObjectKind = null;
                t.Passable = true;
                if (t.Terrain == "water") t.Terrain = "grass";
            }
            starts.Add((sx, sy));
        }

        // ---- carve paths between starts so the map is connected
        for (var i = 1; i < starts.Count; i++)
            CarvePath(map, starts[i - 1], starts[i], rng);
        for (var i = 0; i < 12; i++)
        {
            var a = (rng.Next(2, width - 2), rng.Next(2, height - 2));
            var b = (rng.Next(2, width - 2), rng.Next(2, height - 2));
            CarvePath(map, a, b, rng);
        }

        // ---- place objects on free tiles (keep the ground around each town and hero clear)
        var free = new List<(int x, int y)>();
        for (var y = 0; y < height; y++)
        for (var x = 0; x < width; x++)
        {
            var t = map.At(x, y);
            if (!t.Passable || t.ObjectKind != null) continue;
            if (starts.Any(s => Math.Max(Math.Abs(s.x - x), Math.Abs(s.y - y)) <= 2)) continue;
            free.Add((x, y));
        }
        Shuffle(free, rng);
        var fi = 0;
        // approach tiles in front of mine entrances stay clear of other objects
        var reserved = new HashSet<(int x, int y)>();
        bool Open((int x, int y) p) => map.At(p.x, p.y) is { Passable: true, ObjectKind: null } && !reserved.Contains(p);
        (int x, int y) Take()
        {
            for (var n = 0; n < free.Count; n++)
            {
                var p = free[fi++ % free.Count];
                if (Open(p)) return p;
            }
            return free[fi++ % free.Count];
        }
        bool NearStart(int x, int y) => starts.Any(s => Math.Max(Math.Abs(s.x - x), Math.Abs(s.y - y)) <= 3);

        // mines: multi-tile buildings entered from the tile below their entrance
        for (var i = 0; i < 28; i++)
        {
            var type = MineTypes[i % MineTypes.Length];
            var (x, y) = Take();
            for (var n = 0; n < free.Count; n++)
            {
                var (cx, cy) = (x, y);
                if (Footprint.Fits(map, cx, cy, "mine", type) && !NearStart(cx, cy + 1)
                    && Footprint.Offsets("mine", type).All(o => !NearStart(cx + o.dx, cy + o.dy) && !reserved.Contains((cx + o.dx, cy + o.dy))))
                    break;
                (x, y) = Take();
            }
            var t = map.At(x, y);
            t.ObjectKind = "mine";
            t.ObjectData = type;
            t.Owner = 0; // bitmask: no city works this mine yet
            t.Passable = false;
            Footprint.Stamp(map, x, y, "mine", type);
            reserved.Add((x, y + 1));
        }

        // resource piles
        for (var i = 0; i < 60; i++)
        {
            var (x, y) = Take();
            var t = map.At(x, y);
            var type = MineTypes[rng.Next(MineTypes.Length)];
            var amount = type == "gold" ? rng.Next(500, 1500) : rng.Next(3, 8);
            t.ObjectKind = "resource";
            t.ObjectData = type + ":" + amount;
        }

        // treasure chests
        for (var i = 0; i < 20; i++)
        {
            var (x, y) = Take();
            var t = map.At(x, y);
            t.ObjectKind = "treasure";
            t.ObjectData = rng.Next(1000, 3000) + ":" + rng.Next(500, 1500);
        }

        // artifacts
        for (var i = 0; i < 12; i++)
        {
            var (x, y) = Take();
            var t = map.At(x, y);
            t.ObjectKind = "artifact";
            t.ObjectData = "artifact" + i;
        }

        // shrines
        var shrineSpells = Spells.OfLevel(1).Concat(Spells.OfLevel(2)).ToArray();
        for (var i = 0; i < 8; i++)
        {
            var (x, y) = Take();
            var t = map.At(x, y);
            t.ObjectKind = "shrine";
            t.ObjectData = shrineSpells[i % shrineSpells.Length].Key;
            t.Passable = false;
        }

        // the Obelisk: one per map, visited by walking up to it
        {
            var (x, y) = Take();
            var t = map.At(x, y);
            t.ObjectKind = "obelisk";
            t.ObjectData = null;
            t.Passable = false;
        }

        // wandering monsters (impassable obstacles, no combat): "creatureKey:count"
        var wanderers = Creatures.All.Values
            .Where(c => c.UpgradeOf == null && c.Tier <= 4)
            .OrderBy(c => c.Key, StringComparer.Ordinal)
            .ToArray();
        for (var i = 0; i < 40; i++)
        {
            var (x, y) = Take();
            var t = map.At(x, y);
            var c = wanderers[rng.Next(wanderers.Length)];
            var count = Math.Max(2, rng.Next(4, 16) * (5 - c.Tier) / 2);
            t.ObjectKind = "monster";
            t.ObjectData = c.Key + ":" + count;
            t.Passable = false;
        }

        // more obelisks: one inside every start's day-one sight, and a few more to discover
        foreach (var (sx, sy) in starts) PlaceStartObelisk(map, sx, sy);
        for (var i = 0; i < 3; i++)
        {
            var (x, y) = Take();
            var t = map.At(x, y);
            if (t.ObjectKind != null || !t.Passable) continue;
            t.ObjectKind = "obelisk";
            t.ObjectData = null;
            t.Passable = false;
        }

        return map;
    }

    // Offsets from a town anchor inside its day-one sight (town radius 5), clear of its footprint and gate.
    private static readonly (int dx, int dy)[] StartObeliskOffsets =
        [(4, 1), (-4, 1), (4, 2), (-4, 2), (4, 0), (-4, 0), (3, 3), (-3, 3), (4, -1), (-4, -1), (2, 4), (-2, 4)];

    /// <summary>Places an obelisk visible from the town at (sx, sy) on day one; returns null when no spot fits.</summary>
    public static (int x, int y)? PlaceStartObelisk(AdventureMap map, int sx, int sy, ICollection<(int x, int y)>? occupied = null)
    {
        var footprint = Footprint.Offsets("town", null).Append((0, 0)).Append((0, 1)).ToHashSet();
        bool Blocked(int x, int y) => footprint.Contains((x - sx, y - sy)) || occupied?.Contains((x, y)) == true;
        foreach (var (dx, dy) in StartObeliskOffsets)
        {
            var (x, y) = (sx + dx, sy + dy);
            if (!map.InBounds(x, y) || Blocked(x, y)) continue;
            var t = map.At(x, y);
            if (!t.Passable || t.ObjectKind != null) continue;
            var approachable = false;
            for (var ny = y - 1; ny <= y + 1 && !approachable; ny++)
            for (var nx = x - 1; nx <= x + 1 && !approachable; nx++)
                approachable = (nx, ny) != (x, y) && map.InBounds(nx, ny) && !Blocked(nx, ny)
                    && map.At(nx, ny) is { Passable: true, ObjectKind: null };
            if (!approachable) continue;
            t.ObjectKind = "obelisk";
            t.ObjectData = null;
            t.Passable = false;
            return (x, y);
        }
        return null;
    }

    private static void CarvePath(AdventureMap map, (int x, int y) a, (int x, int y) b, Random rng)
    {
        var (x, y) = a;
        var guard = 0;
        while ((x != b.x || y != b.y) && guard++ < 2000)
        {
            var t = map.At(x, y);
            t.ObjectKind = null;
            t.Passable = true;
            if (t.Terrain == "water") t.Terrain = "dirt";
            if (x != b.x && (y == b.y || rng.Next(2) == 0)) x += Math.Sign(b.x - x);
            else y += Math.Sign(b.y - y);
        }
    }

    private static void Shuffle<T>(IList<T> list, Random rng)
    {
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
    }

    // ---- value noise
    private static double Hash(int x, int y, int seed)
    {
        unchecked
        {
            var h = x * 374761393 + y * 668265263 + seed * 1274126177;
            h = (h ^ (h >> 13)) * 1274126177;
            h ^= h >> 16;
            return (h & 0x7fffffff) / (double)0x7fffffff;
        }
    }

    private static double ValueNoise(double x, double y, int seed)
    {
        var xi = (int)Math.Floor(x);
        var yi = (int)Math.Floor(y);
        var xf = x - xi;
        var yf = y - yi;
        var u = xf * xf * (3 - 2 * xf);
        var v = yf * yf * (3 - 2 * yf);
        var a = Hash(xi, yi, seed);
        var b = Hash(xi + 1, yi, seed);
        var c = Hash(xi, yi + 1, seed);
        var d = Hash(xi + 1, yi + 1, seed);
        return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }

    private static double Fbm(double x, double y, int seed, int octaves)
    {
        var sum = 0.0;
        var amp = 0.5;
        var freq = 1.0;
        for (var i = 0; i < octaves; i++)
        {
            sum += ValueNoise(x * freq, y * freq, seed + i * 17) * amp;
            amp *= 0.5;
            freq *= 2;
        }
        return sum;
    }
}

/// <summary>A* pathfinding over the adventure map.</summary>
public static class Pathfinder
{
    public static bool Pinches(MapTile t) => !t.Passable || !Terrain.Passable(t.Terrain)
        || t.ObjectKind is "town" or "mine" or "monster" or "obelisk" or "shrine" or "block" or "tree" or "rock" or "mountain";

    public static List<(int x, int y)>? FindPath(AdventureMap map, int sx, int sy, int tx, int ty, int pathfinding = 0, string? nativeTerrain = null)
    {
        if (!map.InBounds(sx, sy) || !map.InBounds(tx, ty)) return null;

        var w = map.Width;
        var h = map.Height;
        var start = sy * w + sx;
        var goal = ty * w + tx;

        var gScore = new double[w * h];
        var came = new int[w * h];
        var closed = new bool[w * h];
        Array.Fill(gScore, double.PositiveInfinity);
        Array.Fill(came, -1);
        gScore[start] = 0;

        var open = new List<(int i, double f)> { (start, Heuristic(sx, sy, tx, ty)) };
        var dirs = new (int dx, int dy)[]
        {
            (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)
        };

        var iter = 0;
        while (open.Count > 0 && iter++ < 40000)
        {
            var bi = 0;
            for (var i = 1; i < open.Count; i++) if (open[i].f < open[bi].f) bi = i;
            var cur = open[bi];
            open.RemoveAt(bi);

            if (cur.i == goal)
            {
                var path = new List<(int x, int y)>();
                var c = goal;
                while (c != -1)
                {
                    path.Add((c % w, c / w));
                    c = came[c];
                }
                path.Reverse();
                return path;
            }

            if (closed[cur.i]) continue;
            closed[cur.i] = true;

            var cx = cur.i % w;
            var cy = cur.i / w;

            foreach (var (dx, dy) in dirs)
            {
                var nx = cx + dx;
                var ny = cy + dy;
                if (!map.InBounds(nx, ny)) continue;
                var ni = ny * w + nx;
                if (closed[ni]) continue;

                var t = map.At(nx, ny);
                var isGoal = ni == goal;
                if (!t.Passable && (!isGoal || t.ObjectKind is not ("town" or "mine" or "monster" or "obelisk" or "shrine"))) continue;

                // Solid footprints block diagonal movement just like terrain.
                if (dx != 0 && dy != 0)
                {
                    if (Pinches(map.At(cx + dx, cy)) || Pinches(map.At(cx, cy + dy))) continue;
                }

                var cost = Terrain.MoveCost(map.At(cx, cy).Terrain, pathfinding, nativeTerrain, dx != 0 && dy != 0) / 100.0;
                var ng = gScore[cur.i] + cost;
                if (ng < gScore[ni])
                {
                    gScore[ni] = ng;
                    came[ni] = cur.i;
                    open.Add((ni, ng + Heuristic(nx, ny, tx, ty)));
                }
            }
        }
        return null;
    }

    private static double Heuristic(int x, int y, int tx, int ty) =>
        Math.Max(Math.Abs(x - tx), Math.Abs(y - ty));
}