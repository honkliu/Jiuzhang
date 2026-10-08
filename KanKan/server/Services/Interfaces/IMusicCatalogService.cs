using System.Text.Json;

namespace KanKan.API.Services.Interfaces;

public interface IMusicCatalogService
{
    Task ReplaceCatalogAsync(byte[] utf8Json, CancellationToken cancellationToken);

    Task<JsonElement> GetCatalogAsync(CancellationToken cancellationToken);

    Task<MusicPlaybackTarget?> GetPlaybackTargetAsync(
        string recordId,
        CancellationToken cancellationToken);
}

public sealed record MusicPlaybackTarget(
    string RecordId,
    string AbsolutePath,
    string FileName,
    string ContentType,
    double StartSeconds,
    double? EndSeconds);

public sealed class MusicCatalogUnavailableException(string message, Exception? innerException = null)
    : Exception(message, innerException);
