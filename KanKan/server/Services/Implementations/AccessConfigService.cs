using MongoDB.Driver;
using KanKan.API.Domain;
using KanKan.API.Models.DTOs.Admin;
using KanKan.API.Models.Entities;
using KanKan.API.Services.Interfaces;

namespace KanKan.API.Services.Implementations;

public class ConfigurationAccessConfigService : IAccessConfigService
{
    protected readonly IConfiguration Configuration;
    private AccessConfigSnapshot _snapshot;

    public ConfigurationAccessConfigService(IConfiguration configuration)
    {
        Configuration = configuration;
        _snapshot = BuildFromConfiguration(configuration);
        DomainRules.ConfigureVisibility(_snapshot.ToDomainVisibilityMap());
    }

    public AccessConfigSnapshot Snapshot => _snapshot;

    public bool IsAdminEmail(string email)
    {
        return _snapshot.GetAdminEmails().Contains(AccessConfigSnapshot.NormalizeEmail(email));
    }

    public virtual Task<AccessConfigSnapshot> LoadAsync(CancellationToken cancellationToken = default)
    {
        _snapshot = BuildFromConfiguration(Configuration);
        DomainRules.ConfigureVisibility(_snapshot.ToDomainVisibilityMap());
        return Task.FromResult(_snapshot);
    }

    public virtual Task<AccessConfigSnapshot> SaveAsync(AccessConfigDto dto, CancellationToken cancellationToken = default)
    {
        _snapshot = Normalize(ToEntity(dto));
        DomainRules.ConfigureVisibility(_snapshot.ToDomainVisibilityMap());
        return Task.FromResult(_snapshot);
    }

    protected static AccessConfigSnapshot BuildFromConfiguration(IConfiguration configuration)
    {
        var domainVisibility = configuration.GetSection("DomainVisibility")
            .Get<Dictionary<string, string[]>>() ?? new Dictionary<string, string[]>();

        var familyDomains = configuration.GetSection("FeatureAccess:familytree:domains").Get<string[]>()
            ?? configuration.GetSection("FeatureAccess:familytree").Get<string[]>()
            ?? Array.Empty<string>();

        var adminEmails = configuration.GetSection("AdminEmails").Get<string[]>() ?? Array.Empty<string>();
        var managers = configuration.GetSection("FeatureAccess:familytree:adminManagedDomains")
            .Get<Dictionary<string, string[]>>() ?? new Dictionary<string, string[]>();

        return Normalize(new AppAccessConfig
        {
            DomainVisibilityRules = domainVisibility
                .SelectMany(pair => pair.Value.Select(target => new DomainVisibilityRule
                {
                    SourceDomain = pair.Key,
                    TargetDomain = target,
                    Enabled = true
                }))
                .ToList(),
            FeatureDomainAccess = familyDomains
                .Select(domain => new FeatureDomainAccess { Feature = "familytree", Domain = domain, Enabled = true })
                .ToList(),
            AdminUsers = adminEmails
                .Select(email => new AdminUserAccess { Email = email, Enabled = true })
                .ToList(),
            FamilyTreeManagers = managers
                .SelectMany(pair => pair.Value.Select(domain => new FamilyTreeManagerAccess
                {
                    AdminEmail = pair.Key,
                    Domain = domain,
                    Enabled = true
                }))
                .ToList()
        });
    }

    protected static AppAccessConfig ToEntity(AccessConfigDto dto)
    {
        return new AppAccessConfig
        {
            DomainVisibilityRules = dto.DomainVisibilityRules.Select(row => new DomainVisibilityRule
            {
                SourceDomain = row.SourceDomain,
                TargetDomain = row.TargetDomain,
                Enabled = row.Enabled
            }).ToList(),
            FeatureDomainAccess = dto.FeatureDomainAccess.Select(row => new FeatureDomainAccess
            {
                Feature = string.IsNullOrWhiteSpace(row.Feature) ? "familytree" : row.Feature,
                Domain = row.Domain,
                Enabled = row.Enabled
            }).ToList(),
            AdminUsers = dto.AdminUsers.Select(row => new AdminUserAccess
            {
                Email = row.Email,
                Enabled = row.Enabled
            }).ToList(),
            FamilyTreeManagers = dto.FamilyTreeManagers.Select(row => new FamilyTreeManagerAccess
            {
                AdminEmail = row.AdminEmail,
                Domain = row.Domain,
                Enabled = row.Enabled
            }).ToList()
        };
    }

