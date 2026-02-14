namespace KanKan.API.Domain;

public static class DomainRules
{
    public const string SuperDomain = "kankan";
    private static IReadOnlyDictionary<string, HashSet<string>> _isolationMap =
        new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
    private static IReadOnlyDictionary<string, HashSet<string>> _visibilityMap =
        new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);

    public static string Normalize(string? value)
    {
        return (value ?? string.Empty).Trim().ToLowerInvariant();
    }

    public static void ConfigureIsolation(IDictionary<string, string[]>? rules)
    {
        var map = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        if (rules != null)
        {
            foreach (var pair in rules)
            {
                var viewer = NormalizeDomain(pair.Key);
                if (string.IsNullOrWhiteSpace(viewer))
                    continue;

                var targets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (pair.Value != null)
                {
                    foreach (var target in pair.Value)
                    {
                        var normalizedTarget = NormalizeDomain(target);
                        if (string.IsNullOrWhiteSpace(normalizedTarget))
                            continue;

                        if (string.Equals(normalizedTarget, viewer, StringComparison.OrdinalIgnoreCase))
                            continue;

                        targets.Add(normalizedTarget);
                    }
                }

                if (targets.Count > 0)
                    map[viewer] = targets;
            }
        }

        _isolationMap = map;
    }

    public static void ConfigureVisibility(IDictionary<string, string[]>? rules)
    {
        var map = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        if (rules != null)
        {
            foreach (var pair in rules)
            {
                var viewer = NormalizeDomain(pair.Key);
                if (string.IsNullOrWhiteSpace(viewer))
                    continue;

                var targets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (pair.Value != null)
                {
                    foreach (var target in pair.Value)
                    {
                        var normalizedTarget = NormalizeDomain(target);
                        if (string.IsNullOrWhiteSpace(normalizedTarget))
                            continue;

                        if (string.Equals(normalizedTarget, viewer, StringComparison.OrdinalIgnoreCase))
                            continue;

                        targets.Add(normalizedTarget);
                    }
                }

                if (targets.Count > 0)
                    map[viewer] = targets;
            }
        }

        _visibilityMap = map;
    }

    public static string GetDomain(string? emailOrId)
    {
        var normalized = Normalize(emailOrId);
        if (string.IsNullOrWhiteSpace(normalized))
            return string.Empty;

        var at = normalized.LastIndexOf('@');
        if (at < 0)
            return normalized;

        if (at >= normalized.Length - 1)
            return string.Empty;

        return normalized[(at + 1)..];
    }

    public static bool IsSuperDomain(string? domain)
    {
        return string.Equals(Normalize(domain), SuperDomain, StringComparison.Ordinal);
    }

    public static bool IsPowerUser(string? domain, bool isAdmin)
    {
        return isAdmin && IsSuperDomain(domain);
    }

    public static string BuildVerificationCode(string? domain)
    {
        var normalized = Normalize(domain);
        if (string.IsNullOrWhiteSpace(normalized))
            return "520";

        if (IsSuperDomain(normalized))
            return $"580{normalized}";

        return $"520{normalized}";
    }

    public static bool CanAccess(string? viewerDomain, string? targetDomain)
    {
        var viewer = NormalizeDomain(viewerDomain);
        var target = NormalizeDomain(targetDomain);

        if (string.IsNullOrWhiteSpace(viewer) || string.IsNullOrWhiteSpace(target))
            return false;

        if (string.Equals(viewer, target, StringComparison.Ordinal))
            return true;

        if (IsSuperDomain(target) && !IsSuperDomain(viewer))
            return false;

        if (IsVisibleDomain(viewer, target))
            return true;

        if (IsIsolationBlocked(viewer, target))
            return false;

        if (IsSuperDomain(viewer) || IsSuperDomain(target))
            return true;

        return false;
    }

    public static bool IsVisibleDomain(string? viewerDomain, string? targetDomain)
    {
        var viewer = NormalizeDomain(viewerDomain);
        var target = NormalizeDomain(targetDomain);

        if (string.IsNullOrWhiteSpace(viewer) || string.IsNullOrWhiteSpace(target))
            return false;

        if (string.Equals(viewer, target, StringComparison.Ordinal))
            return true;

        if (_visibilityMap.TryGetValue(viewer, out var targets) && targets.Contains(target))
            return true;

        return _visibilityMap.TryGetValue(target, out var reverseTargets) && reverseTargets.Contains(viewer);
    }

    public static bool IsIsolationBlocked(string? viewerDomain, string? targetDomain)
    {
        var viewer = NormalizeDomain(viewerDomain);
        var target = NormalizeDomain(targetDomain);

        if (string.IsNullOrWhiteSpace(viewer) || string.IsNullOrWhiteSpace(target))
            return false;

        if (string.Equals(viewer, target, StringComparison.Ordinal))
            return false;

        return _isolationMap.TryGetValue(viewer, out var targets) && targets.Contains(target);
    }

    private static string NormalizeDomain(string? value)
    {
        var normalized = Normalize(value);
        return normalized.StartsWith('@') ? normalized[1..] : normalized;
    }

    public static bool IsValidAccount(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        if (normalized.Contains(' '))
            return false;

        var firstAt = normalized.IndexOf('@');
        if (firstAt < 0)
            return true;

        var lastAt = normalized.LastIndexOf('@');
        if (firstAt != lastAt)
            return false;

        return firstAt > 0 && firstAt < normalized.Length - 1;
    }
}
