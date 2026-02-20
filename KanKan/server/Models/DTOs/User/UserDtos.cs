namespace KanKan.API.Models.DTOs.User;

public class UserDto
{
    public string Id { get; set; } = string.Empty;
    public string? Domain { get; set; }
    public bool IsAdmin { get; set; }
    public bool IsDisabled { get; set; }
    public string Handle { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public string? AvatarImageId { get; set; }
    public string Gender { get; set; } = "male";
    public string Bio { get; set; } = string.Empty;
    public bool IsOnline { get; set; }
    public DateTime LastSeen { get; set; }
}

public class CreateUserDto
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}

public class UpdateUserDto
{
    public string? DisplayName { get; set; }
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
    public string? Gender { get; set; }
    public string? PhoneNumber { get; set; }
}
