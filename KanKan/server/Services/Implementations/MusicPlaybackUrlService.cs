using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using KanKan.API.Models.DTOs.Music;
using KanKan.API.Services.Interfaces;
using Microsoft.AspNetCore.WebUtilities;

namespace KanKan.API.Services.Implementations;

public sealed class MusicPlaybackUrlService : IMusicPlaybackUrlService
{
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(6);
    private readonly byte[] _signingKey;

    public MusicPlaybackUrlService(IConfiguration configuration)
    {
        var signingKey = configuration["Jwt:Secret"];
        if (string.IsNullOrWhiteSpace(signingKey)
            || Encoding.UTF8.GetByteCount(signingKey) < 32)
        {
            throw new InvalidOperationException(
                "Music playback signing key must contain at least 32 UTF-8 bytes.");
        }

        _signingKey = Encoding.UTF8.GetBytes(signingKey);
    }

    public MusicPlaybackUrlResponse Create(string recordId, string userId)
    {
        var expiresAt = DateTimeOffset.UtcNow.Add(TokenLifetime);
        var expires = expiresAt.ToUnixTimeSeconds();
        var signature = Sign(recordId, userId, expires);
        var path = $"/api/music/records/{Uri.EscapeDataString(recordId)}/stream";
        var url = QueryHelpers.AddQueryString(
            path,
            new Dictionary<string, string?>
            {
                ["user"] = userId,
                ["expires"] = expires.ToString(CultureInfo.InvariantCulture),
                ["signature"] = signature
            });
        return new MusicPlaybackUrlResponse(url, expiresAt);
    }

    public bool Validate(
        string recordId,
        string userId,
        long expiresUnixSeconds,
        string signature)
    {
        if (string.IsNullOrWhiteSpace(userId)
            || string.IsNullOrWhiteSpace(signature)
            || DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expiresUnixSeconds)
        {
            return false;
        }

        byte[] provided;
        try
        {
            provided = Convert.FromHexString(signature);
        }
        catch (FormatException)
        {
            return false;
        }

        var expected = Convert.FromHexString(Sign(recordId, userId, expiresUnixSeconds));
        return provided.Length == expected.Length
            && CryptographicOperations.FixedTimeEquals(provided, expected);
    }

    private string Sign(string recordId, string userId, long expiresUnixSeconds)
    {
        var payload = $"{recordId}\n{userId}\n{expiresUnixSeconds}";
        var signature = HMACSHA256.HashData(
            _signingKey,
            Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(signature).ToLowerInvariant();
    }
}
