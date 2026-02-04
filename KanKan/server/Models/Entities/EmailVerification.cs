namespace WeChat.API.Models.Entities;

public class EmailVerification
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "email_verification";
    public string Email { get; set; } = string.Empty;
    public string VerificationCode { get; set; } = string.Empty;
    public string Purpose { get; set; } = "registration"; // registration or password_reset
    public DateTime ExpiresAt { get; set; }
    public bool IsUsed { get; set; }
    public DateTime CreatedAt { get; set; }
    public int Ttl { get; set; } = 600; // 10 minutes in seconds
}
