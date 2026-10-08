using KanKan.API.Options;
using KanKan.API.Services.Interfaces;
using Microsoft.Extensions.Options;

namespace KanKan.API.Services.Implementations;

public sealed class MusicCatalogInitializationService(
    IMusicCatalogGenerator generator,
    IMusicCatalogService catalogService,
    IOptions<MusicOptions> options,
    ILogger<MusicCatalogInitializationService> logger) : IHostedService
{
    private readonly MusicOptions _options = options.Value;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.RootPath))
        {
            logger.LogWarning(
                "Music catalog generation is unavailable because Music:RootPath is empty.");
            return;
        }

        var rootPath = Path.GetFullPath(_options.RootPath);
        if (!Directory.Exists(rootPath))
        {
            logger.LogError(
                "Music catalog generation is unavailable because {RootPath} does not exist.",
                rootPath);
            return;
        }

        logger.LogInformation("Scanning the complete music directory {RootPath}.", rootPath);
        var result = await generator.GenerateAsync(rootPath, cancellationToken);
        await catalogService.ReplaceCatalogAsync(result.Utf8Json, cancellationToken);

        logger.LogInformation(
            "Loaded {RecordCount} generated music records ({CueTrackCount} CUE, "
            + "{StandaloneTrackCount} standalone) into memory.",
            result.RecordCount,
            result.CueTrackCount,
            result.StandaloneTrackCount);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