    protected static AccessConfigSnapshot Normalize(AppAccessConfig config)
    {
        return new AccessConfigSnapshot
        {
            DomainVisibilityRules = config.DomainVisibilityRules
                .Select(row => new DomainVisibilityRule
                {
                    SourceDomain = AccessConfigSnapshot.NormalizeDomain(row.SourceDomain),
                    TargetDomain = AccessConfigSnapshot.NormalizeDomain(row.TargetDomain),
                    Enabled = row.Enabled
                })
                .Where(row => row.SourceDomain.Length > 0 && row.TargetDomain.Length > 0)
                .GroupBy(row => $"{row.SourceDomain}|{row.TargetDomain}", StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(row => row.SourceDomain)
                .ThenBy(row => row.TargetDomain)
                .ToArray(),
            FeatureDomainAccess = config.FeatureDomainAccess
                .Select(row => new FeatureDomainAccess
                {
                    Feature = string.IsNullOrWhiteSpace(row.Feature) ? "familytree" : row.Feature.Trim().ToLowerInvariant(),
                    Domain = AccessConfigSnapshot.NormalizeDomain(row.Domain),
                    Enabled = row.Enabled
                })
                .Where(row => row.Domain.Length > 0)
                .GroupBy(row => $"{row.Feature}|{row.Domain}", StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(row => row.Feature)
                .ThenBy(row => row.Domain)
                .ToArray(),
            AdminUsers = config.AdminUsers
                .Select(row => new AdminUserAccess
                {
                    Email = AccessConfigSnapshot.NormalizeEmail(row.Email),
                    Enabled = row.Enabled
                })
                .Where(row => row.Email.Length > 0)
                .GroupBy(row => row.Email, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(row => row.Email)
                .ToArray(),
            FamilyTreeManagers = config.FamilyTreeManagers
                .Select(row => new FamilyTreeManagerAccess
                {
                    AdminEmail = AccessConfigSnapshot.NormalizeEmail(row.AdminEmail),
                    Domain = AccessConfigSnapshot.NormalizeDomain(row.Domain),
                    Enabled = row.Enabled
                })
                .Where(row => row.AdminEmail.Length > 0 && row.Domain.Length > 0)
                .GroupBy(row => $"{row.AdminEmail}|{row.Domain}", StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(row => row.AdminEmail)
                .ThenBy(row => row.Domain)
                .ToArray()
        };
    }

    protected static AccessConfigDto ToDto(AccessConfigSnapshot snapshot)
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

public class MongoAccessConfigService : ConfigurationAccessConfigService
{
    private readonly IMongoCollection<AppAccessConfig> _collection;
    private readonly SemaphoreSlim _loadLock = new(1, 1);

    public MongoAccessConfigService(IMongoClient mongoClient, IConfiguration configuration)
        : base(configuration)
    {
        var database = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = database.GetCollection<AppAccessConfig>(configuration["MongoDB:Collections:AppAccessConfig"] ?? "AppAccessConfig");
    }

    public override async Task<AccessConfigSnapshot> LoadAsync(CancellationToken cancellationToken = default)
    {
        await _loadLock.WaitAsync(cancellationToken);
        try
        {
            var entity = await _collection.Find(x => x.Id == "access-config").FirstOrDefaultAsync(cancellationToken);
            if (entity == null)
            {
                var fallback = BuildFromConfiguration(Configuration);
                entity = ToEntity(ToDto(fallback));
                entity.Id = "access-config";
                entity.UpdatedAt = DateTime.UtcNow;
                await _collection.ReplaceOneAsync(
                    x => x.Id == entity.Id,
                    entity,
                    new ReplaceOptions { IsUpsert = true },
                    cancellationToken);
            }

            var snapshot = Normalize(entity);
            await SaveToCacheAsync(snapshot, cancellationToken);
            return Snapshot;
        }
        finally
        {
            _loadLock.Release();
        }
    }

    public override async Task<AccessConfigSnapshot> SaveAsync(AccessConfigDto dto, CancellationToken cancellationToken = default)
    {
        var entity = ToEntity(dto);
        entity.Id = "access-config";
        entity.UpdatedAt = DateTime.UtcNow;
        var snapshot = Normalize(entity);

        var normalizedEntity = ToEntity(ToDto(snapshot));
        normalizedEntity.Id = entity.Id;
        normalizedEntity.UpdatedAt = entity.UpdatedAt;

        await _collection.ReplaceOneAsync(
            x => x.Id == entity.Id,
            normalizedEntity,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);

        await SaveToCacheAsync(snapshot, cancellationToken);
        return Snapshot;
    }

    private Task SaveToCacheAsync(AccessConfigSnapshot snapshot, CancellationToken cancellationToken)
    {
        base.SaveAsync(ToDto(snapshot), cancellationToken);
        return Task.CompletedTask;
    }
}

public class AccessConfigHostedService : IHostedService
{
    private readonly IAccessConfigService _accessConfigService;

    public AccessConfigHostedService(IAccessConfigService accessConfigService)
    {
        _accessConfigService = accessConfigService;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await _accessConfigService.LoadAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}