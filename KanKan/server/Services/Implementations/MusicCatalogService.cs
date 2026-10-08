using System.Text.Json;
using KanKan.API.Options;
using KanKan.API.Services.Interfaces;
using Microsoft.Extensions.Options;

namespace KanKan.API.Services.Implementations;

public sealed class MusicCatalogService(
    IOptions<MusicOptions> options,
    ILogger<MusicCatalogService> logger) : IMusicCatalogService
{
    private readonly MusicOptions _options = options.Value;
    private readonly SemaphoreSlim _loadLock = new(1, 1);
    private CatalogSnapshot? _snapshot;

    public async Task ReplaceCatalogAsync(
        byte[] utf8Json,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(utf8Json);
        var rootPath = ResolveRootPath();
        await _loadLock.WaitAsync(cancellationToken);
        try
        {
            JsonElement document;
            try
            {
                using var parsed = JsonDocument.Parse(utf8Json);
                document = parsed.RootElement.Clone();
            }
            catch (JsonException exception)
            {
                throw new MusicCatalogUnavailableException(
                    "The generated music catalog is invalid.",
                    exception);
            }

            cancellationToken.ThrowIfCancellationRequested();
            var targets = BuildPlaybackIndex(document, rootPath);
            _snapshot = new CatalogSnapshot(document, targets);
            logger.LogInformation(
                "Published {RecordCount} schema-driven music records in memory.",
                targets.Count);
        }
        finally
        {
            _loadLock.Release();
        }
    }

    public Task<JsonElement> GetCatalogAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(CurrentSnapshot().Document);
    }

    public Task<MusicPlaybackTarget?> GetPlaybackTargetAsync(
        string recordId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var snapshot = CurrentSnapshot();
        if (!snapshot.Targets.TryGetValue(recordId, out var target))
        {
            return Task.FromResult<MusicPlaybackTarget?>(null);
        }

        if (!File.Exists(target.AbsolutePath))
        {
            logger.LogWarning(
                "Music record {RecordId} points to missing file {FileName}",
                recordId,
                target.FileName);
            return Task.FromResult<MusicPlaybackTarget?>(null);
        }

        return Task.FromResult<MusicPlaybackTarget?>(target);
    }

    private CatalogSnapshot CurrentSnapshot() =>
        _snapshot ?? throw new MusicCatalogUnavailableException(
            "The music catalog has not been generated.");

    private static IReadOnlyDictionary<string, MusicPlaybackTarget> BuildPlaybackIndex(
        JsonElement document,
        string rootPath)
    {
        if (document.ValueKind != JsonValueKind.Object
            || !document.TryGetProperty("records", out var records)
            || records.ValueKind != JsonValueKind.Array)
        {
            throw new MusicCatalogUnavailableException(
                "Music catalog must contain a records array.");
        }

        var targets = new Dictionary<string, MusicPlaybackTarget>(StringComparer.Ordinal);
        foreach (var record in records.EnumerateArray())
        {
            var id = RequiredString(record, "id");
            if (!record.TryGetProperty("playback", out var playback)
                || playback.ValueKind != JsonValueKind.Object)
            {
                throw new MusicCatalogUnavailableException(
                    $"Music record '{id}' is missing its playback object.");
            }

            var relativePath = RequiredString(playback, "relativeAudioPath");
            var startSeconds = OptionalDouble(playback, "startSeconds") ?? 0;
            var endSeconds = OptionalDouble(playback, "endSeconds");
            if (startSeconds < 0 || endSeconds is not null && endSeconds <= startSeconds)
            {
                throw new MusicCatalogUnavailableException(
                    $"Music record '{id}' has an invalid playback range.");
            }

            var absolutePath = ResolveAudioPath(rootPath, relativePath);
            if (!targets.TryAdd(
                id,
                new MusicPlaybackTarget(
                    id,
                    absolutePath,
                    Path.GetFileName(absolutePath),
                    ContentTypeFor(absolutePath),
                    startSeconds,
                    endSeconds)))
            {
                throw new MusicCatalogUnavailableException(
                    $"Music catalog contains duplicate record ID '{id}'.");
            }
        }

        return targets;
    }

    private string ResolveRootPath()
    {
        if (string.IsNullOrWhiteSpace(_options.RootPath))
        {
            throw new MusicCatalogUnavailableException(
                "Music:RootPath is not configured.");
        }

        try
        {
            return Path.GetFullPath(_options.RootPath);
        }
        catch (Exception exception) when (
            exception is ArgumentException or NotSupportedException or PathTooLongException)
        {
            throw new MusicCatalogUnavailableException(
                "Music:RootPath is invalid.",
                exception);
        }
    }

    private static string ResolveAudioPath(string rootPath, string relativePath)
    {
        var normalizedRelativePath = relativePath
            .Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar);
        var absolutePath = Path.GetFullPath(Path.Combine(rootPath, normalizedRelativePath));
        var rootPrefix = rootPath.TrimEnd(Path.DirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        if (!absolutePath.StartsWith(rootPrefix, comparison))
        {
            throw new MusicCatalogUnavailableException(
                $"Music path escapes the configured root: {relativePath}");
        }

        return absolutePath;
    }

    private static string RequiredString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property)
            || property.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(property.GetString()))
        {
            throw new MusicCatalogUnavailableException(
                $"Music catalog property '{propertyName}' is required.");
        }

        return property.GetString()!;
    }

    private static double? OptionalDouble(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property)
            || property.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        if (property.ValueKind != JsonValueKind.Number
            || !property.TryGetDouble(out var value)
            || !double.IsFinite(value))
        {
            throw new MusicCatalogUnavailableException(
                $"Music catalog property '{propertyName}' must be a finite number.");
        }

        return value;
    }

    private static string ContentTypeFor(string path) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".flac" => "audio/flac",
            ".mp3" => "audio/mpeg",
            ".m4a" => "audio/mp4",
            ".aac" => "audio/aac",
            ".ogg" => "audio/ogg",
            ".opus" => "audio/ogg",
            ".wav" => "audio/wav",
            _ => "application/octet-stream"
        };

    private sealed record CatalogSnapshot(
        JsonElement Document,
        IReadOnlyDictionary<string, MusicPlaybackTarget> Targets);
}
