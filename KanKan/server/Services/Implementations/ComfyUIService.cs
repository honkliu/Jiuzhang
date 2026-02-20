using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;

namespace KanKan.API.Services.Implementations;

public class ComfyUIService : IComfyUIService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ComfyUIService> _logger;
    private readonly IConfiguration _configuration;
    private static SemaphoreSlim? _generationGate;
    private static int _gateSize;

    public ComfyUIService(
        HttpClient httpClient,
        ILogger<ComfyUIService> logger,
        IConfiguration configuration)
    {
        _httpClient = httpClient;
        _logger = logger;
        _configuration = configuration;

        var baseUrl = _configuration["ComfyUI:BaseUrl"] ?? "http://localhost:8188";
        _httpClient.BaseAddress = new Uri(baseUrl);
        var timeoutSeconds = _configuration.GetValue<int?>("ComfyUI:TimeoutSeconds") ?? 300;
        _httpClient.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
        var maxConcurrent = Math.Max(1, _configuration.GetValue<int?>("ComfyUI:MaxConcurrent") ?? 1);
        if (_generationGate == null)
        {
            _gateSize = maxConcurrent;
            _generationGate = new SemaphoreSlim(maxConcurrent, maxConcurrent);
        }
        else if (_gateSize != maxConcurrent)
        {
            _logger.LogWarning("ComfyUI MaxConcurrent changed from {Old} to {New} after initialization; using {Used}.", _gateSize, maxConcurrent, _gateSize);
        }
    }

    public async Task<string> GenerateImageAsync(string imageBase64, string prompt, CancellationToken cancellationToken = default)
    {
        using var gate = await AcquireGenerationSlotAsync(cancellationToken);
        try
        {
            var promptId = await SubmitPromptAsync(imageBase64, prompt, cancellationToken);
            return await FetchResultAsync(promptId, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate image via ComfyUI");
            throw;
        }
    }

    public async Task<IDisposable> AcquireGenerationSlotAsync(CancellationToken cancellationToken = default)
    {
        await _generationGate!.WaitAsync(cancellationToken);
        return new GenerationGateHandle(_generationGate);
    }

    public async Task<List<string>> GenerateImagesAsync(string imageBase64, string prompt, int count, CancellationToken cancellationToken = default)
    {
        var tasks = new List<Task<string>>();

        for (int i = 0; i < count; i++)
        {
            tasks.Add(GenerateImageAsync(imageBase64, prompt, cancellationToken));
        }

        var results = await Task.WhenAll(tasks);
        return results.ToList();
    }

    private sealed class GenerationGateHandle : IDisposable
    {
        private readonly SemaphoreSlim _gate;
        private int _released;

        public GenerationGateHandle(SemaphoreSlim gate)
        {
            _gate = gate;
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0)
            {
                _gate.Release();
            }
        }
    }

    public async Task<string> SubmitPromptAsync(string imageBase64, string prompt, CancellationToken cancellationToken = default)
    {
        var workflow = await BuildWorkflowAsync(imageBase64, prompt, cancellationToken);
        var response = await _httpClient.PostAsync(
            "/prompt",
            new StringContent(JsonSerializer.Serialize(workflow), Encoding.UTF8, "application/json"),
            cancellationToken);

        var result = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("ComfyUI /prompt failed with status {StatusCode}: {Body}", response.StatusCode, result);
            throw new HttpRequestException($"ComfyUI /prompt failed: {response.StatusCode}");
        }

        var jsonResult = JsonDocument.Parse(result);
        var promptId = jsonResult.RootElement.GetProperty("prompt_id").GetString();
        if (string.IsNullOrWhiteSpace(promptId))
        {
            throw new InvalidOperationException("ComfyUI did not return a prompt_id.");
        }

        return promptId;
    }

    public Task<string> FetchResultAsync(string promptId, CancellationToken cancellationToken = default)
    {
        return WaitAndFetchResultAsync(promptId, cancellationToken);
    }

    public async Task<string?> TryFetchResultAsync(string promptId, CancellationToken cancellationToken = default)
    {
        var statusResponse = await _httpClient.GetAsync($"/history/{promptId}", cancellationToken);
        if (!statusResponse.IsSuccessStatusCode)
        {
            return null;
        }

        var historyJson = await statusResponse.Content.ReadAsStringAsync(cancellationToken);
        return await TryExtractImageAsync(promptId, historyJson, cancellationToken);
    }

    private object BuildWorkflow(string imageBase64, string prompt)
    {
        // Build ComfyUI workflow JSON
        // This is a simplified version - adjust based on your actual ComfyUI workflow
        return new
        {
            prompt = new
            {
                input_image = imageBase64,
                positive_prompt = prompt,
                negative_prompt = "blurry, low quality",
                steps = 20,
                cfg = 7.0,
                seed = new Random().Next()
            }
        };
    }

    private async Task<object> BuildWorkflowAsync(string imageBase64, string prompt, CancellationToken cancellationToken)
    {
        var workflowPath = _configuration["ComfyUI:WorkflowPath"];
        if (string.IsNullOrWhiteSpace(workflowPath) || !File.Exists(workflowPath))
        {
            throw new InvalidOperationException("ComfyUI workflow file is missing. Configure ComfyUI:WorkflowPath with an API workflow JSON.");
        }

        var uploadedFileName = await UploadImageAsync(imageBase64, cancellationToken);
        var workflowJson = await File.ReadAllTextAsync(workflowPath, cancellationToken);
        var workflow = JsonNode.Parse(workflowJson)?.AsObject();
        if (workflow == null)
        {
            throw new InvalidOperationException("ComfyUI workflow JSON could not be parsed.");
        }

        var promptGraph = workflow["prompt"]?.AsObject();
        if (promptGraph == null)
        {
            if (workflow.ContainsKey("nodes"))
            {
                throw new InvalidOperationException("ComfyUI workflow must be exported in API format (Save -> API). The current file is a UI workflow.");
            }

            promptGraph = workflow;
            workflow = new JsonObject
            {
                ["prompt"] = promptGraph
            };
        }

        ApplyPromptOverrides(promptGraph, uploadedFileName, prompt);
        return workflow;
    }

    private static void ApplyPromptOverrides(JsonObject promptGraph, string uploadedFileName, string prompt)
    {
        foreach (var node in promptGraph)
        {
            if (node.Value is not JsonObject nodeObj)
            {
                continue;
            }

            var inputs = nodeObj["inputs"]?.AsObject();
            if (inputs == null)
            {
                continue;
            }

            var classType = nodeObj["class_type"]?.GetValue<string>();
            if (string.Equals(classType, "LoadImage", StringComparison.OrdinalIgnoreCase)
                && inputs.ContainsKey("image"))
            {
                inputs["image"] = uploadedFileName;
            }

            if (inputs.ContainsKey("prompt"))
            {
                inputs["prompt"] = prompt;
            }
        }
    }

    private async Task<string> UploadImageAsync(string imageBase64, CancellationToken cancellationToken)
    {
        var bytes = Convert.FromBase64String(imageBase64);
        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        form.Add(fileContent, "image", $"avatar_{Guid.NewGuid():N}.png");

        var response = await _httpClient.PostAsync("/upload/image", form, cancellationToken);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadAsStringAsync(cancellationToken);
        var json = JsonDocument.Parse(payload);
        var name = json.RootElement.GetProperty("name").GetString();
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("ComfyUI upload did not return a filename.");
        }

        return name;
    }

    private async Task<string> WaitAndFetchResultAsync(string promptId, CancellationToken cancellationToken)
    {
        // Poll ComfyUI for completion
        var pollDelaySeconds = _configuration.GetValue<int?>("ComfyUI:HistoryPollSeconds") ?? 5;
        var pollDelayMs = Math.Max(1, pollDelaySeconds) * 1000;
        var historyTimeoutSeconds = _configuration.GetValue<int?>("ComfyUI:HistoryTimeoutSeconds") ?? 300;
        var maxAttempts = Math.Max(1, (historyTimeoutSeconds * 1000) / pollDelayMs);
        var attempt = 0;
        var start = DateTime.UtcNow;

        while (attempt < maxAttempts)
        {
            try
            {
                _logger.LogInformation("ComfyUI polling {Attempt}/{Max} for {PromptId}", attempt + 1, maxAttempts, promptId);
                var statusResponse = await _httpClient.GetAsync($"/history/{promptId}", cancellationToken);

                if (statusResponse.IsSuccessStatusCode)
                {
                    var historyJson = await statusResponse.Content.ReadAsStringAsync(cancellationToken);
                    var extracted = await TryExtractImageAsync(promptId, historyJson, cancellationToken);
                    if (!string.IsNullOrWhiteSpace(extracted))
                    {
                        return extracted;
                    }
                }

                await Task.Delay(pollDelayMs, cancellationToken);
                attempt++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error polling ComfyUI status for {PromptId}", promptId);
                await Task.Delay(pollDelayMs, cancellationToken);
                attempt++;
            }
        }
        var elapsed = DateTime.UtcNow - start;
        throw new TimeoutException($"ComfyUI generation timed out for prompt {promptId} after {elapsed.TotalSeconds:F0}s");
    }

    private async Task<string?> TryExtractImageAsync(string promptId, string historyJson, CancellationToken cancellationToken)
    {
        var history = JsonDocument.Parse(historyJson);
        if (history.RootElement.TryGetProperty(promptId, out var prompt))
        {
            if (prompt.TryGetProperty("outputs", out var outputs))
            {
                var output = outputs.EnumerateObject().First().Value;
                var images = output.GetProperty("images");
                if (images.GetArrayLength() == 0)
                {
                    return null;
                }

                var image = images[0];
                if (image.TryGetProperty("image_data", out var inlineData))
                {
                    return inlineData.GetString();
                }

                if (image.TryGetProperty("filename", out var fileNameElement))
                {
                    var fileName = fileNameElement.GetString();
                    var subfolder = image.TryGetProperty("subfolder", out var subfolderElement)
                        ? subfolderElement.GetString()
                        : string.Empty;
                    var viewUrl = $"/view?filename={Uri.EscapeDataString(fileName ?? string.Empty)}";
                    if (!string.IsNullOrWhiteSpace(subfolder))
                    {
                        viewUrl += $"&subfolder={Uri.EscapeDataString(subfolder)}";
                    }

                    var imageBytes = await _httpClient.GetByteArrayAsync(viewUrl, cancellationToken);
                    return Convert.ToBase64String(imageBytes);
                }
            }
        }

        return null;
    }
}
