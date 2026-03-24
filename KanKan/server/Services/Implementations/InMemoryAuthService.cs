using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using KanKan.API.Domain;
using KanKan.API.Models.DTOs.Auth;
using KanKan.API.Models.DTOs.User;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Interfaces;
using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Services.Implementations;

/// <summary>
/// In-memory implementation of AuthService for development without MongoDB
/// </summary>
public class InMemoryAuthService : IAuthService
{
    private readonly IUserRepository _userRepository;
    private readonly IConfiguration _configuration;
    private readonly ILogger<InMemoryAuthService> _logger;

    // In-memory storage for verification codes
    private static readonly Dictionary<string, (string Email, string Code, string Purpose, DateTime ExpiresAt, DateTime CreatedAt)> _verificationCodes = new();
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

    public Task<string?> GetActiveVerificationCodeAsync(string email, string purpose)
    {
        lock (_lock)
        {
            var key = BuildVerificationKey(email, purpose);
            if (_verificationCodes.TryGetValue(key, out var stored) && stored.ExpiresAt > DateTime.UtcNow)
            {
                return Task.FromResult<string?>(stored.Code);
            }

            return Task.FromResult<string?>(null);
        }
    }

    public Task CreateVerificationCodeAsync(string email, string code, string purpose, int ttlMinutes = 10)
    {
        lock (_lock)
        {
            var key = BuildVerificationKey(email, purpose);
            _verificationCodes[key] = (email.ToLower(), code, purpose, DateTime.UtcNow.AddMinutes(ttlMinutes), DateTime.UtcNow);
            _logger.LogInformation("Verification code created for {Email}: {Code}", email, code);
        }
        return Task.CompletedTask;
    }

    public Task<bool> VerifyCodeAsync(string email, string code, string purpose)
    {
        lock (_lock)
        {
            var entry = _verificationCodes.FirstOrDefault(kv =>
                string.Equals(kv.Value.Email, email.ToLower(), StringComparison.OrdinalIgnoreCase) &&
                kv.Value.Code == code &&
                kv.Value.Purpose == purpose);

            if (!string.IsNullOrEmpty(entry.Key))
            {
                var stored = entry.Value;
                if (stored.ExpiresAt > DateTime.UtcNow)
                {
                    _verificationCodes.Remove(entry.Key);
                    return Task.FromResult(true);
                }
            }
            return Task.FromResult(false);
        }
    }

    public Task<List<(string Email, string Code, string Purpose, DateTime CreatedAt, string Status)>> GetAllInviteCodesAsync()
    {
        lock (_lock)
        {
            var now = DateTime.UtcNow;
            var results = _verificationCodes
                .Select(kv => (
                    kv.Value.Email,
                    kv.Value.Code,
                    kv.Value.Purpose,
                    kv.Value.CreatedAt,
                    kv.Value.ExpiresAt > now ? "pending" as string : "expired" as string
                ))
                .OrderByDescending(kv => kv.CreatedAt)
                .ToList();
            return Task.FromResult(results);
        }
    }

    private static string BuildVerificationKey(string email, string purpose)
    {
        return $"{purpose}:{email.ToLower()}";
    }

    public async Task<UserEntity> CreateUserAsync(CreateUserDto dto)
    {
        var isAdmin = IsConfiguredAdmin(dto.Email);
        var user = new UserEntity
        {
            Id = $"user_{Guid.NewGuid()}",
            Type = "user",
            Email = dto.Email.ToLower(),
            Domain = DomainRules.GetDomain(dto.Email),
            EmailVerified = true,
            IsAdmin = isAdmin,
            IsDisabled = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Handle = GenerateUniqueHandle(dto.DisplayName),
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

        if (!isValidPassword)
            return null;

        var shouldBeAdmin = IsConfiguredAdmin(user.Email);
        if (user.IsAdmin != shouldBeAdmin)
        {
            user.IsAdmin = shouldBeAdmin;
            await _userRepository.UpdateAsync(user);
        }

        return user;
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

        if (user.IsDisabled)
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

    private bool IsConfiguredAdmin(string email)
    {
        var adminEmails = _configuration.GetSection("AdminEmails").Get<string[]>()
            ?? Array.Empty<string>();
        return Array.Exists(
            adminEmails,
            adminEmail => string.Equals(adminEmail, email, StringComparison.OrdinalIgnoreCase));
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

    private string GenerateUniqueHandle(string displayName)
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
        return "/api/avatar/image/default";
    }
}
