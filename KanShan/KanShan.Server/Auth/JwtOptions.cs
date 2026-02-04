namespace KanShan.Server.Auth;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "KanShan";
    public string Audience { get; set; } = "KanShan.Web";
    public string SigningKey { get; set; } = string.Empty;
    public int ExpiresMinutes { get; set; } = 60 * 24 * 7;
}
