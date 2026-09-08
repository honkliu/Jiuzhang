using System.Text;
using System.Text.Json;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using OpenAI;
using System.ClientModel;
using System.ClientModel.Primitives;
using KanKan.API.Domain.Chat;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Interfaces;

namespace KanKan.API.Services.Implementations;

public class SemanticKernelAgentService : IAgentService
{
    private readonly IConfiguration _configuration;
    private readonly IAgentToolRepository _toolRepository;
    private readonly ILogger<SemanticKernelAgentService> _logger;

    public SemanticKernelAgentService(
        IConfiguration configuration,
        IAgentToolRepository toolRepository,
        ILogger<SemanticKernelAgentService> logger)
    {
        _configuration = configuration;
        _toolRepository = toolRepository;
        _logger = logger;
    }

    // Injects sglang-specific fields that the OpenAI SDK would otherwise strip.
    private sealed class SglangPatchHandler() : DelegatingHandler(new HttpClientHandler())
    {
        private static readonly JsonSerializerOptions _opts = new();

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken ct)
        {
            if (request.Content != null)
            {
                var body = await request.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (!root.TryGetProperty("chat_template_kwargs", out _))
                {
                    var dict = root.EnumerateObject()
                        .ToDictionary(p => p.Name, p => p.Value.Clone());

                    dict["chat_template_kwargs"] =
                        JsonDocument.Parse("""{"enable_thinking":false}""").RootElement;

                    if (!dict.ContainsKey("presence_penalty"))
                        dict["presence_penalty"] =
                            JsonDocument.Parse("1.5").RootElement;

                    request.Content = new StringContent(
                        JsonSerializer.Serialize(dict, _opts),
                        Encoding.UTF8, "application/json");
                }
            }
            return await base.SendAsync(request, ct);
        }
    }

    private async Task<Kernel> BuildKernelAsync()
    {
        var baseUrl = _configuration["Agent:BaseUrl"]
            ?? throw new InvalidOperationException("Agent:BaseUrl not configured");
        var apiKey = _configuration["Agent:ApiKey"] ?? "dummy";
        var model = _configuration["Agent:Model"] ?? "model";

        var httpClient = new HttpClient(new SglangPatchHandler());
        var openAiClient = new OpenAIClient(
            new ApiKeyCredential(apiKey),
            new OpenAIClientOptions
            {
                Endpoint = new Uri(baseUrl),
                Transport = new HttpClientPipelineTransport(httpClient),
            });

        var builder = Kernel.CreateBuilder();
        builder.AddOpenAIChatCompletion(modelId: model, openAIClient: openAiClient);

        var kernel = builder.Build();

        var tools = await _toolRepository.GetAllEnabledAsync();
        if (tools.Count > 0)
        {
            var functions = tools.Select(tool =>
            {
                var parameters = tool.Parameters
                    .Select(p => new KernelParameterMetadata(p.Name) { Description = p.Description, IsRequired = true })
                    .ToList();

                return KernelFunctionFactory.CreateFromMethod(
                    method: async (KernelArguments args) =>
                    {
                        try { return await ExecuteHttpToolAsync(tool, args); }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Tool {Tool} failed", tool.Name);
                            return $"Error calling {tool.Name}: {ex.Message}";
                        }
                    },
                    functionName: tool.Name,
                    description: tool.Description,
                    parameters: parameters);
            }).ToList();

            kernel.ImportPluginFromFunctions("Tools", functions);
            _logger.LogInformation("Agent: loaded {Count} tool(s) — {Names}",
                tools.Count, string.Join(", ", tools.Select(t => t.Name)));
        }
        else
        {
            _logger.LogWarning("Agent: no enabled tools found in DB.");
        }

        return kernel;
    }

    private static OpenAIPromptExecutionSettings BuildSettings() => new()
    {
        ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions,
        Temperature = 0.7,
        TopP = 0.9,
    };

    private static async Task<string> ExecuteHttpToolAsync(AgentTool tool, KernelArguments args)
    {
        var url = tool.UrlTemplate;
        var body = new Dictionary<string, object?>();
        foreach (var param in tool.Parameters)
        {
            if (!args.TryGetValue(param.Name, out var value) || value is null)
                continue;

            var placeholder = $"{{{param.Name}}}";
            if (url.Contains(placeholder, StringComparison.Ordinal))
                url = url.Replace(placeholder, Uri.EscapeDataString(value.ToString()!));
            else
                body[param.Name] = value;
        }

        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        var method = string.IsNullOrWhiteSpace(tool.Method)
            ? HttpMethod.Get
            : new HttpMethod(tool.Method.Trim().ToUpperInvariant());
        using var request = new HttpRequestMessage(method, url);

        if (method == HttpMethod.Post)
            request.Content = new StringContent(BuildPostBody(tool, args, body), Encoding.UTF8, "application/json");
        else if (method != HttpMethod.Get)
            throw new InvalidOperationException($"Unsupported HTTP method '{method}'.");

        foreach (var (key, val) in tool.Headers)
        {
            if (!request.Headers.TryAddWithoutValidation(key, val))
                request.Content?.Headers.TryAddWithoutValidation(key, val);
        }

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        response.EnsureSuccessStatusCode();
        return content.Length > 6000 ? content[..6000] + "\n...(truncated)" : content;
    }

    private static string BuildPostBody(
        AgentTool tool,
        KernelArguments args,
        Dictionary<string, object?> fallbackBody)
    {
        if (string.IsNullOrWhiteSpace(tool.BodyTemplate))
            return JsonSerializer.Serialize(fallbackBody);

        var rendered = tool.BodyTemplate;
        foreach (var param in tool.Parameters)
        {
            if (!args.TryGetValue(param.Name, out var value) || value is null)
                continue;

            var placeholder = JsonSerializer.Serialize($"{{{param.Name}}}");
            var replacement = JsonSerializer.Serialize(value.ToString());
            rendered = rendered.Replace(placeholder, replacement, StringComparison.Ordinal);
        }

        try
        {
            using var json = JsonDocument.Parse(rendered);
            return json.RootElement.GetRawText();
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Tool '{tool.Name}' has an invalid JSON body template.", ex);
        }
    }

    public async Task<string> GenerateReplyAsync(
        string chatId,
        string userMessage,
        IEnumerable<(string SenderName, string Message)> history)
    {
        var kernel = await BuildKernelAsync();
        var result = await kernel.GetRequiredService<IChatCompletionService>()
            .GetChatMessageContentAsync(BuildChatHistory(userMessage, history), BuildSettings(), kernel);
        return result.Content ?? "";
    }

