namespace KanKan.API.Models.DTOs.Admin;

public class AccessConfigDto
{
    public List<DomainVisibilityRuleDto> DomainVisibilityRules { get; set; } = new();
    public List<FeatureDomainAccessDto> FeatureDomainAccess { get; set; } = new();
    public List<AdminUserAccessDto> AdminUsers { get; set; } = new();
    public List<FamilyTreeManagerAccessDto> FamilyTreeManagers { get; set; } = new();
}

public class DomainVisibilityRuleDto
{
    public string SourceDomain { get; set; } = string.Empty;
    public string TargetDomain { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

public class FeatureDomainAccessDto
{
    public string Feature { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

public class AdminUserAccessDto
{
    public string Email { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

public class FamilyTreeManagerAccessDto
{
    public string AdminEmail { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}

public class AccessConfigResponseDto
{
    public AccessConfigDto Config { get; set; } = new();
    public List<FamilyTreeDomainPermissionDto> FamilyTreeDomains { get; set; } = new();
    public List<FamilyTreeUserPermissionDto> FamilyTreeUsers { get; set; } = new();
    public List<DomainVisibilityPreviewDto> DomainVisibilityPreview { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
}

public class FamilyTreeDomainPermissionDto
{
    public string Domain { get; set; } = string.Empty;
    public bool FeatureEnabled { get; set; }
    public List<string> CanCreateManage { get; set; } = new();
    public string CanViewByDefault { get; set; } = string.Empty;
    public int TreeCount { get; set; }
}

public class FamilyTreeUserPermissionDto
{
    public string Email { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public bool UserExists { get; set; }
    public bool IsAdmin { get; set; }
    public bool OwnDomainEnabled { get; set; }
    public List<string> ManagedDomains { get; set; } = new();
    public List<string> CanViewDomains { get; set; } = new();
    public List<string> CanEditDomains { get; set; } = new();
}

public class DomainVisibilityPreviewDto
{
    public string ViewerDomain { get; set; } = string.Empty;
    public string TargetDomain { get; set; } = string.Empty;
    public bool CanSee { get; set; }
    public string Reason { get; set; } = string.Empty;
}