using KanShan.Server.Domain.Entities;

namespace KanShan.Server.Data;

public static class DevDataSeeder
{
    // Deterministic IDs make it easier to test and share URLs.
    public static readonly IReadOnlyDictionary<string, (Guid id, string displayName)> DefaultUsers =
        new Dictionary<string, (Guid id, string displayName)>(StringComparer.OrdinalIgnoreCase)
        {
            ["alice"] = (Guid.Parse("11111111-1111-1111-1111-111111111111"), "Alice"),
            ["bob"] = (Guid.Parse("22222222-2222-2222-2222-222222222222"), "Bob"),
            ["carol"] = (Guid.Parse("33333333-3333-3333-3333-333333333333"), "Carol"),
        };

    public static AppUser CreateOrUpdateDevUser(string userName)
    {
        var key = (userName ?? string.Empty).Trim().ToLowerInvariant();
        if (!DefaultUsers.TryGetValue(key, out var user))
        {
            throw new InvalidOperationException("Unknown dev user");
        }

        return new AppUser
        {
            Id = user.id,
            UserName = key,
            DisplayName = user.displayName,
            PasswordHash = "DEV_NO_PASSWORD",
            CreatedAt = DateTimeOffset.UtcNow,
        };
    }
}
