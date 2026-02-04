using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using WeChat.API.Services.Interfaces;

namespace WeChat.API.Services.Implementations;

public class OpenAiAgentService : IAgentService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OpenAiAgentService> _logger;

    public OpenAiAgentService(HttpClient httpClient, IConfiguration configuration, ILogger<OpenAiAgentService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<string> GenerateReplyAsync(string chatId, string userMessage, IEnumerable<(string SenderName, string Message)> history)
    {
        var baseUrl = _configuration["Agent:BaseUrl"] ?? "http://52.171.138.19:8001/v1";
        var apiKey = _configuration["Agent:ApiKey"] ?? "123";
        var model = _configuration["Agent:Model"] ?? "gpt-3.5-turbo";

        var messages = new List<object>
        {
            new { role = "system", content = "You are Wa, a helpful assistant inside a chat app. Keep responses concise and friendly." }
        };

        foreach (var item in history)
        {
            messages.Add(new { role = "user", content = $"{item.SenderName}: {item.Message}" });
        }

        messages.Add(new { role = "user", content = userMessage });

        var payload = new
        {
            model,
            messages,
            temperature = 0.7
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            var response = await _httpClient.SendAsync(request);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            var content = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            return string.IsNullOrWhiteSpace(content) ? "Sorry, I didn't catch that." : content.Trim();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Agent response failed for chat {ChatId}", chatId);
            return "Sorry, I'm having trouble responding right now.";
        }
    }

    public async IAsyncEnumerable<string> StreamReplyAsync(string chatId, string userMessage, IEnumerable<(string SenderName, string Message)> history)
    {
        var baseUrl = _configuration["Agent:BaseUrl"] ?? "http://52.171.138.19:8001/v1";
        var apiKey = _configuration["Agent:ApiKey"] ?? "123";
        var model = _configuration["Agent:Model"] ?? "gpt-3.5-turbo";

        var messages = new List<object>
        {
            new { role = "system", content = "You are Wa, a helpful assistant inside a chat app. Keep responses concise and friendly." }
        };

        foreach (var item in history)
        {
            messages.Add(new { role = "user", content = $"{item.SenderName}: {item.Message}" });
        }

        messages.Add(new { role = "user", content = userMessage });

        var payload = new
        {
            model,
            messages,
            temperature = 0.7,
            stream = true
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream)
        {
            var line = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(line))
                continue;

            if (line.StartsWith("data: "))
            {
                var data = line.Substring(6).Trim();
                if (data == "[DONE]")
                    yield break;

                string? content = null;
                try
                {
                    using var doc = JsonDocument.Parse(data);
                    var delta = doc.RootElement
                        .GetProperty("choices")[0]
                        .GetProperty("delta");

                    if (delta.TryGetProperty("content", out var contentElement))
                    {
                        content = contentElement.GetString();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to parse agent stream chunk");
                }

                if (!string.IsNullOrEmpty(content))
                    yield return content;
            }
        }
    }
}
