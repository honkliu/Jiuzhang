using System.Text.Json;

namespace KanKan.API.Domain.Homm;
using KanKan.API.Domain.Homm;
using KanKan.API.Models.Entities.Homm;
using KanKan.API.Services.Homm;


public static class ObjectGeometry
{
    public sealed record Template(int X, string[] Rows);
    private sealed record Catalog(Dictionary<string, string[]> Groups, Dictionary<string, Template> Templates);
    private static readonly Catalog Data = Load();
    public static IReadOnlyDictionary<string, Template> Templates => Data.Templates;

    private static Catalog Load()
    {
        using var source = typeof(ObjectGeometry).Assembly.GetManifestResourceStream("KanKan.API.Homm.ObjectGeometry.json")!;
        return JsonSerializer.Deserialize<Catalog>(source, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    }

    // Rows run upwards from the sprite's bottom-right corner; zero bits are solid ground.
    public static IEnumerable<(int dx, int dy)> Blocked(string sprite)
    {
        var template = Data.Templates[sprite];
        for (var y = 0; y < template.Rows.Length; y++)
        for (var x = 0; x < template.Rows[y].Length; x++)
            if (template.Rows[y][x] == '0') yield return (template.X - x, -y);
    }

    public static string Building(string kind, string? data) => kind switch
    {
        "town" => "AVCcasx0",
        "mine" => data switch
        {
            "wood" => "AVMsawg0", "ore" => "AVMore0", "gems" => "AVMgems0",
            "crystal" => "AVMcrys0", "sulfur" => "AVMsulf0", "mercury" => "AVMalch0", _ => "AVMgold0"
        },
        "shrine" => "AVXl1sh0",
        "obelisk" => "AvXOblY",
        _ => ""
    };

    public static void AssignObstacle(AdventureMap map, int x, int y)
    {
        var tile = map.At(x, y);
        if (tile.ObjectKind is not ("tree" or "rock" or "mountain")) return;
        var key = tile.ObjectKind == "tree" && Data.Groups.ContainsKey($"tree.{tile.Terrain}") ? $"tree.{tile.Terrain}" : tile.ObjectKind;
        var group = Data.Groups[key];
        var salt = tile.ObjectKind == "tree" ? 3 : tile.ObjectKind == "rock" ? 4 : 5;
        var h = unchecked((uint)x * 374761393 + (uint)y * 668265263 + (uint)salt * 1274126177);
        h = unchecked((h ^ (h >> 13)) * 1274126177);
        h ^= h >> 16;
        var preferred = (int)(h / 4294967296.0 * group.Length);
        tile.Sprite = Enumerable.Range(0, group.Length).Select(i => group[(preferred + i) % group.Length])
            .First(sprite => Blocked(sprite).All(o => map.InBounds(x + o.dx, y + o.dy)
                && map.At(x + o.dx, y + o.dy).ObjectKind is "tree" or "rock" or "mountain"));
    }
}
