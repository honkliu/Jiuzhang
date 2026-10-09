using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace KanKan.API.Services.Implementations;

internal static partial class MusicCatalogMetadata
{
    public const string TitleOverridesFileName = "MusicTitleOverrides.json";

    private static readonly HashSet<string> TrackListExtensions = new(
        [".txt", ".nfo"],
        StringComparer.OrdinalIgnoreCase);

    private static readonly (string Label, string[] Keywords)[] TagRules =
    [
        ("低音提琴", ["低音提琴", "倍大提琴", "double bass", "contrabass"]),
        ("大提琴", ["大提琴", "cello", "celli"]),
        ("中提琴", ["中提琴", "viola"]),
        ("小提琴", ["小提琴", "violin"]),
        ("二胡", ["二胡", "erhu"]),
        ("高胡", ["高胡"]),
        ("胡琴", ["胡琴"]),
        ("古琴", ["古琴", "guqin"]),
        ("古筝", ["古筝", "guzheng", "zheng"]),
        ("琵琶", ["琵琶", "pipa"]),
        ("扬琴", ["扬琴", "yangqin"]),
        ("笛子", ["笛子", "竹笛", "dizi"]),
        ("长笛", ["长笛", "flute"]),
        ("洞箫", ["洞箫", "箫曲", "xiao"]),
        ("葫芦丝", ["葫芦丝"]),
        ("唢呐", ["唢呐", "suona"]),
        ("吉他", ["吉他", "结他", "guitar"]),
        ("钢琴", ["钢琴", "piano", "pianoforte"]),
        ("管风琴", ["管风琴", "organ"]),
        ("手风琴", ["手风琴", "accordion"]),
        ("口琴", ["口琴", "harmonica"]),
        ("萨克斯", ["萨克斯", "色士风", "saxophone", "sax"]),
        ("小号", ["小号", "trumpet"]),
        ("圆号", ["圆号", "french horn"]),
        ("巴松管", ["巴松", "bassoon"]),
        ("单簧管", ["单簧管", "clarinet"]),
        ("双簧管", ["双簧管", "oboe"]),
        ("竖琴", ["竖琴", "harp"]),
        ("鼓乐", ["鼓乐", "战鼓", "鼓曲", "drum", "percussion"]),
        ("铜管乐", ["铜管", "brass"]),
        ("弦乐", ["弦乐", "strings", "string quartet"]),
        ("交响乐", ["交响", "symphony", "symphonic"]),
        ("管弦乐", ["管弦乐", "orchestra", "orchestral"]),
        ("协奏曲", ["协奏曲", "concerto"]),
        ("奏鸣曲", ["奏鸣曲", "sonata"]),
        ("室内乐", ["室内乐", "chamber music"]),
        ("民乐", ["民乐", "民族音乐", "chinese instrumental"]),
        ("民歌", ["民歌", "folk song"]),
        ("爵士", ["爵士", "jazz"]),
        ("歌剧", ["歌剧", "opera"]),
        ("粤剧", ["粤剧"]),
        ("京剧", ["京剧"]),
        ("戏曲", ["戏曲", "曲艺"]),
        ("合唱", ["合唱", "choir", "choral", "chorus"]),
        ("女声", ["女声", "女高音", "女中音", "soprano", "mezzo"]),
        ("男声", ["男声", "男高音", "男中音", "tenor", "baritone", "bass vocal"]),
        ("童声", ["童声", "children's choir", "children choir"]),
        ("人声", ["人声", "vocal", "vocals"]),
        ("电影原声", ["电影原声", "影视原声", "soundtrack", "ost"]),
        ("舞曲", ["舞曲", "dance music"]),
        ("轻音乐", ["轻音乐", "easy listening"])
    ];

