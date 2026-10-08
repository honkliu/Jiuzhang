using KanKan.API.Models.DTOs.Music;

namespace KanKan.API.Services.Interfaces;

public interface IMusicPlaybackUrlService
{
    MusicPlaybackUrlResponse Create(string recordId, string userId);

    bool Validate(string recordId, string userId, long expiresUnixSeconds, string signature);
}
