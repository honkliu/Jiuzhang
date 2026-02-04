using System.Security.Claims;

namespace KanShan.Server.Auth;

public interface ICurrentUser
{
    Guid UserId { get; }
    string UserName { get; }
    string DisplayName { get; }
    bool IsAuthenticated { get; }
}

public sealed class CurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUser(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public bool IsAuthenticated => _httpContextAccessor.HttpContext?.User?.Identity?.IsAuthenticated == true;

    public Guid UserId => _httpContextAccessor.HttpContext?.User?.GetUserId() ?? Guid.Empty;

    public string UserName => _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Name) ?? string.Empty;

    public string DisplayName => _httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.GivenName) ?? string.Empty;
}
