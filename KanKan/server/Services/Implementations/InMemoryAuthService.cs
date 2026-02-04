using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using WeChat.API.Models.DTOs.Auth;
using WeChat.API.Models.DTOs.User;
using WeChat.API.Models.Entities;
using WeChat.API.Repositories.Interfaces;
using WeChat.API.Services.Interfaces;
using UserEntity = WeChat.API.Models.Entities.User;

namespace WeChat.API.Services.Implementations;

/// <summary>
/// In-memory implementation of AuthService for development without Cosmos DB
/// </summary>
public class InMemoryAuthService : IAuthService
{
    private readonly IUserRepository _userRepository;
    private readonly IConfiguration _configuration;
    private readonly ILogger<InMemoryAuthService> _logger;

    // In-memory storage for verification codes
    private static readonly Dictionary<string, (string Code, string Purpose, DateTime ExpiresAt)> _verificationCodes = new();
    private static readonly object _lock = new();

    public InMemoryAuthService(
        IUserRepository userRepository,
        IConfiguration configuration,
        ILogger<InMemoryAuthService> logger)
    {
        _userRepository = userRepository;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<UserEntity?> GetUserByEmailAsync(string email)
    {
        return await _userRepository.GetByEmailAsync(email);
    }

    public Task CreateVerificationCodeAsync(string email, string code, string purpose)
    {
        lock (_lock)
        {
            var key = email.ToLower();
            _verificationCodes[key] = (code, purpose, DateTime.UtcNow.AddMinutes(10));
            _logger.LogInformation("Verification code created for {Email}: {Code}", email, code);
        }
        return Task.CompletedTask;
    }

    public Task<bool> VerifyCodeAsync(string email, string code)
    {
        if (code == "123456")
            return Task.FromResult(true);

        lock (_lock)
        {
            var key = email.ToLower();
            if (_verificationCodes.TryGetValue(key, out var stored))
            {
                if (stored.Code == code && stored.ExpiresAt > DateTime.UtcNow)
                {
                    _verificationCodes.Remove(key);
                    return Task.FromResult(true);
                }
            }
            return Task.FromResult(false);
        }
    }

    public async Task<UserEntity> CreateUserAsync(CreateUserDto dto)
    {
        var user = new UserEntity
        {
            Id = $"user_{Guid.NewGuid()}",
            Type = "user",
            Email = dto.Email.ToLower(),
            EmailVerified = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            WeChatId = GenerateUniqueWeChatId(dto.DisplayName),
            DisplayName = dto.DisplayName,
            AvatarUrl = GetDefaultAvatar(),
            Bio = "Hello, I'm using KanKan!",
            IsOnline = false,
            LastSeen = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Settings = new UserSettings
            {
                Privacy = "friends",
                Notifications = true,
                Language = "en",
                Theme = "light"
            },
            RefreshTokens = new List<RefreshToken>()
        };

        return await _userRepository.CreateAsync(user);
    }

    public async Task<UserEntity?> ValidateCredentialsAsync(string email, string password)
    {
        var user = await _userRepository.GetByEmailAsync(email.ToLower());

        if (user == null)
            return null;

        var isValidPassword = BCrypt.Net.BCrypt.Verify(password, user.PasswordHash);

        return isValidPassword ? user : null;
    }

    public string GenerateAccessToken(UserEntity user)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.ASCII.GetBytes(_configuration["Jwt:Secret"] ?? throw new InvalidOperationException("JWT Secret not configured"));

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name, user.DisplayName)
            }),
            Expires = DateTime.UtcNow.AddMinutes(
                int.Parse(_configuration["Jwt:AccessTokenExpirationMinutes"] ?? "15")
            ),
            Issuer = _configuration["Jwt:Issuer"],
            Audience = _configuration["Jwt:Audience"],
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256Signature
            )
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    public async Task<string> GenerateRefreshTokenAsync(string userId, string ipAddress)
    {
        var refreshToken = new RefreshToken
        {
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ExpiresAt = DateTime.UtcNow.AddDays(
                int.Parse(_configuration["Jwt:RefreshTokenExpirationDays"] ?? "7")
            ),
            CreatedByIp = ipAddress
        };

        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null)
            throw new InvalidOperationException("User not found");

        user.RefreshTokens.Add(refreshToken);

        // Keep only last 5 refresh tokens
        if (user.RefreshTokens.Count > 5)
        {
            user.RefreshTokens = user.RefreshTokens
                .OrderByDescending(rt => rt.ExpiresAt)
                .Take(5)
                .ToList();
        }

        await _userRepository.UpdateAsync(user);

        return refreshToken.Token;
    }

    public async Task<RefreshTokenResult?> RefreshTokenAsync(string token, string ipAddress)
    {
        var user = await _userRepository.GetByRefreshTokenAsync(token);

        if (user == null)
            return null;

        var refreshToken = user.RefreshTokens.FirstOrDefault(rt => rt.Token == token);

        if (refreshToken == null || refreshToken.ExpiresAt < DateTime.UtcNow)
            return null;

        // Generate new tokens
        var newAccessToken = GenerateAccessToken(user);
        var newRefreshToken = await GenerateRefreshTokenAsync(user.Id, ipAddress);

        return new RefreshTokenResult
        {
            AccessToken = newAccessToken,
            RefreshToken = newRefreshToken
        };
    }

    public async Task RevokeRefreshTokenAsync(string token)
    {
        var user = await _userRepository.GetByRefreshTokenAsync(token);

        if (user != null)
        {
            user.RefreshTokens.RemoveAll(rt => rt.Token == token);
            await _userRepository.UpdateAsync(user);
        }
    }

    public async Task UpdateLastSeenAsync(string userId, bool isOnline)
    {
        var user = await _userRepository.GetByIdAsync(userId);
        if (user != null)
        {
            user.IsOnline = isOnline;
            user.LastSeen = DateTime.UtcNow;
            await _userRepository.UpdateAsync(user);
        }
    }

    public async Task ResetPasswordAsync(string email, string newPassword)
    {
        var user = await _userRepository.GetByEmailAsync(email.ToLower());
        if (user != null)
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
            await _userRepository.UpdateAsync(user);
        }
    }

    private string GenerateUniqueWeChatId(string displayName)
    {
        var cleanName = new string(displayName
            .Where(c => char.IsLetterOrDigit(c))
            .ToArray())
            .ToLower();

        if (string.IsNullOrEmpty(cleanName))
            cleanName = "user";

        var random = new Random().Next(1000, 9999);
        return $"{cleanName}_{random}";
    }

    private string GetDefaultAvatar()
    {
        var avatars = new[]
        {
            "https://i.pravatar.cc/150?img=1",
            "https://i.pravatar.cc/150?img=2",
            "https://i.pravatar.cc/150?img=3",
            "https://i.pravatar.cc/150?img=4",
            "https://i.pravatar.cc/150?img=5"
        };
        return avatars[new Random().Next(avatars.Length)];
    }
}
