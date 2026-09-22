namespace KanKan.API.Services;

public interface IComfyUIService
{
    Task<IDisposable> AcquireGenerationSlotAsync(CancellationToken cancellationToken = default);

    Task<string> SubmitPromptAsync(IReadOnlyList<string> imageBase64Values, string prompt, CancellationToken cancellationToken = default);

    Task<string?> TryFetchResultAsync(string promptId, CancellationToken cancellationToken = default);

    Task<string> FetchResultAsync(string promptId, CancellationToken cancellationToken = default);

    Task<string> GenerateTextToImageAsync(string prompt, CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends a workflow to ComfyUI and returns the generated image
    /// </summary>
    /// <param name="imageBase64">Base64 encoded source image</param>
    /// <param name="prompt">Generation prompt</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Base64 encoded generated image</returns>
    Task<string> GenerateImageAsync(IReadOnlyList<string> imageBase64Values, string prompt, CancellationToken cancellationToken = default);

    /// <summary>
    /// Batch generate multiple images
    /// </summary>
    Task<List<string>> GenerateImagesAsync(IReadOnlyList<string> imageBase64Values, string prompt, int count, CancellationToken cancellationToken = default);
}
