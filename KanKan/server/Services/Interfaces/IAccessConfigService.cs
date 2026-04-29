using KanKan.API.Models.DTOs.Admin;
using KanKan.API.Models.Entities;

namespace KanKan.API.Services.Interfaces;

public interface IAccessConfigService
{
    AccessConfigSnapshot Snapshot { get; }
    bool IsAdminEmail(string email);
    Task<AccessConfigSnapshot> LoadAsync(CancellationToken cancellationToken = default);
    Task<AccessConfigSnapshot> SaveAsync(AccessConfigDto dto, CancellationToken cancellationToken = default);
}

public class AccessConfigSnapshot
{
    public IReadOnlyList<DomainVisibilityRule> DomainVisibilityRules { get; init; } = Array.Empty<DomainVisibilityRule>();
    public IReadOnlyList<FeatureDomainAccess> FeatureDomainAccess { get; init; } = Array.Empty<FeatureDomainAccess>();
    public IReadOnlyList<AdminUserAccess> AdminUsers { get; init; } = Array.Empty<AdminUserAccess>();
    public IReadOnlyList<FamilyTreeManagerAccess> FamilyTreeManagers { get; init; } = Array.Empty<FamilyTreeManagerAccess>();

    public HashSet<string> GetEnabledFamilyTreeDomains()
    {
        return new HashSet<string>(
            FeatureDomainAccess
                .Where(row => row.Enabled && string.Equals(row.Feature, "familytree", StringComparison.OrdinalIgnoreCase))
                .Select(row => NormalizeDomain(row.Domain))
                .Where(domain => domain.Length > 0),
            StringComparer.OrdinalIgnoreCase);
    }

    public HashSet<string> GetAdminEmails()
    {
        return new HashSet<string>(
            AdminUsers
                .Where(row => row.Enabled)
                .Select(row => NormalizeEmail(row.Email))
                .Where(email => email.Length > 0),
            StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyCollection<string> GetManagedDomains(string email)
    {
        var normalizedEmail = NormalizeEmail(email);
        return FamilyTreeManagers
            .Where(row => row.Enabled && NormalizeEmail(row.AdminEmail) == normalizedEmail)
            .Select(row => NormalizeDomain(row.Domain))
            .Where(domain => domain.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public Dictionary<string, string[]> ToDomainVisibilityMap()
    {
        return DomainVisibilityRules
            .Where(row => row.Enabled)
            .Select(row => new
            {
                Source = NormalizeDomain(row.SourceDomain),
                Target = NormalizeDomain(row.TargetDomain)
            })
            .Where(row => row.Source.Length > 0 && row.Target.Length > 0)
            .GroupBy(row => row.Source, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group.Select(row => row.Target).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(),
                StringComparer.OrdinalIgnoreCase);
    }

    public static string NormalizeDomain(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized.StartsWith("@", StringComparison.Ordinal) ? normalized[1..] : normalized;
    }

    public static string NormalizeEmail(string? value)
    {
        return (value ?? string.Empty).Trim().ToLowerInvariant();
    }
}