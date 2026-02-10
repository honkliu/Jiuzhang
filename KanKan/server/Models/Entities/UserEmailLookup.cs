namespace KanKan.API.Models.Entities;

public class UserEmailLookup
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "user_email";
    public string Email { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