#pragma warning disable CS1998
    public async IAsyncEnumerable<string> StreamReplyAsync(
        string chatId,
        string userMessage,
        IEnumerable<(string SenderName, string Message)> history)
    {
        var kernel = await BuildKernelAsync();

        await foreach (var chunk in kernel.GetRequiredService<IChatCompletionService>()
            .GetStreamingChatMessageContentsAsync(BuildChatHistory(userMessage, history), BuildSettings(), kernel))
        {
            if (chunk.Content is { Length: > 0 } content)
                yield return content;
        }
    }
#pragma warning restore CS1998

    private static ChatHistory BuildChatHistory(
        string userMessage,
        IEnumerable<(string SenderName, string Message)> history)
    {
        var chatHistory = new ChatHistory();
        chatHistory.AddSystemMessage(
            "You are River (洛), a helpful AI assistant. " +
            "You have tools available for real-time information and external services. " +
            "Always use tools when you need real-time information — never guess or make up data. " +
            "Be concise. Never prefix your reply with your own name.");

        foreach (var (name, text) in history)
        {
            if (string.IsNullOrWhiteSpace(text)) continue;
            if (string.Equals(name, ChatDomain.AgentDisplayName, StringComparison.OrdinalIgnoreCase))
                chatHistory.AddAssistantMessage(text);
            else
                chatHistory.AddUserMessage(text);
        }

        chatHistory.AddUserMessage(userMessage);
        return chatHistory;
    }
}
