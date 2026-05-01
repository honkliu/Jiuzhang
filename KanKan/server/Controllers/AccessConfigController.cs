using System.Security.Claims;
using KanKan.API.Domain;
using KanKan.API.Models.DTOs.Admin;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/admin/access-config")]
public class AccessConfigController : ControllerBase
{
    private const string RootAdminEmail = "kankan@kankan";
    private readonly IAccessConfigService _accessConfig;
    private readonly IUserRepository _userRepository;
    private readonly IFamilyTreeRepository _familyTreeRepository;

    public AccessConfigController(
        IAccessConfigService accessConfig,
        IUserRepository userRepository,
        IFamilyTreeRepository familyTreeRepository)
    {
        _accessConfig = accessConfig;
        _userRepository = userRepository;
        _familyTreeRepository = familyTreeRepository;
    }

    [HttpGet]
    public async Task<IActionResult> GetConfig()
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();
        if (!currentUser.IsAdmin) return Forbid();

        await _accessConfig.LoadAsync(HttpContext.RequestAborted);
        return Ok(await BuildResponseAsync(_accessConfig.Snapshot, currentUser));
    }

    [HttpPut]
    public async Task<IActionResult> SaveConfig([FromBody] AccessConfigDto dto)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser == null) return Unauthorized();
        if (!currentUser.IsAdmin) return Forbid();

        var currentConfig = ToDto(_accessConfig.Snapshot);
        if (CanManageGlobalAccess(currentUser))
        {
            // Root admin can manage the global config and bootstrap family manager grants.
        }
        else
        {
            dto.AdminUsers = currentConfig.AdminUsers;
            dto.DomainVisibilityRules = currentConfig.DomainVisibilityRules;
            dto.FeatureDomainAccess = currentConfig.FeatureDomainAccess;
            dto.FamilyTreeManagers = MergePermittedFamilyManagers(
                currentConfig.FamilyTreeManagers,
                dto.FamilyTreeManagers,
                FamilyAccessPolicy.GetEditableDomains(_accessConfig.Snapshot, currentUser));
        }

        var snapshot = await _accessConfig.SaveAsync(dto, HttpContext.RequestAborted);
        await RefreshKnownAdminFlagsAsync(snapshot, currentUser);
        return Ok(await BuildResponseAsync(snapshot, currentUser));
    }

    private static bool CanManageGlobalAccess(User user)
    {
        return string.Equals(
            AccessConfigSnapshot.NormalizeEmail(user.Email),
            RootAdminEmail,
            StringComparison.OrdinalIgnoreCase);
    }

    private async Task<User?> GetCurrentUserAsync()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? string.Empty;
        return string.IsNullOrWhiteSpace(userId) ? null : await _userRepository.GetByIdAsync(userId);
    }

    private async Task RefreshKnownAdminFlagsAsync(AccessConfigSnapshot snapshot, User currentUser)
    {
        var candidates = new Dictionary<string, User>(StringComparer.OrdinalIgnoreCase)
        {
            [currentUser.Email] = currentUser
        };

        foreach (var user in await _userRepository.GetAllUsersAsync(string.Empty, 1000))
        {
            candidates[user.Email] = user;
        }

        foreach (var email in snapshot.GetAdminEmails())
        {
            var user = await _userRepository.GetByEmailAsync(email);
            if (user != null) candidates[user.Email] = user;
        }

        foreach (var user in candidates.Values)
        {
            var shouldBeAdmin = snapshot.GetAdminEmails().Contains(AccessConfigSnapshot.NormalizeEmail(user.Email));
            if (user.IsAdmin == shouldBeAdmin) continue;
            user.IsAdmin = shouldBeAdmin;
            await _userRepository.UpdateAsync(user);
        }
    }

    private async Task<AccessConfigResponseDto> BuildResponseAsync(AccessConfigSnapshot snapshot, User currentUser)
    {
        var canManageGlobalAccess = CanManageGlobalAccess(currentUser);
        var scopedDomains = canManageGlobalAccess
            ? null
            : BuildScopedFamilyDomains(snapshot, currentUser);
        var config = canManageGlobalAccess ? ToDto(snapshot) : ToScopedDto(snapshot, scopedDomains!);
        var adminEmails = snapshot.GetAdminEmails();
        var enabledFamilyDomains = snapshot.GetEnabledFamilyTreeDomains();
        var warnings = BuildWarnings(snapshot, adminEmails, enabledFamilyDomains, scopedDomains);

        var domains = new HashSet<string>(enabledFamilyDomains, StringComparer.OrdinalIgnoreCase);
        foreach (var rule in snapshot.DomainVisibilityRules)
        {
            domains.Add(rule.SourceDomain);
            domains.Add(rule.TargetDomain);
        }
        foreach (var manager in snapshot.FamilyTreeManagers)
        {
            domains.Add(manager.Domain);
        }
        if (scopedDomains != null)
        {
            domains.IntersectWith(scopedDomains);
        }

        var familyTreeDomains = new List<FamilyTreeDomainPermissionDto>();
        foreach (var domain in domains.OrderBy(domain => domain))
        {
            var managers = BuildManagersForDomain(snapshot, domain, adminEmails, enabledFamilyDomains);
            var trees = enabledFamilyDomains.Contains(domain)
                ? await _familyTreeRepository.GetByDomainAsync(domain)
                : new List<FamilyTree>();

            familyTreeDomains.Add(new FamilyTreeDomainPermissionDto
            {
                Domain = domain,
                FeatureEnabled = enabledFamilyDomains.Contains(domain),
                CanCreateManage = managers,
                CanViewByDefault = enabledFamilyDomains.Contains(domain) ? $"All {domain} users" : "Nobody by domain config",
                TreeCount = trees.Count
            });
        }

        var familyUsers = await BuildUserRowsAsync(snapshot, currentUser, adminEmails, scopedDomains);
        var visibilityPreview = canManageGlobalAccess ? BuildDomainVisibilityPreview(snapshot) : new List<DomainVisibilityPreviewDto>();

        return new AccessConfigResponseDto
        {
            Config = config,
            FamilyTreeDomains = familyTreeDomains,
            FamilyTreeUsers = familyUsers,
            DomainVisibilityPreview = visibilityPreview,
            Warnings = warnings
        };
    }

    private static HashSet<string> BuildScopedFamilyDomains(AccessConfigSnapshot snapshot, User currentUser)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var enabledDomains = snapshot.GetEnabledFamilyTreeDomains();
        var currentDomain = FamilyAccessPolicy.ResolveDomain(currentUser);

        foreach (var domain in enabledDomains)
        {
            if (CanSeeDomainFromSnapshot(snapshot, currentDomain, domain))
            {
                result.Add(domain);
            }
        }

        foreach (var domain in FamilyAccessPolicy.GetEditableDomains(snapshot, currentUser))
        {
            result.Add(domain);
        }

        return result;
    }

    private static bool CanSeeDomainFromSnapshot(AccessConfigSnapshot snapshot, string viewerDomain, string targetDomain)
    {
        var viewer = AccessConfigSnapshot.NormalizeDomain(viewerDomain);
        var target = AccessConfigSnapshot.NormalizeDomain(targetDomain);
        if (viewer.Length == 0 || target.Length == 0) return false;
        if (string.Equals(viewer, target, StringComparison.OrdinalIgnoreCase)) return true;

        return snapshot.DomainVisibilityRules.Any(row =>
                {
                        if (!row.Enabled) return false;

                        var source = AccessConfigSnapshot.NormalizeDomain(row.SourceDomain);
                        var ruleTarget = AccessConfigSnapshot.NormalizeDomain(row.TargetDomain);
                        return (string.Equals(source, viewer, StringComparison.OrdinalIgnoreCase) &&
                                        string.Equals(ruleTarget, target, StringComparison.OrdinalIgnoreCase)) ||
                                     (string.Equals(source, target, StringComparison.OrdinalIgnoreCase) &&
                                        string.Equals(ruleTarget, viewer, StringComparison.OrdinalIgnoreCase));
                });
    }

    private async Task<List<FamilyTreeUserPermissionDto>> BuildUserRowsAsync(
        AccessConfigSnapshot snapshot,
        User currentUser,
        HashSet<string> adminEmails,
        HashSet<string>? scopedDomains)
    {
        var existingUsers = new Dictionary<string, User>(StringComparer.OrdinalIgnoreCase)
        {
            [currentUser.Email] = currentUser
        };
        var subjectEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            currentUser.Email
        };

        foreach (var email in adminEmails)
        {
            if (scopedDomains == null || scopedDomains.Contains(AccessConfigSnapshot.NormalizeDomain(DomainRules.GetDomain(email))))
            {
                subjectEmails.Add(email);
            }
        }
        foreach (var manager in snapshot.FamilyTreeManagers)
        {
            if (scopedDomains == null || scopedDomains.Contains(AccessConfigSnapshot.NormalizeDomain(manager.Domain)))
            {
                subjectEmails.Add(manager.AdminEmail);
            }
        }

        var enabledDomains = snapshot.GetEnabledFamilyTreeDomains();
        foreach (var user in await _userRepository.GetAllUsersAsync(string.Empty, 1000))
        {
            existingUsers[user.Email] = user;
        }

        foreach (var email in subjectEmails.ToArray())
        {
            if (existingUsers.ContainsKey(email)) continue;
            var user = await _userRepository.GetByEmailAsync(email);
            if (user != null) existingUsers[user.Email] = user;
        }

        return subjectEmails
            .Where(email => !string.IsNullOrWhiteSpace(email))
            .OrderBy(email => email)
            .Select(email =>
            {
                var userExists = existingUsers.TryGetValue(email, out var user);
                var domain = userExists && user != null
                    ? FamilyAccessPolicy.ResolveDomain(user)
                    : DomainRules.GetDomain(email);
                var projectedUser = new User
                {
                    Id = user?.Id ?? string.Empty,
                    Email = email,
                    Domain = user?.Domain ?? domain,
                    IsAdmin = adminEmails.Contains(AccessConfigSnapshot.NormalizeEmail(email))
                };

                var managedDomains = snapshot.GetManagedDomains(email)
                    .Where(domain => scopedDomains == null || scopedDomains.Contains(domain))
                    .ToList();
                var canViewDomains = FamilyAccessPolicy.GetVisibleDomains(snapshot, projectedUser)
                    .Where(domain => scopedDomains == null || scopedDomains.Contains(domain))
                    .ToList();
                var canEditDomains = FamilyAccessPolicy.GetEditableDomains(snapshot, projectedUser)
                    .Where(domain => scopedDomains == null || scopedDomains.Contains(domain))
                    .ToList();

                return new FamilyTreeUserPermissionDto
                {
                    Email = email,
                    Domain = domain,
                    UserExists = userExists,
                    IsAdmin = projectedUser.IsAdmin,
                    OwnDomainEnabled = enabledDomains.Contains(domain),
                    ManagedDomains = managedDomains,
                    CanViewDomains = canViewDomains,
                    CanEditDomains = canEditDomains
                };
            })
            .Where(row => scopedDomains == null || row.Email.Equals(currentUser.Email, StringComparison.OrdinalIgnoreCase) || row.ManagedDomains.Count > 0 || row.CanViewDomains.Count > 0 || row.CanEditDomains.Count > 0 || scopedDomains.Contains(row.Domain))
            .ToList();
    }

    private static List<string> BuildManagersForDomain(
        AccessConfigSnapshot snapshot,
        string domain,
        HashSet<string> adminEmails,
        HashSet<string> enabledFamilyDomains)
    {
        var managers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var adminEmail in adminEmails)
        {
            var adminDomain = AccessConfigSnapshot.NormalizeDomain(DomainRules.GetDomain(adminEmail));
            if (enabledFamilyDomains.Contains(adminDomain) && string.Equals(adminDomain, domain, StringComparison.OrdinalIgnoreCase))
            {
                managers.Add(adminEmail);
            }
        }

        foreach (var row in snapshot.FamilyTreeManagers.Where(row => row.Enabled && string.Equals(row.Domain, domain, StringComparison.OrdinalIgnoreCase)))
        {
            managers.Add(row.AdminEmail);
        }

        return managers.OrderBy(email => email).ToList();
    }

    private static List<FamilyTreeManagerAccessDto> MergePermittedFamilyManagers(
        List<FamilyTreeManagerAccessDto> currentRows,
        List<FamilyTreeManagerAccessDto> submittedRows,
        IReadOnlyCollection<string> permittedDomains)
    {
        var permitted = new HashSet<string>(permittedDomains.Select(AccessConfigSnapshot.NormalizeDomain), StringComparer.OrdinalIgnoreCase);
        return currentRows
            .Where(row => !permitted.Contains(AccessConfigSnapshot.NormalizeDomain(row.Domain)))
            .Concat(submittedRows.Where(row => permitted.Contains(AccessConfigSnapshot.NormalizeDomain(row.Domain))))
            .ToList();
    }

    private static List<DomainVisibilityPreviewDto> BuildDomainVisibilityPreview(AccessConfigSnapshot snapshot)
    {
        var domains = snapshot.DomainVisibilityRules
            .SelectMany(row => new[] { row.SourceDomain, row.TargetDomain })
            .Where(domain => domain.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(domain => domain)
            .ToArray();

        var rows = new List<DomainVisibilityPreviewDto>();
        foreach (var viewer in domains)
        {
            foreach (var target in domains)
            {
                var canSee = DomainRules.IsVisibleDomain(viewer, target);
                rows.Add(new DomainVisibilityPreviewDto
                {
                    ViewerDomain = viewer,
                    TargetDomain = target,
                    CanSee = canSee,
                    Reason = string.Equals(viewer, target, StringComparison.OrdinalIgnoreCase)
                        ? "Same domain"
                        : canSee
                            ? "Visibility rule or reverse rule"
                            : "No rule"
                });
            }
        }

        return rows;
    }

    private static List<string> BuildWarnings(
        AccessConfigSnapshot snapshot,
        HashSet<string> adminEmails,
        HashSet<string> enabledFamilyDomains,
        HashSet<string>? scopedDomains = null)
    {
        var warnings = new List<string>();

        foreach (var manager in snapshot.FamilyTreeManagers.Where(row => row.Enabled))
        {
            if (scopedDomains != null && !scopedDomains.Contains(AccessConfigSnapshot.NormalizeDomain(manager.Domain)))
            {
                continue;
            }
            if (!enabledFamilyDomains.Contains(manager.Domain))
            {
                warnings.Add($"{manager.Domain} is assigned to {manager.AdminEmail}, but the family tree feature is not enabled for that domain.");
            }
        }

        return warnings;
    }

    private static AccessConfigDto ToScopedDto(AccessConfigSnapshot snapshot, HashSet<string> scopedDomains)
    {
        return new AccessConfigDto
        {
            DomainVisibilityRules = new List<DomainVisibilityRuleDto>(),
            FeatureDomainAccess = new List<FeatureDomainAccessDto>(),
            AdminUsers = new List<AdminUserAccessDto>(),
            FamilyTreeManagers = snapshot.FamilyTreeManagers
                .Where(row => scopedDomains.Contains(AccessConfigSnapshot.NormalizeDomain(row.Domain)))
                .Select(row => new FamilyTreeManagerAccessDto
                {
                    AdminEmail = row.AdminEmail,
                    Domain = row.Domain,
                    Enabled = row.Enabled
                })
                .ToList()
        };
    }

    private static AccessConfigDto ToDto(AccessConfigSnapshot snapshot)
    {
        return new AccessConfigDto
        {
            DomainVisibilityRules = snapshot.DomainVisibilityRules.Select(row => new DomainVisibilityRuleDto
            {
                SourceDomain = row.SourceDomain,
                TargetDomain = row.TargetDomain,
                Enabled = row.Enabled
            }).ToList(),
            FeatureDomainAccess = snapshot.FeatureDomainAccess.Select(row => new FeatureDomainAccessDto
            {
                Feature = row.Feature,
                Domain = row.Domain,
                Enabled = row.Enabled
            }).ToList(),
            AdminUsers = snapshot.AdminUsers.Select(row => new AdminUserAccessDto
            {
                Email = row.Email,
                Enabled = row.Enabled
            }).ToList(),
            FamilyTreeManagers = snapshot.FamilyTreeManagers.Select(row => new FamilyTreeManagerAccessDto
            {
                AdminEmail = row.AdminEmail,
                Domain = row.Domain,
                Enabled = row.Enabled
            }).ToList()
        };
    }
}