namespace KanKan.API.Services.Interfaces;

public interface IMusicCatalogGenerator
{
    Task<MusicCatalogGenerationResult> GenerateAsync(
        string rootPath,
        CancellationToken cancellationToken);
}

public sealed record MusicCatalogGenerationResult(
    byte[] Utf8Json,
    int RecordCount,
    int CueTrackCount,
    int StandaloneTrackCount);
