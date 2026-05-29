using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KanKan.API.Controllers;

/// <summary>
/// Server-side proxy for the Yahoo Finance public chart endpoint.
///
/// Why this lives on the server: browsers cannot call query1.finance.yahoo.com
/// directly (no CORS headers), and corporate networks often block public CORS
/// proxies (corsproxy.io, allorigins, etc.). Proxying server-side avoids CORS
/// entirely and gives us a place to add a small per-symbol cache so we don't
/// hammer Yahoo on every UI refresh.
///
/// Yahoo's v7/finance/quote endpoint additionally requires a 'crumb' + matching
/// session cookies since 2024 to return the full field set (marketCap,
/// trailingPE, dividendYield, 52-week range, etc.). We do a one-time handshake
/// to fetch a crumb and reuse it for ~30 minutes.
/// </summary>
[Authorize]
[ApiController]
[Route("api/stocks")]
public class StocksController : ControllerBase
{
    private static readonly Regex SymbolPattern = new("^[A-Z0-9.\\-]{1,12}$", RegexOptions.Compiled);

    // 60-second per-symbol cache for the (heavy) history endpoint.
    private static readonly ConcurrentDictionary<string, CacheEntry> ChartCache = new();
    private static readonly TimeSpan ChartCacheTtl = TimeSpan.FromSeconds(60);

    // 5-second cache for the live quote endpoint — short enough to feel fresh,
    // long enough to absorb the page's auto-refresh storm on first render.
    private static readonly ConcurrentDictionary<string, CacheEntry> QuoteCache = new();
    private static readonly TimeSpan QuoteCacheTtl = TimeSpan.FromSeconds(5);

    // --- Yahoo crumb / cookie state -----------------------------------------
    // A single CookieContainer is shared by every Yahoo call so the consent
    // cookies set by fc.yahoo.com travel along with the crumb-bearing requests.
    private static readonly CookieContainer YahooCookies = new();
    private static readonly HttpClientHandler YahooHandler = new()
    {
        CookieContainer = YahooCookies,
        UseCookies = true,
        AutomaticDecompression = DecompressionMethods.All,
    };
    private static readonly HttpClient YahooClient = new(YahooHandler)
    {
        Timeout = TimeSpan.FromSeconds(8),
    };

    static StocksController()
    {
        YahooClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; KanKan/1.0)");
        YahooClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    private static readonly SemaphoreSlim CrumbLock = new(1, 1);
    private static string? _crumb;
    private static DateTime _crumbExpiresUtc = DateTime.MinValue;
    // -------------------------------------------------------------------------

    private readonly ILogger<StocksController> _logger;

