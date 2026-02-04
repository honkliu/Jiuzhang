using System.Security.Claims;

namespace KanShan.Server.Auth;

public static class Claims
{
    public const string UserId = "uid";
}

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        var value = principal.FindFirstValue(Claims.UserId);
        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }
}