    private static readonly Regex[] GenericTitlePatterns =
    [
        new("^\\d+$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new("^(?:track|音轨|cd\\s*音轨)\\s*0*\\d+$",
            RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new("^(?:cdimage|unknown title)(?:\\s*\\d+)?$",
            RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(".*\\.(?:ape|wav|flac)[._ -]*\\d+$",
            RegexOptions.IgnoreCase | RegexOptions.Compiled)
    ];

    private static readonly Regex LeadingTrackPattern = new(
        "^\\s*(?:\\d{1,3}[\\s._-]+|CD\\s*音轨\\s*\\d+[\\s._-]*)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex[] TrackListPatterns =
    [
        new("^\\s*\\[(\\d{1,3})\\]\\s+(.+?)\\s*$", RegexOptions.Compiled),
        new("^\\s*(\\d{1,3})\\s*(?=[《【「『])(.+?)\\s*$", RegexOptions.Compiled),
        new("^\\s*(\\d{1,3})\\s*[.．、):：\\]-]\\s*(.+?)\\s*$", RegexOptions.Compiled),
        new("^\\s*(\\d{1,3})\\s{2,}(.+?)\\s*$", RegexOptions.Compiled)
    ];

    public static bool IsGenericTitle(string value)
    {
        var title = Clean(value);
        return title.Length == 0 || GenericTitlePatterns.Any(pattern => pattern.IsMatch(title));
    }

    public static (string Title, string Performer) StandaloneMetadata(string path)
    {
        var stem = LeadingTrackPattern.Replace(Path.GetFileNameWithoutExtension(path), string.Empty)
            .Trim(' ', '.', '_', '-');
        var separator = stem.LastIndexOf('_');
        if (separator > 0 && separator < stem.Length - 1)
        {
            var title = stem[..separator].Trim();
            var performer = stem[(separator + 1)..].Trim();
            if (title.Length > 0 && performer.Length > 0)
            {
                return (title, performer);
            }
        }

        return (stem.Length > 0 ? stem : Path.GetFileNameWithoutExtension(path), string.Empty);
    }

    public static int? ExtractTrackNumber(string value)
    {
        var stem = Path.GetFileNameWithoutExtension(value);
        var patterns = new[]
        {
            "^(?:track|音轨|cd\\s*音轨)?\\s*0*(\\d{1,3})(?:\\D|$)",
            "\\.(?:ape|wav|flac)[._ -]*0*(\\d{1,3})$",
            "[._ -]0*(\\d{1,3})$"
        };
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(stem, pattern, RegexOptions.IgnoreCase);
            if (match.Success
                && int.TryParse(
                    match.Groups[1].Value,
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out var number))
            {
                return number;
            }
        }

        return null;
    }

    public static IReadOnlyDictionary<int, string> FindTrackList(
        string directory,
        int expectedCount,
        string hint,
        int groupsInDirectory)
    {
        var hintDisc = DiscNumber(hint);
        var minimumCoverage = Math.Max(2, (expectedCount * 7 + 9) / 10);
        Dictionary<int, string>? best = null;
        (int ExactCount, int Coverage, int PreferredName) bestScore = default;
        foreach (var path in Directory.EnumerateFiles(directory)
                     .Where(path => TrackListExtensions.Contains(Path.GetExtension(path))))
        {
            var textDisc = DiscNumber(Path.GetFileName(path));
            if (groupsInDirectory > 1
                && (hintDisc is null || textDisc != hintDisc))
            {
                continue;
            }

            var tracks = ParseTrackList(path)
                .Where(pair => pair.Key <= expectedCount)
                .ToDictionary();
            if (tracks.Count < minimumCoverage)
            {
                continue;
            }

            var score = (
                tracks.Count == expectedCount ? 1 : 0,
                tracks.Count,
                Regex.IsMatch(
                    Path.GetFileName(path),
                    "曲目|track|list|readme",
                    RegexOptions.IgnoreCase) ? 1 : 0);
            if (best is null || score.CompareTo(bestScore) > 0)
            {
                best = tracks;
                bestScore = score;
            }
        }

        return best ?? new Dictionary<int, string>();
    }

    public static IReadOnlyList<string> OverrideTitles(
        JsonElement? titleOverrides,
        string directoryName,
        string? cueName,
        bool standalone,
        int selectedCueCount,
        int expectedCount)
    {
        if (!titleOverrides.HasValue
            || !titleOverrides.Value.TryGetProperty(directoryName, out var directory)
            || directory.ValueKind != JsonValueKind.Object)
        {
            return [];
        }

        JsonElement titles = default;
        if (standalone
            && directory.TryGetProperty("standalone", out var standaloneTitles))
        {
            titles = standaloneTitles;
        }
        else if (!standalone
            && cueName is not null
            && directory.TryGetProperty("cues", out var cues)
            && cues.ValueKind == JsonValueKind.Object
            && cues.TryGetProperty(cueName, out var cueTitles))
        {
            titles = cueTitles;
        }
        else if ((standalone || selectedCueCount == 1)
            && directory.TryGetProperty("tracks", out var trackTitles))
        {
            titles = trackTitles;
        }

        if (titles.ValueKind != JsonValueKind.Array
            || titles.GetArrayLength() != expectedCount)
        {
            return [];
        }

        return titles.EnumerateArray()
            .Select(item => item.ValueKind == JsonValueKind.String
                ? Clean(item.GetString() ?? string.Empty)
                : string.Empty)
            .ToArray();
    }

    public static string[] BuildTags(params string[] sources)
    {
        var tags = new List<string>();
        foreach (var source in sources)
        {
            var normalized = source.Normalize(NormalizationForm.FormKC);
            foreach (var (label, keywords) in TagRules)
            {
                if (tags.Contains(label, StringComparer.Ordinal))
                {
                    continue;
                }

                if (keywords.Any(keyword => normalized.Contains(
                    keyword,
                    StringComparison.CurrentCultureIgnoreCase)))
                {
                    tags.Add(label);
                }
            }
        }

        return tags.ToArray();
    }

    public static bool ContainsBadText(string value) =>
        value.Any(character =>
            character == '\uFFFD' || character is >= '\uE000' and <= '\uF8FF');

    public static int TextQuality(params string[] values)
    {
        var text = string.Concat(values);
        if (text.Length == 0)
        {
            return 0;
        }

        var bad = text.Count(character =>
            character == '\uFFFD' || character is >= '\uE000' and <= '\uF8FF');
        var controls = text.Count(char.IsControl);
        return Math.Max(0, text.Length - bad * 30 - controls * 10);
    }

    private static Dictionary<int, string> ParseTrackList(string path)
    {
        var tracks = new Dictionary<int, string>();
        foreach (var line in DecodeText(path).Split('\n'))
        {
            foreach (var pattern in TrackListPatterns)
            {
                var match = pattern.Match(line);
                if (!match.Success)
                {
                    continue;
                }

                if (int.TryParse(
                        match.Groups[1].Value,
                        NumberStyles.None,
                        CultureInfo.InvariantCulture,
                        out var number))
                {
                    var title = CleanTrackListTitle(match.Groups[2].Value);
                    if (number >= 1
                        && title.Length is > 0 and <= 180
                        && !IsGenericTitle(title)
                        && !Regex.IsMatch(title, "https?://|www\\.", RegexOptions.IgnoreCase))
                    {
                        tracks.TryAdd(number, title);
                    }
                }
                break;
            }
        }

        return tracks;
    }

    private static string CleanTrackListTitle(string value)
    {
        var title = Clean(value);
        title = Regex.Replace(
            title,
            "\\s*\\[\\s*\\d+:\\d+(?::\\d+)?(?:\\.\\d+)?\\s*\\]\\s*$",
            string.Empty);
        title = Regex.Replace(title, "\\s+\\d+:\\d+(?::\\d+)?\\s*$", string.Empty);
        title = Regex.Split(title, "[/／]\\s*选自", RegexOptions.IgnoreCase)[0].Trim();
        return Regex.Replace(title, "\\s{2,}", " ").Trim(' ', '-', '–', '—', '\t');
    }

    private static int? DiscNumber(string value)
    {
        var match = Regex.Match(
            value.Normalize(NormalizationForm.FormKC),
            "\\bCD\\s*0*(\\d+)\\b",
            RegexOptions.IgnoreCase);
        return match.Success
            && int.TryParse(match.Groups[1].Value, out var number)
                ? number
                : null;
    }

    private static string DecodeText(string path)
    {
        var data = File.ReadAllBytes(path);
        foreach (var encoding in new[]
        {
            new UTF8Encoding(false, true),
            new UnicodeEncoding(false, true, true),
            Encoding.GetEncoding(
                "GB18030",
                EncoderFallback.ExceptionFallback,
                DecoderFallback.ExceptionFallback)
        })
        {
            try
            {
                return encoding.GetString(data).TrimStart('\uFEFF');
            }
            catch (DecoderFallbackException)
            {
                // Try the next supported encoding.
            }
        }

        return Encoding.UTF8.GetString(data);
    }

    public static JsonElement? LoadTitleOverrides(string rootPath)
    {
        var path = Path.Combine(rootPath, TitleOverridesFileName);
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            using var stream = File.OpenRead(path);
            using var document = JsonDocument.Parse(stream);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                throw new JsonException("The root value must be a JSON object.");
            }

            return document.RootElement.Clone();
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException(
                $"Music title overrides are invalid: {path}",
                exception);
        }
    }

    private static string Clean(string value) =>
        string.Join(' ', value.Replace("\0", string.Empty).Split(
            (char[]?)null,
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
}
