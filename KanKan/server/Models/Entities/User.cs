namespace KanKan.API.Models.Entities;

public class User
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "user";
    public string Email { get; set; } = string.Empty;
    public bool EmailVerified { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public string Handle { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public string Bio { get; set; } = "Hello, I'm using KanKan!";
    public string? PhoneNumber { get; set; }
    public bool IsOnline { get; set; }
    public DateTime LastSeen { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public UserSettings Settings { get; set; } = new();
    public List<RefreshToken> RefreshTokens { get; set; } = new();
}

public class UserSettings
{
    public string Privacy { get; set; } = "friends";
    public bool Notifications { get; set; } = true;
    public string Language { get; set; } = "en";
    public string Theme { get; set; } = "light";
}

public class RefreshToken
{
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string CreatedByIp { get; set; } = string.Empty;
}
