using KanKan.API.Models.Entities;

namespace KanKan.API.Domain;

public static class FamilyAccessPolicy
{
    public static string ResolveDomain(User user)
    {
        return NormalizeDomain(string.IsNullOrWhiteSpace(user.Domain)
            ? DomainRules.GetDomain(user.Email)
            : user.Domain);
    }

    public static bool CanViewFamilyTree(IConfiguration configuration, User user)
    {
        return GetVisibleDomains(configuration, user).Count > 0;
    }

    public static bool CanEditAnyFamilyTree(IConfiguration configuration, User user)
    {
        return GetEditableDomains(configuration, user).Count > 0;
    }

    public static IReadOnlyCollection<string> GetVisibleDomains(IConfiguration configuration, User user)
    {
        var domains = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var ownDomain = ResolveDomain(user);
        var enabledDomains = GetEnabledDomains(configuration);

        if (enabledDomains.Contains(ownDomain))
        {
            domains.Add(ownDomain);
        }

        foreach (var managedDomain in GetEditableDomains(configuration, user))
        {
            domains.Add(managedDomain);
        }

        return domains.ToArray();
    }

    public static IReadOnlyCollection<string> GetEditableDomains(IConfiguration configuration, User user)
    {
        if (!user.IsAdmin)
        {
            return Array.Empty<string>();
        }

        var domains = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var enabledDomains = GetEnabledDomains(configuration);
        var ownDomain = ResolveDomain(user);

        if (enabledDomains.Contains(ownDomain))
        {
            domains.Add(ownDomain);
        }

        var managedDomains = GetManagedDomains(configuration, user.Email);
        foreach (var domain in managedDomains)
        {
            if (enabledDomains.Contains(domain))
            {
                domains.Add(domain);
            }
        }

        return domains.ToArray();
    }

    public static bool CanViewTreeDomain(IConfiguration configuration, User user, string treeDomain)
    {
        var normalizedDomain = NormalizeDomain(treeDomain);
        return GetVisibleDomains(configuration, user)
            .Any(domain => string.Equals(domain, normalizedDomain, StringComparison.OrdinalIgnoreCase));
    }

    public static bool CanEditTreeDomain(IConfiguration configuration, User user, string treeDomain)
    {
        var normalizedDomain = NormalizeDomain(treeDomain);
        return GetEditableDomains(configuration, user)
            .Any(domain => string.Equals(domain, normalizedDomain, StringComparison.OrdinalIgnoreCase));
    }

    public static string NormalizeDomain(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.StartsWith("@", StringComparison.Ordinal))
        {
            normalized = normalized[1..];
        }

        return normalized;
    }

    public static string NormalizeEmail(string? value)
    {
        return (value ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static HashSet<string> GetEnabledDomains(IConfiguration configuration)
    {
        var familyTreeSection = configuration.GetSection("FeatureAccess:familytree");
        var directDomains = familyTreeSection.Get<string[]>();
        var nestedDomains = familyTreeSection.GetSection("domains").Get<string[]>();

        var domains = directDomains?.Length > 0 ? directDomains : nestedDomains;
        return new HashSet<string>((domains ?? Array.Empty<string>()).Select(NormalizeDomain), StringComparer.OrdinalIgnoreCase);
    }

    private static IReadOnlyCollection<string> GetManagedDomains(IConfiguration configuration, string email)
    {
        var managedByEmail = configuration
            .GetSection("FeatureAccess:familytree:adminManagedDomains")
            .Get<Dictionary<string, string[]>>() ?? new Dictionary<string, string[]>();

        if (!managedByEmail.TryGetValue(email, out var domains))
        {
            var normalizedEmail = NormalizeEmail(email);
            var entry = managedByEmail.FirstOrDefault(pair => NormalizeEmail(pair.Key) == normalizedEmail);
            domains = entry.Value;
        }

        return (domains ?? Array.Empty<string>()).Select(NormalizeDomain).ToArray();
    }
}