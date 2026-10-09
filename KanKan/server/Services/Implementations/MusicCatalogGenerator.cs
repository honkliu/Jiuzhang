using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using KanKan.API.Services.Interfaces;

namespace KanKan.API.Services.Implementations;

public sealed class MusicCatalogGenerator(
    ILogger<MusicCatalogGenerator> logger) : IMusicCatalogGenerator
{
    private static readonly HashSet<string> AudioExtensions = new(
        [".flac", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".wma"],
        StringComparer.OrdinalIgnoreCase);

    private static readonly Regex FilePattern = new(
        "^\\s*FILE\\s+(?:\"([^\"]+)\"|(\\S+))\\s+\\S+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex TrackPattern = new(
        "^\\s*TRACK\\s+(\\d+)\\s+AUDIO\\s*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex TitlePattern = new(
        "^\\s*TITLE\\s+\"(.*)\"\\s*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex PerformerPattern = new(
        "^\\s*PERFORMER\\s+\"(.*)\"\\s*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex IndexPattern = new(
        "^\\s*INDEX\\s+01\\s+(\\d+:\\d+:\\d+)\\s*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex LeadingFileTrackNumberPattern = new(
        "^(?:track\\s*)?0*(\\d{1,3})(?:\\D|$)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly EnumerationOptions EnumerationOptions = new()
    {
        RecurseSubdirectories = true,
        IgnoreInaccessible = true,
        AttributesToSkip = FileAttributes.Hidden | FileAttributes.System | FileAttributes.ReparsePoint
    };

    public Task<MusicCatalogGenerationResult> GenerateAsync(
        string rootPath,
        CancellationToken cancellationToken) =>
        Task.Run(() => Generate(rootPath, cancellationToken), cancellationToken);

    public static bool IsAudioOrCuePath(string path)
    {
        var extension = Path.GetExtension(path);
        return AudioExtensions.Contains(extension)
            || extension.Equals(".cue", StringComparison.OrdinalIgnoreCase);
    }

    private MusicCatalogGenerationResult Generate(
        string configuredRootPath,
        CancellationToken cancellationToken)
    {
        var rootPath = Path.GetFullPath(configuredRootPath);
        if (!Directory.Exists(rootPath))
        {
            throw new DirectoryNotFoundException(
                $"The configured music root does not exist: {rootPath}");
        }

        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        var allFiles = Directory.EnumerateFiles(rootPath, "*", EnumerationOptions)
            .Where(IsAudioOrCuePath)
            .OrderBy(path => path, PathComparer)
            .ToArray();
        var audioFiles = allFiles
            .Where(path => AudioExtensions.Contains(Path.GetExtension(path)))
            .ToArray();
        var cueFiles = allFiles
            .Where(path => Path.GetExtension(path).Equals(".cue", StringComparison.OrdinalIgnoreCase))
            .ToArray();
        var audioMetadata = new Dictionary<string, AudioMetadata>(PathComparer);
        var referencedAudio = new HashSet<string>(PathComparer);
        var records = new List<CatalogRecord>();
        var cueTrackCount = 0;
        var parsedCues = new List<CueSheet>();
        foreach (var cuePath in cueFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var cue = ParseCue(cuePath);
            if (cue.Tracks.Count == 0)
            {
                logger.LogWarning("CUE file contains no readable audio tracks: {CuePath}", cuePath);
                continue;
            }

            ResolveCueFiles(cue);
            RepairSplitTrackAssignments(cue);
            var unresolvedTrackCount = cue.Tracks.Count(track => track.ResolvedPath is null);
            if (unresolvedTrackCount > 0)
            {
                var unresolvedReferences = string.Join(
                    ", ",
                    cue.Tracks
                        .Where(track => track.ResolvedPath is null)
                        .Select(track => track.FileReference)
                        .Distinct(StringComparer.OrdinalIgnoreCase));
                logger.LogWarning(
                    "CUE file has {UnresolvedTrackCount} tracks with unresolved audio "
                    + "reference(s) {AudioReferences}: {CuePath}",
                    unresolvedTrackCount,
                    unresolvedReferences,
                    cuePath);
            }
            parsedCues.Add(cue);
        }

        var selectedCues = SelectCues(parsedCues, rootPath);
        var selectedCueCountsByDirectory = selectedCues
            .GroupBy(cue => Path.GetDirectoryName(cue.Path)!, PathComparer)
            .ToDictionary(group => group.Key, group => group.Count(), PathComparer);
        foreach (var cue in selectedCues)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (cue.Tracks.Any(track => track.ResolvedPath is null))
            {
                continue;
            }

            var directoryPath = Path.GetDirectoryName(cue.Path)!;
            var directory = Path.GetFileName(directoryPath);
            var selectedCueCount = selectedCueCountsByDirectory[directoryPath];
            var distinctTrackFiles = cue.Tracks
                .Select(track => track.ResolvedPath)
                .Where(path => path is not null)
                .ToHashSet(PathComparer);
            var perTrackFiles = distinctTrackFiles.Count == cue.Tracks.Count;
            var textTrackList = MusicCatalogMetadata.FindTrackList(
                directoryPath,
                cue.Tracks.Count,
                Path.GetFileName(cue.Path),
                selectedCueCount);
            var overrideTitles = MusicCatalogMetadata.OverrideTitles(
                directory,
                Path.GetFileName(cue.Path),
                standalone: false,
                selectedCueCount,
                cue.Tracks.Count);
            for (var index = 0; index < cue.Tracks.Count; index++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var track = cue.Tracks[index];
                var audioPath = track.ResolvedPath!;
                referencedAudio.Add(audioPath);
                var metadata = GetAudioMetadata(audioPath, audioMetadata);
                var startSeconds = ParseCueTime(track.Index);
                double? endSeconds = null;
                if (index + 1 < cue.Tracks.Count)
                {
                    var nextTrack = cue.Tracks[index + 1];
                    if (PathComparer.Equals(track.ResolvedPath, nextTrack.ResolvedPath))
                    {
                        var candidateEnd = ParseCueTime(nextTrack.Index);
                        if (candidateEnd is not null
                            && (startSeconds is null || candidateEnd > startSeconds))
                        {
                            endSeconds = candidateEnd;
                        }
                    }
                }

                var title = FirstNonEmpty(track.Title, $"Track {track.Number:D2}");
                var performer = FirstNonEmpty(track.Performer, cue.AlbumPerformer);
                if (cue.RepairedSplitAssignments)
                {
                    title = FirstNonEmpty(metadata.Title, title);
                }
                else if (MusicCatalogMetadata.IsGenericTitle(title)
                    && perTrackFiles
                    && !MusicCatalogMetadata.IsGenericTitle(metadata.Title))
                {
                    title = metadata.Title;
                }
                if (performer.Length == 0 && perTrackFiles)
                {
                    performer = metadata.Artist;
                }
                if (MusicCatalogMetadata.IsGenericTitle(title)
                    && textTrackList.TryGetValue(index + 1, out var textTitle))
                {
                    title = textTitle;
                }
                if (MusicCatalogMetadata.IsGenericTitle(title)
                    && overrideTitles.Count == cue.Tracks.Count
                    && !MusicCatalogMetadata.IsGenericTitle(overrideTitles[index]))
                {
                    title = overrideTitles[index];
                }
                if (MusicCatalogMetadata.IsGenericTitle(title))
                {
                    title = $"{directory} {track.Number:D2}";
                }

                var relativeAudioPath = RelativePath(rootPath, audioPath);
                var identity = FormattableString.Invariant(
                    $"cue:{RelativePath(rootPath, cue.Path)}:{track.Number}:{index + 1}");
                records.Add(new CatalogRecord(
                    StableId(identity),
                    title,
                    track.Number.ToString("D2", CultureInfo.InvariantCulture),
                    directory,
                    performer,
                    MusicCatalogMetadata.BuildTags(
                        directory,
                        Path.GetFileName(audioPath),
                        title,
                        performer),
                    $"{Path.GetExtension(audioPath)[1..].ToUpperInvariant()} + CUE",
                    Path.GetFileName(audioPath),
                    directory,
                    relativeAudioPath,
                    startSeconds,
                    endSeconds));
                cueTrackCount++;
            }
        }

        var standaloneTrackCount = 0;
        var standaloneGroups = audioFiles
            .Where(audioPath => !referencedAudio.Contains(audioPath))
            .GroupBy(audioPath => Path.GetDirectoryName(audioPath)!, PathComparer)
            .OrderBy(group => group.Key, PathComparer);
        foreach (var group in standaloneGroups)
        {
            var directoryPath = group.Key;
            var directory = Path.GetFileName(directoryPath);
            var standaloneFiles = group.OrderBy(path => path, PathComparer).ToArray();
            var textTrackList = MusicCatalogMetadata.FindTrackList(
                directoryPath,
                standaloneFiles.Length,
                directory,
                groupsInDirectory: 1);
            var overrideTitles = MusicCatalogMetadata.OverrideTitles(
                directory,
                cueName: null,
                standalone: true,
                selectedCueCount: 0,
                standaloneFiles.Length);
            for (var index = 0; index < standaloneFiles.Length; index++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var audioPath = standaloneFiles[index];
                var metadata = GetAudioMetadata(audioPath, audioMetadata);
                var (title, performer) = MusicCatalogMetadata.StandaloneMetadata(audioPath);
                if (MusicCatalogMetadata.IsGenericTitle(title)
                    && !MusicCatalogMetadata.IsGenericTitle(metadata.Title))
                {
                    title = metadata.Title;
                }
                if (performer.Length == 0)
                {
                    performer = metadata.Artist;
                }
                var trackNumber = MusicCatalogMetadata.ExtractTrackNumber(audioPath)
                    ?? index + 1;
                if (MusicCatalogMetadata.IsGenericTitle(title)
                    && textTrackList.TryGetValue(trackNumber, out var textTitle))
                {
                    title = textTitle;
                }
                if (MusicCatalogMetadata.IsGenericTitle(title)
                    && overrideTitles.Count == standaloneFiles.Length
                    && !MusicCatalogMetadata.IsGenericTitle(overrideTitles[index]))
                {
                    title = overrideTitles[index];
                }
                if (MusicCatalogMetadata.IsGenericTitle(title)
                    && Path.GetFileNameWithoutExtension(audioPath).Equals(
                        "CDImage",
                        StringComparison.OrdinalIgnoreCase))
                {
                    title = directory;
                }
                if (MusicCatalogMetadata.IsGenericTitle(title))
                {
                    title = $"{directory} {trackNumber:D2}";
                }

                var relativeAudioPath = RelativePath(rootPath, audioPath);
                records.Add(new CatalogRecord(
                    StableId($"file:{relativeAudioPath}"),
                    title,
                    string.Empty,
                    directory,
                    performer,
                    MusicCatalogMetadata.BuildTags(
                        directory,
                        Path.GetFileName(audioPath),
                        title,
                        performer),
                    Path.GetExtension(audioPath)[1..].ToUpperInvariant(),
                    Path.GetFileName(audioPath),
                    directory,
                    relativeAudioPath,
                    null,
                    null));
                standaloneTrackCount++;
            }
        }

        records.Sort(static (left, right) =>
        {
            var directory = StringComparer.CurrentCultureIgnoreCase.Compare(
                left.Directory,
                right.Directory);
            return directory != 0
                ? directory
                : StringComparer.OrdinalIgnoreCase.Compare(left.TrackNumber, right.TrackNumber);
        });

        var catalog = new Dictionary<string, object?>
        {
            ["schemaVersion"] = "1",
            ["generatedAt"] = DateTimeOffset.UtcNow,
            ["schema"] = new Dictionary<string, object?>
            {
                ["fields"] = BuildSchema()
            },
            ["stats"] = new Dictionary<string, int>
            {
                ["records"] = records.Count,
                ["cueTracks"] = cueTrackCount,
                ["standaloneTracks"] = standaloneTrackCount,
                ["audioFiles"] = audioFiles.Length,
                ["cueFiles"] = cueFiles.Length
            },
            ["records"] = records.Select(ToCatalogRecord).ToArray()
        };
        var json = JsonSerializer.SerializeToUtf8Bytes(
            catalog,
            new JsonSerializerOptions { WriteIndented = true });
        return new MusicCatalogGenerationResult(
            json,
            records.Count,
            cueTrackCount,
            standaloneTrackCount);
    }

    private static object ToCatalogRecord(CatalogRecord record)
    {
        var playback = new Dictionary<string, object?>
        {
            ["relativeAudioPath"] = record.RelativeAudioPath
        };
        if (record.StartSeconds is not null)
        {
            playback["startSeconds"] = record.StartSeconds;
        }

        if (record.EndSeconds is not null)
        {
            playback["endSeconds"] = record.EndSeconds;
        }

        return new Dictionary<string, object?>
        {
            ["id"] = record.Id,
            ["data"] = new Dictionary<string, object?>
            {
                ["title"] = record.Title,
                ["trackNumber"] = record.TrackNumber,
                ["album"] = record.Album,
                ["performer"] = record.Performer,
                ["tags"] = record.Tags,
                ["format"] = record.Format,
                ["source"] = record.Source,
                ["directory"] = record.Directory
            },
            ["playback"] = playback
        };
    }

    private static object[] BuildSchema() =>
    [
        Field("title", "Track", "曲名", "text", role: "title", primary: true,
            searchable: true, sortable: true, width: 280),
        Field("trackNumber", "#", "曲序", "text", role: "trackNumber",
            sortable: true, width: 72),
        Field("album", "Album", "专辑", "text", role: "album",
            searchable: true, filterable: true, sortable: true, width: 260),
        Field("performer", "Performer", "演奏者", "text",
            searchable: true, filterable: true, sortable: true, width: 180),
        Field("tags", "Categories", "分类", "tags",
            searchable: true, filterable: true, width: 220),
        Field("format", "Format", "格式", "text",
            filterable: true, sortable: true, width: 120),
        Field("source", "Source", "源文件", "text", visible: false, searchable: true),
        Field("directory", "Directory", "目录", "text",
            searchable: true, filterable: true, sortable: true, width: 280)
    ];

    private static Dictionary<string, object?> Field(
        string key,
        string englishLabel,
        string chineseLabel,
        string type,
        string? role = null,
        bool primary = false,
        bool visible = true,
        bool searchable = false,
        bool filterable = false,
        bool sortable = false,
        int? width = null)
    {
        var field = new Dictionary<string, object?>
        {
            ["key"] = key,
            ["labels"] = new Dictionary<string, string>
            {
                ["en"] = englishLabel,
                ["zh"] = chineseLabel
            },
            ["type"] = type,
            ["visible"] = visible
        };
        if (role is not null)
        {
            field["role"] = role;
        }

        if (primary)
        {
            field["primary"] = true;
        }

        if (searchable)
        {
            field["searchable"] = true;
        }

        if (filterable)
        {
            field["filterable"] = true;
        }

        if (sortable)
        {
            field["sortable"] = true;
        }

        if (width is not null)
        {
            field["width"] = width;
        }

        return field;
    }

    private static CueSheet ParseCue(string cuePath)
    {
        var cue = new CueSheet(cuePath);
        CueTrack? currentTrack = null;
        var currentFile = string.Empty;
        foreach (var line in ReadCueText(cuePath).Split('\n'))
        {
            var fileMatch = FilePattern.Match(line);
            if (fileMatch.Success)
            {
                currentFile = CleanFileReference(fileMatch.Groups[1].Success
                    ? fileMatch.Groups[1].Value
                    : fileMatch.Groups[2].Value);
                cue.DeclaredFiles.Add(currentFile);
                continue;
            }

            var trackMatch = TrackPattern.Match(line);
            if (trackMatch.Success
                && int.TryParse(trackMatch.Groups[1].Value, out var trackNumber))
            {
                currentTrack = new CueTrack(trackNumber, currentFile);
                cue.Tracks.Add(currentTrack);
                continue;
            }

            var titleMatch = TitlePattern.Match(line);
            if (titleMatch.Success)
            {
                var title = Clean(titleMatch.Groups[1].Value);
                if (currentTrack is null)
                {
                    cue.AlbumTitle = title;
                }
                else
                {
                    currentTrack.Title = title;
                }
                continue;
            }

            var performerMatch = PerformerPattern.Match(line);
            if (performerMatch.Success)
            {
                var performer = Clean(performerMatch.Groups[1].Value);
                if (currentTrack is null)
                {
                    cue.AlbumPerformer = performer;
                }
                else
                {
                    currentTrack.Performer = performer;
                }
                continue;
            }

            var indexMatch = IndexPattern.Match(line);
            if (indexMatch.Success && currentTrack is not null)
            {
                currentTrack.Index = indexMatch.Groups[1].Value;
            }
        }

        if (cue.DeclaredFiles.Count == cue.Tracks.Count
            && cue.DeclaredFiles.Distinct(StringComparer.OrdinalIgnoreCase).Count()
                == cue.Tracks.Count)
        {
            for (var index = 0; index < cue.Tracks.Count; index++)
            {
                cue.Tracks[index].FileReference = cue.DeclaredFiles[index];
            }
        }

        return cue;
    }

    private static void ResolveCueFiles(CueSheet cue)
    {
        var cueDirectory = Path.GetDirectoryName(cue.Path)!;
        var directoryFiles = Directory.EnumerateFiles(cueDirectory)
            .ToDictionary(
                path => Path.GetFileName(path)!,
                path => path,
                StringComparer.OrdinalIgnoreCase);
        foreach (var track in cue.Tracks)
        {
            if (string.IsNullOrWhiteSpace(track.FileReference))
            {
                continue;
            }

            var normalizedReference = track.FileReference
                .Replace('/', Path.DirectorySeparatorChar)
                .Replace('\\', Path.DirectorySeparatorChar);
            var candidate = Path.GetFullPath(Path.Combine(cueDirectory, normalizedReference));
            if (File.Exists(candidate) && IsCueAudioSource(candidate))
            {
                track.ResolvedPath = candidate;
                cue.ExactResolvedCount++;
                continue;
            }

            var fileName = Path.GetFileName(normalizedReference);
            if (directoryFiles.TryGetValue(fileName, out var caseInsensitiveMatch)
                && IsCueAudioSource(caseInsensitiveMatch))
            {
                track.ResolvedPath = caseInsensitiveMatch;
                cue.ExactResolvedCount++;
                continue;
            }

            var stem = Path.GetFileNameWithoutExtension(fileName);
            track.ResolvedPath = directoryFiles.Values.FirstOrDefault(path =>
                IsCueAudioSource(path)
                && Path.GetFileNameWithoutExtension(path).Equals(
                    stem,
                    StringComparison.OrdinalIgnoreCase));
        }
    }

    private static bool IsCueAudioSource(string path) =>
        AudioExtensions.Contains(Path.GetExtension(path))
        || Path.GetExtension(path).Equals(".bin", StringComparison.OrdinalIgnoreCase);

    private static void RepairSplitTrackAssignments(CueSheet cue)
    {
        var cueDirectory = Path.GetDirectoryName(cue.Path)!;
        var numberedAudio = new Dictionary<int, string>();
        foreach (var path in Directory.EnumerateFiles(cueDirectory)
                     .Where(path => AudioExtensions.Contains(Path.GetExtension(path))))
        {
            var match = LeadingFileTrackNumberPattern.Match(
                Path.GetFileNameWithoutExtension(path));
            if (!match.Success
                || !int.TryParse(
                    match.Groups[1].Value,
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out var number)
                || !numberedAudio.TryAdd(number, path))
            {
                return;
            }
        }

        if (numberedAudio.Count != cue.Tracks.Count
            || cue.Tracks.Any(track => !numberedAudio.ContainsKey(track.Number)))
        {
            return;
        }

        var currentAssignments = cue.Tracks
            .Select(track => track.ResolvedPath)
            .Where(path => path is not null)
            .ToHashSet(PathComparer);
        if (currentAssignments.Count == cue.Tracks.Count)
        {
            return;
        }

        foreach (var track in cue.Tracks)
        {
            track.ResolvedPath = numberedAudio[track.Number];
        }
        cue.RepairedSplitAssignments = true;
    }

    private static string BuildCueSignature(CueSheet cue, string rootPath) =>
        string.Join(
            "|",
            cue.Tracks.Select(track =>
                $"{track.Number}:{track.Index}:"
                + (track.ResolvedPath is null
                    ? track.FileReference
                    : RelativePath(rootPath, track.ResolvedPath))));

    private static CueSheet[] SelectCues(
        IEnumerable<CueSheet> cues,
        string rootPath) =>
        cues.GroupBy(
                cue => BuildCueSignature(cue, rootPath),
                StringComparer.Ordinal)
            .Select(group => group.MaxBy(CueScore)!)
            .OrderBy(cue => cue.Path, PathComparer)
            .ToArray();

    private static (int Resolved, int Exact, int CorrectedName, int TextQuality,
        int NonGenericName, int TrackCount) CueScore(CueSheet cue)
    {
        var unresolved = cue.Tracks.Count(track => track.ResolvedPath is null);
        var correctedName = Regex.IsMatch(
            Path.GetFileNameWithoutExtension(cue.Path),
            "(?:^|[-_.])gb(?:[-_.]|$)",
            RegexOptions.IgnoreCase);
        var stem = Path.GetFileNameWithoutExtension(cue.Path);
        var genericName = stem.Equals("play", StringComparison.OrdinalIgnoreCase)
            || stem.Equals("cdimage", StringComparison.OrdinalIgnoreCase)
            || stem.Equals("unknown title", StringComparison.OrdinalIgnoreCase);
        var textValues = cue.Tracks
            .SelectMany(track => new[] { track.Title, track.Performer })
            .Prepend(cue.AlbumPerformer)
            .Prepend(cue.AlbumTitle)
            .ToArray();
        return (
            unresolved == 0 ? 1 : 0,
            cue.ExactResolvedCount,
            correctedName ? 1 : 0,
            MusicCatalogMetadata.TextQuality(textValues),
            genericName ? 0 : 1,
            cue.Tracks.Count);
    }

    private static string ReadCueText(string path)
    {
        var bytes = File.ReadAllBytes(path);
        try
        {
            return new UTF8Encoding(
                encoderShouldEmitUTF8Identifier: false,
                throwOnInvalidBytes: true)
                .GetString(bytes)
                .TrimStart('\uFEFF');
        }
        catch (DecoderFallbackException)
        {
            // Try legacy encodings below.
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
        {
            return new UnicodeEncoding(
                bigEndian: false,
                byteOrderMark: true,
                throwOnInvalidBytes: true)
                .GetString(bytes)
                .TrimStart('\uFEFF');
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
        {
            return new UnicodeEncoding(
                bigEndian: true,
                byteOrderMark: true,
                throwOnInvalidBytes: true)
                .GetString(bytes)
                .TrimStart('\uFEFF');
        }

        return Encoding.GetEncoding(
            "GB18030",
            EncoderFallback.ExceptionFallback,
            DecoderFallback.ReplacementFallback)
            .GetString(bytes);
    }

    private static AudioMetadata GetAudioMetadata(
        string path,
        IDictionary<string, AudioMetadata> cache)
    {
        if (cache.TryGetValue(path, out var metadata))
        {
            return metadata;
        }

        metadata = Path.GetExtension(path).Equals(".flac", StringComparison.OrdinalIgnoreCase)
            ? ReadFlacMetadata(path)
            : ReadTaggedMetadata(path);
        cache[path] = metadata;
        return metadata;
    }

    private static AudioMetadata ReadTaggedMetadata(string path)
    {
        try
        {
            using var file = TagLib.File.Create(path);
            var tag = file.Tag;
            return new AudioMetadata(
                Clean(tag.Title ?? string.Empty),
                Clean(tag.Performers.FirstOrDefault()
                    ?? tag.AlbumArtists.FirstOrDefault()
                    ?? string.Empty),
                Clean(tag.Album ?? string.Empty),
                tag.Track > 0
                    ? tag.Track.ToString("D2", CultureInfo.InvariantCulture)
                    : string.Empty,
                tag.Genres
                    .Select(Clean)
                    .Where(value => value.Length > 0)
                    .Distinct(StringComparer.CurrentCultureIgnoreCase)
                    .ToArray());
        }
        catch (Exception exception) when (
            exception is IOException
                or UnauthorizedAccessException
                or TagLib.CorruptFileException
                or TagLib.UnsupportedFormatException)
        {
            return AudioMetadata.Empty;
        }
    }

    private static AudioMetadata ReadFlacMetadata(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            Span<byte> signature = stackalloc byte[4];
            if (stream.Read(signature) != signature.Length
                || !signature.SequenceEqual("fLaC"u8))
            {
                return AudioMetadata.Empty;
            }

            var comments = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            var isLast = false;
            var header = new byte[4];
            while (!isLast)
            {
                if (stream.Read(header) != header.Length)
                {
                    break;
                }

                isLast = (header[0] & 0x80) != 0;
                var blockType = header[0] & 0x7F;
                var length = header[1] << 16 | header[2] << 8 | header[3];
                if (length < 0 || length > 16 * 1024 * 1024)
                {
                    return AudioMetadata.Empty;
                }

                var block = new byte[length];
                stream.ReadExactly(block);
                if (blockType == 4)
                {
                    ParseVorbisComments(block, comments);
                }
            }

            return new AudioMetadata(
                FirstComment(comments, "TITLE"),
                FirstComment(comments, "ARTIST", "ALBUMARTIST", "PERFORMER"),
                FirstComment(comments, "ALBUM"),
                NormalizeTrackNumber(FirstComment(comments, "TRACKNUMBER")),
                AllComments(comments, "GENRE", "STYLE", "GROUPING"));
        }
        catch (Exception exception) when (
            exception is IOException
                or UnauthorizedAccessException
                or InvalidDataException
                or ArgumentException)
        {
            return AudioMetadata.Empty;
        }
    }

    private static void ParseVorbisComments(
        ReadOnlySpan<byte> block,
        IDictionary<string, List<string>> comments)
    {
        var offset = 0;
        if (!TryReadLittleEndianLength(block, ref offset, out var vendorLength)
            || !TryAdvance(block, ref offset, vendorLength)
            || !TryReadLittleEndianLength(block, ref offset, out var commentCount)
            || commentCount > 100_000)
        {
            return;
        }

        for (var index = 0; index < commentCount; index++)
        {
            if (!TryReadLittleEndianLength(block, ref offset, out var length)
                || length > 1024 * 1024
                || offset + length > block.Length)
            {
                return;
            }

            var comment = Encoding.UTF8.GetString(block.Slice(offset, length));
            offset += length;
            var separator = comment.IndexOf('=');
            if (separator <= 0)
            {
                continue;
            }

            var key = comment[..separator];
            var value = Clean(comment[(separator + 1)..]);
            if (value.Length == 0)
            {
                continue;
            }

            if (!comments.TryGetValue(key, out var values))
            {
                values = [];
                comments[key] = values;
            }
            values.Add(value);
        }
    }

    private static bool TryReadLittleEndianLength(
        ReadOnlySpan<byte> block,
        ref int offset,
        out int value)
    {
        value = 0;
        if (offset + sizeof(int) > block.Length)
        {
            return false;
        }

        var unsignedValue = BinaryPrimitives.ReadUInt32LittleEndian(
            block.Slice(offset, sizeof(int)));
        offset += sizeof(int);
        if (unsignedValue > int.MaxValue)
        {
            return false;
        }

        value = (int)unsignedValue;
        return true;
    }

    private static bool TryAdvance(ReadOnlySpan<byte> block, ref int offset, int length)
    {
        if (length < 0 || offset + length > block.Length)
        {
            return false;
        }

        offset += length;
        return true;
    }

    private static string FirstComment(
        IReadOnlyDictionary<string, List<string>> comments,
        params string[] keys)
    {
        foreach (var key in keys)
        {
            if (comments.TryGetValue(key, out var values))
            {
                var value = values.FirstOrDefault(item => item.Length > 0);
                if (value is not null)
                {
                    return value;
                }
            }
        }

        return string.Empty;
    }

    private static string[] AllComments(
        IReadOnlyDictionary<string, List<string>> comments,
        params string[] keys) =>
        keys.Where(comments.ContainsKey)
            .SelectMany(key => comments[key])
            .Distinct(StringComparer.CurrentCultureIgnoreCase)
            .OrderBy(value => value, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();

    private static string[] BuildTags(AudioMetadata metadata, string directory)
    {
        var tags = new HashSet<string>(metadata.Genres, StringComparer.CurrentCultureIgnoreCase);
        var directoryParts = directory.Split(
            '/',
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        for (var index = 0; index < directoryParts.Length - 1; index++)
        {
            tags.Add(directoryParts[index]);
        }

        return tags.OrderBy(value => value, StringComparer.CurrentCultureIgnoreCase).ToArray();
    }

    private static string NormalizeTrackNumber(string value)
    {
        var firstPart = value.Split('/', 2)[0];
        return int.TryParse(firstPart, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)
            ? number.ToString("D2", CultureInfo.InvariantCulture)
            : Clean(firstPart);
    }

    private static string AudioTitle(string path)
    {
        var title = Path.GetFileNameWithoutExtension(path);
        return Regex.Replace(title, "^\\s*\\d{1,3}[\\s._-]+", string.Empty).Trim();
    }

    private static double? ParseCueTime(string value)
    {
        var parts = value.Split(':');
        if (parts.Length != 3
            || !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var minutes)
            || !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var seconds)
            || !int.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var frames))
        {
            return null;
        }

        return minutes * 60 + seconds + frames / 75d;
    }

    private static string StableId(string identity) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..24];

    private static string RelativePath(string rootPath, string path) =>
        Path.GetRelativePath(rootPath, path).Replace(Path.DirectorySeparatorChar, '/');

    private static string FirstNonEmpty(params string[] values) =>
        values.Select(Clean).FirstOrDefault(value => value.Length > 0) ?? string.Empty;

    private static string Clean(string value) =>
        string.Join(' ', value.Replace("\0", string.Empty).Split(
            (char[]?)null,
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    private static string CleanFileReference(string value) =>
        value.Replace("\0", string.Empty).Trim();

    private static StringComparer PathComparer =>
        OperatingSystem.IsWindows()
            ? StringComparer.OrdinalIgnoreCase
            : StringComparer.Ordinal;

    private sealed class CueSheet(string path)
    {
        public string Path { get; } = path;

        public string AlbumTitle { get; set; } = string.Empty;

        public string AlbumPerformer { get; set; } = string.Empty;

        public List<CueTrack> Tracks { get; } = [];

        public List<string> DeclaredFiles { get; } = [];

        public int ExactResolvedCount { get; set; }

        public bool RepairedSplitAssignments { get; set; }
    }

    private sealed class CueTrack(int number, string fileReference)
    {
        public int Number { get; } = number;

        public string FileReference { get; set; } = fileReference;

        public string Title { get; set; } = string.Empty;

        public string Performer { get; set; } = string.Empty;

        public string Index { get; set; } = string.Empty;

        public string? ResolvedPath { get; set; }
    }

    private sealed record AudioMetadata(
        string Title,
        string Artist,
        string Album,
        string TrackNumber,
        string[] Genres)
    {
        public static AudioMetadata Empty { get; } = new(
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            []);
    }

    private sealed record CatalogRecord(
        string Id,
        string Title,
        string TrackNumber,
        string Album,
        string Performer,
        string[] Tags,
        string Format,
        string Source,
        string Directory,
        string RelativeAudioPath,
        double? StartSeconds,
        double? EndSeconds);
}
