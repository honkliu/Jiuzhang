using KanKan.API.Models.DTOs.Auth;
using KanKan.API.Models.DTOs.User;
using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Services.Interfaces;

public interface IAuthService
{
    Task<UserEntity?> GetUserByEmailAsync(string email);
    Task CreateVerificationCodeAsync(string email, string code, string purpose);
    Task<bool> VerifyCodeAsync(string email, string code);
    Task<UserEntity> CreateUserAsync(CreateUserDto dto);
    Task<UserEntity?> ValidateCredentialsAsync(string email, string password);
    string GenerateAccessToken(UserEntity user);
    Task<string> GenerateRefreshTokenAsync(string userId, string ipAddress);
    Task<RefreshTokenResult?> RefreshTokenAsync(string token, string ipAddress);
    Task RevokeRefreshTokenAsync(string token);
    Task UpdateLastSeenAsync(string userId, bool isOnline);
    Task ResetPasswordAsync(string email, string newPassword);
}
