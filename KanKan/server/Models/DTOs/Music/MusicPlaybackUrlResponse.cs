namespace KanKan.API.Models.DTOs.Music;

/// <summary>Provides a short-lived URL for streaming a catalog record.</summary>
public sealed record MusicPlaybackUrlResponse(
    string Url,
    DateTimeOffset ExpiresAt);
