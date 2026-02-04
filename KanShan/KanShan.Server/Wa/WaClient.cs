using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace KanShan.Server.Wa;

public interface IWaClient
{
    IAsyncEnumerable<string> StreamChatCompletionAsync(
        IReadOnlyList<(string role, string content)> messages,
        CancellationToken cancellationToken);
}

public sealed class WaClient : IWaClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;
    private readonly WaOptions _options;

    public WaClient(HttpClient http, IOptions<WaOptions> options)
    {
        _http = http;
        _options = options.Value;
    }

    public async IAsyncEnumerable<string> StreamChatCompletionAsync(
        IReadOnlyList<(string role, string content)> messages,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var url = new Uri(new Uri(_options.BaseUrl.TrimEnd('/') + "/"), "v1/chat/completions");

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.Token);

        var payload = new
        {
            model = _options.Model,
            stream = true,
            messages = messages.Select(m => new { role = m.role, content = m.content }).ToArray(),
        };

        request.Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");

        using var response = await _http.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream && !cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null) break;
            if (string.IsNullOrWhiteSpace(line)) continue;

            if (!line.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var data = line.Substring("data:".Length).Trim();
            if (data == "[DONE]")
            {
                yield break;
            }

            string? chunk = null;
            try
            {
                using var doc = JsonDocument.Parse(data);
                if (!doc.RootElement.TryGetProperty("choices", out var choices) || choices.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                var choice0 = choices.EnumerateArray().FirstOrDefault();
                if (choice0.ValueKind != JsonValueKind.Object) continue;

                if (!choice0.TryGetProperty("delta", out var delta) || delta.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                if (delta.TryGetProperty("content", out var contentEl) && contentEl.ValueKind == JsonValueKind.String)
                {
                    chunk = contentEl.GetString();
                }
            }
            catch (JsonException)
            {
                // Ignore non-JSON keepalives.
            }

            if (!string.IsNullOrEmpty(chunk))
            {
                yield return chunk;
            }
        }
    }
}
