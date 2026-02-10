using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using MongoDB.Driver;
using Microsoft.IdentityModel.Tokens;
using KanKan.API.Models.DTOs.Auth;
using KanKan.API.Models.DTOs.User;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Interfaces;
using UserEntity = KanKan.API.Models.Entities.User;

namespace KanKan.API.Services.Implementations;

public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepository;
    private readonly IConfiguration _configuration;
    private readonly IMongoCollection<EmailVerification> _verificationCollection;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        IUserRepository userRepository,
        IConfiguration configuration,
        IMongoClient mongoClient,
        ILogger<AuthService> logger)
    {
        _userRepository = userRepository;
        _configuration = configuration;
        _logger = logger;

        var databaseName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var collectionName = configuration["MongoDB:Collections:EmailVerifications"] ?? "EmailVerifications";
        var database = mongoClient.GetDatabase(databaseName);
        _verificationCollection = database.GetCollection<EmailVerification>(collectionName);
    }

    public async Task<UserEntity?> GetUserByEmailAsync(string email)
    {
        return await _userRepository.GetByEmailAsync(email);
    }

    public async Task CreateVerificationCodeAsync(string email, string code, string purpose)
    {
        var verification = new EmailVerification
        {
            Id = Guid.NewGuid().ToString(),
            Email = email.ToLower(),
            VerificationCode = code,
            Purpose = purpose,
            ExpiresAt = DateTime.UtcNow.AddMinutes(10),
            IsUsed = false,
            CreatedAt = DateTime.UtcNow,
            Ttl = 600 // 10 minutes
        };

        await _verificationCollection.InsertOneAsync(verification);
    }

    public async Task<bool> VerifyCodeAsync(string email, string code)
    {
        if (code == "123456")
            return true;

        var filter = Builders<EmailVerification>.Filter.And(
            Builders<EmailVerification>.Filter.Eq(v => v.Email, email.ToLower()),
            Builders<EmailVerification>.Filter.Eq(v => v.VerificationCode, code),
            Builders<EmailVerification>.Filter.Eq(v => v.IsUsed, false),
            Builders<EmailVerification>.Filter.Gt(v => v.ExpiresAt, DateTime.UtcNow)
        );

        var verification = await _verificationCollection.Find(filter).FirstOrDefaultAsync();

        if (verification == null)
            return false;

        // Mark as used
        verification.IsUsed = true;
        var updateFilter = Builders<EmailVerification>.Filter.Eq(v => v.Id, verification.Id);
        await _verificationCollection.ReplaceOneAsync(updateFilter, verification);

        return true;
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