    public StocksController(ILogger<StocksController> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// GET /api/stocks/chart/{symbol}?range=2y&amp;interval=1d
    /// Returns the raw Yahoo chart JSON. Client computes returns/SMAs from it.
    /// </summary>
    [HttpGet("chart/{symbol}")]
    public async Task<IActionResult> GetChart(
        string symbol,
        [FromQuery] string range = "2y",
        [FromQuery] string interval = "1d",
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(symbol) || !SymbolPattern.IsMatch(symbol.ToUpperInvariant()))
        {
            return BadRequest(new { error = "Invalid symbol" });
        }

        symbol = symbol.ToUpperInvariant();

        // Whitelist range/interval to avoid letting callers craft arbitrary upstream queries.
        var validRanges = new HashSet<string> { "1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max" };
        var validIntervals = new HashSet<string> { "1m", "5m", "15m", "30m", "60m", "1h", "1d", "5d", "1wk", "1mo", "3mo" };
        if (!validRanges.Contains(range)) range = "2y";
        if (!validIntervals.Contains(interval)) interval = "1d";

        var cacheKey = $"{symbol}|{range}|{interval}";
        if (ChartCache.TryGetValue(cacheKey, out var hit) && DateTime.UtcNow - hit.FetchedAtUtc < ChartCacheTtl)
        {
            return Content(hit.Json, "application/json");
        }

        var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{Uri.EscapeDataString(symbol)}" +
                  $"?interval={interval}&range={range}&includePrePost=false";

        try
        {
            var body = await FetchYahooAsync(url, ct);
            ChartCache[cacheKey] = new CacheEntry(body, DateTime.UtcNow);
            return Content(body, "application/json");
        }
        catch (UpstreamException ex)
        {
            _logger.LogWarning("Yahoo chart {Symbol} failed: {Message}", symbol, ex.Message);
            return StatusCode(ex.Status, new { error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/stocks/quote?symbols=NVDA,AMD,INTC
    /// Lightweight live-quote batch (price, change, market state, market cap,
    /// trailing P/E, 52-week range, etc.). Uses Yahoo crumb auth so the full
    /// field set comes through; falls back to a single retry with a fresh
    /// crumb if Yahoo invalidates the cached one.
    /// </summary>
    [HttpGet("quote")]
    public async Task<IActionResult> GetQuote(
        [FromQuery] string symbols,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(symbols))
        {
            return BadRequest(new { error = "symbols required" });
        }

        var parsed = symbols
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => s.ToUpperInvariant())
            .Where(s => SymbolPattern.IsMatch(s))
            .Distinct()
            .Take(50)
            .ToArray();

        if (parsed.Length == 0)
        {
            return BadRequest(new { error = "no valid symbols" });
        }

        var cacheKey = string.Join(',', parsed.OrderBy(s => s, StringComparer.Ordinal));
        if (QuoteCache.TryGetValue(cacheKey, out var hit) && DateTime.UtcNow - hit.FetchedAtUtc < QuoteCacheTtl)
        {
            return Content(hit.Json, "application/json");
        }

        try
        {
            var body = await FetchQuoteWithCrumbAsync(parsed, ct);
            QuoteCache[cacheKey] = new CacheEntry(body, DateTime.UtcNow);
            return Content(body, "application/json");
        }
        catch (UpstreamException ex)
        {
            _logger.LogWarning("Yahoo quote batch ({Count}) failed: {Message}", parsed.Length, ex.Message);
            return StatusCode(ex.Status, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Fetch a quote batch, using the cached crumb. On 401/403 we invalidate
    /// the crumb (Yahoo rotates them) and retry exactly once with a fresh one.
    /// </summary>
    private async Task<string> FetchQuoteWithCrumbAsync(string[] symbols, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var crumb = await GetCrumbAsync(forceRefresh: attempt > 0, ct);
            var url = "https://query1.finance.yahoo.com/v7/finance/quote"
                      + $"?symbols={Uri.EscapeDataString(string.Join(',', symbols))}"
                      + $"&crumb={Uri.EscapeDataString(crumb)}";

            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            using var resp = await YahooClient.SendAsync(req, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);

            if (resp.IsSuccessStatusCode)
            {
                return body;
            }
            if ((resp.StatusCode == HttpStatusCode.Unauthorized || resp.StatusCode == HttpStatusCode.Forbidden)
                && attempt == 0)
            {
                _logger.LogInformation("Yahoo quote returned {Status}; refreshing crumb and retrying", (int)resp.StatusCode);
                continue;
            }
            throw new UpstreamException((int)resp.StatusCode, $"Upstream {(int)resp.StatusCode}: {Truncate(body, 120)}");
        }
        // Unreachable — the loop either returns or throws.
        throw new UpstreamException(500, "quote: unexpected exit");
    }

    /// <summary>
    /// Return a cached Yahoo crumb if still warm, otherwise do the two-step
    /// handshake: hit fc.yahoo.com to set consent cookies (A1, A1S, etc.),
    /// then GET /v1/test/getcrumb. Crumbs are stable for hours; we refresh
    /// every 30 min as a safety net.
    /// </summary>
    private async Task<string> GetCrumbAsync(bool forceRefresh, CancellationToken ct)
    {
        if (!forceRefresh && _crumb != null && DateTime.UtcNow < _crumbExpiresUtc)
        {
            return _crumb;
        }

        await CrumbLock.WaitAsync(ct);
        try
        {
            if (!forceRefresh && _crumb != null && DateTime.UtcNow < _crumbExpiresUtc)
            {
                return _crumb;
            }

            // Step 1: prime the consent cookies. fc.yahoo.com sets A1/A1S that
            // are required for the crumb endpoint to return a valid token.
            try
            {
                using var consentResp = await YahooClient.GetAsync("https://fc.yahoo.com", ct);
                // Don't error-check — fc.yahoo.com may 200/302/404 depending on geo, but
                // cookies still get set.
                _ = await consentResp.Content.ReadAsStringAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "fc.yahoo.com consent hit failed (non-fatal)");
            }

            // Step 2: fetch the crumb.
            using var crumbResp = await YahooClient.GetAsync(
                "https://query2.finance.yahoo.com/v1/test/getcrumb", ct);
            if (!crumbResp.IsSuccessStatusCode)
            {
                throw new UpstreamException(
                    (int)crumbResp.StatusCode,
                    $"crumb fetch {(int)crumbResp.StatusCode}");
            }
            var crumb = (await crumbResp.Content.ReadAsStringAsync(ct)).Trim();
            if (string.IsNullOrWhiteSpace(crumb) || crumb.Length < 4)
            {
                throw new UpstreamException(502, "Yahoo returned an empty crumb");
            }

            _crumb = crumb;
            _crumbExpiresUtc = DateTime.UtcNow.AddMinutes(30);
            _logger.LogInformation("Acquired Yahoo crumb (len {Len})", crumb.Length);
            return crumb;
        }
        finally
        {
            CrumbLock.Release();
        }
    }

    /// <summary>
    /// Generic Yahoo fetch used by the chart endpoint. Does NOT include a
    /// crumb — the v8/finance/chart endpoint doesn't need one.
    /// </summary>
    private async Task<string> FetchYahooAsync(string url, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            using var resp = await YahooClient.SendAsync(req, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                throw new UpstreamException((int)resp.StatusCode, $"Upstream {(int)resp.StatusCode}: {Truncate(body, 120)}");
            }

            return body;
        }
        catch (TaskCanceledException)
        {
            throw new UpstreamException(504, "Upstream timeout");
        }
        catch (HttpRequestException ex)
        {
            throw new UpstreamException(502, $"Upstream fetch failed: {ex.Message}");
        }
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) || s.Length <= max ? s : s[..max];

    private sealed record CacheEntry(string Json, DateTime FetchedAtUtc);

    private sealed class UpstreamException : Exception
    {
        public int Status { get; }
        public UpstreamException(int status, string message) : base(message) { Status = status; }
    }
}
