using MongoDB.Bson.Serialization.Attributes;

namespace KanKan.API.Models.Entities;

[BsonIgnoreExtraElements]
public class AppAccessConfig
{
    public string Id { get; set; } = "access-config";
    public List<DomainVisibilityRule> DomainVisibilityRules { get; set; } = new();
    public List<FeatureDomainAccess> FeatureDomainAccess { get; set; } = new();
    public List<AdminUserAccess> AdminUsers { get; set; } = new();
    public List<FamilyTreeManagerAccess> FamilyTreeManagers { get; set; } = new();
    public DateTime UpdatedAt { get; set; }
}

public class DomainVisibilityRule
{
    public string SourceDomain { get; set; } = string.Empty;
    public string TargetDomain { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

public class FeatureDomainAccess
{
    public string Feature { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

public class AdminUserAccess
{
    public string Email { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

public class FamilyTreeManagerAccess
{
    public string AdminEmail { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}