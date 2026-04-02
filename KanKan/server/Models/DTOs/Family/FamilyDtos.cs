namespace KanKan.API.Models.DTOs.Family;

// ─── Request DTOs ───────────────────────────────────────────────────────────

public class CreateFamilyTreeRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Surname { get; set; }
    public string? Domain { get; set; }
    public int RootGeneration { get; set; } = 1;
    public List<string>? ZibeiPoem { get; set; }
}

public class UpdateFamilyTreeRequest
{
    public string? Name { get; set; }
    public string? Surname { get; set; }
    public int? RootGeneration { get; set; }
    public List<string>? ZibeiPoem { get; set; }
}

public class UpdateFamilyTreeVisibilityRequest
{
    public List<string>? UserViewers { get; set; }
    public List<string>? UserEditors { get; set; }
    public List<string>? DomainViewers { get; set; }
    public List<string>? DomainEditors { get; set; }
}

public class FamilyDateDto
{
    public int Year { get; set; }
    public int? Month { get; set; }
    public int? Day { get; set; }
    public string? CalendarType { get; set; }
    public bool? IsLeapMonth { get; set; }
}

public class FamilyPhotoDto
{
    public string Id { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string? Caption { get; set; }
    public int? Year { get; set; }
}

public class FamilyExperienceDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "other";
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? StartYear { get; set; }
    public int? EndYear { get; set; }
}

public class UpsertFamilyPersonRequest
{
    public string? Name { get; set; }
    public List<string>? Aliases { get; set; }
    public string? Gender { get; set; }
    public int? Generation { get; set; }
    public string? LinkedTreeId { get; set; }
    public string? LinkedPersonId { get; set; }
    public bool? ClearLinkedPerson { get; set; }
    public FamilyDateDto? BirthDate { get; set; }
    public FamilyDateDto? DeathDate { get; set; }
    public string? BirthPlace { get; set; }
    public string? DeathPlace { get; set; }
    public bool? IsAlive { get; set; }
    public string? AvatarUrl { get; set; }
    public List<FamilyPhotoDto>? Photos { get; set; }
    public string? Occupation { get; set; }
    public string? Education { get; set; }
    public string? Biography { get; set; }
    public string? BriefNote { get; set; }
    public List<FamilyExperienceDto>? Experiences { get; set; }
    public bool? ClearBirthDate { get; set; }
    public bool? ClearDeathDate { get; set; }
}

public class CreateFamilyRelationshipRequest
{
    public string Type { get; set; } = string.Empty;
    public string FromId { get; set; } = string.Empty;
    public string ToId { get; set; } = string.Empty;
    public string? ParentRole { get; set; }
    public string? ChildStatus { get; set; }
    public string? LineageType { get; set; }
    public string? DisplayTag { get; set; }
    public string? SourceParentId { get; set; }
    public int? SourceChildRank { get; set; }
    public int SortOrder { get; set; }
    public string? UnionType { get; set; }
    public int? StartYear { get; set; }
    public int? EndYear { get; set; }
    public string? Notes { get; set; }
}

public class UpdateFamilyRelationshipRequest
{
    public string? ParentRole { get; set; }
    public string? ChildStatus { get; set; }
    public string? LineageType { get; set; }
    public string? DisplayTag { get; set; }
    public string? SourceParentId { get; set; }
    public int? SourceChildRank { get; set; }
    public int? SortOrder { get; set; }
    public string? Notes { get; set; }
}

public class FamilyAttachmentDto
{
    public string Id { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Filename { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
}

public class UpsertFamilyDocumentRequest
{
    public string? Type { get; set; }
    public string? Title { get; set; }
    public string? Body { get; set; }
    public string? CoverImageUrl { get; set; }
    public List<FamilyAttachmentDto>? Attachments { get; set; }
    public List<string>? Tags { get; set; }
    public List<string>? LinkedPersonIds { get; set; }
    public int? GenerationFrom { get; set; }
    public int? GenerationTo { get; set; }
}

// ─── Response DTOs ──────────────────────────────────────────────────────────

public class FamilyTreeResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Surname { get; set; }
    public string Domain { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public int RootGeneration { get; set; }
    public List<string> ZibeiPoem { get; set; } = new();
    public bool CanManagePermissions { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
}

public class FamilyPersonResponse
{
    public string Id { get; set; } = string.Empty;
    public string TreeId { get; set; } = string.Empty;
    public string? LinkedTreeId { get; set; }
    public string? LinkedPersonId { get; set; }
    public string? LinkedTreeName { get; set; }
    public string? LinkedPersonName { get; set; }
    public string Name { get; set; } = string.Empty;
    public List<string> Aliases { get; set; } = new();
    public string Gender { get; set; } = "male";
    public int Generation { get; set; }
    public FamilyDateDto? BirthDate { get; set; }
    public FamilyDateDto? DeathDate { get; set; }
    public string? BirthPlace { get; set; }
    public string? DeathPlace { get; set; }
    public bool? IsAlive { get; set; }
    public string? AvatarUrl { get; set; }
    public List<FamilyPhotoDto> Photos { get; set; } = new();
    public string? Occupation { get; set; }
    public string? Education { get; set; }
    public string? Biography { get; set; }
    public string? BriefNote { get; set; }
    public List<FamilyExperienceDto> Experiences { get; set; } = new();
}

public class FamilyRelationshipResponse
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string FromId { get; set; } = string.Empty;
    public string ToId { get; set; } = string.Empty;
    public string? ParentRole { get; set; }
    public string? ChildStatus { get; set; }
    public string? LineageType { get; set; }
    public string? DisplayTag { get; set; }
    public string? SourceParentId { get; set; }
    public int? SourceChildRank { get; set; }
    public int SortOrder { get; set; }
    public string? UnionType { get; set; }
    public int? StartYear { get; set; }
    public int? EndYear { get; set; }
    public string? Notes { get; set; }
}

public class FamilyDocumentResponse
{
    public string Id { get; set; } = string.Empty;
    public string TreeId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Body { get; set; }
    public string? CoverImageUrl { get; set; }
    public List<FamilyAttachmentDto> Attachments { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public List<string> LinkedPersonIds { get; set; } = new();
    public int? GenerationFrom { get; set; }
    public int? GenerationTo { get; set; }
    public string AuthorId { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
}

public class FullFamilyTreeResponse
{
    public FamilyTreeResponse Tree { get; set; } = new();
    public List<FamilyPersonResponse> Persons { get; set; } = new();
    public List<FamilyRelationshipResponse> Relationships { get; set; } = new();
}

public class FamilyTreeVisibilityResponse
{
    public string TreeId { get; set; } = string.Empty;
    public List<string> UserViewers { get; set; } = new();
    public List<string> UserEditors { get; set; } = new();
    public List<string> DomainViewers { get; set; } = new();
    public List<string> DomainEditors { get; set; } = new();
}

public class FamilyTreeArchiveTreeDto
{
    public string SourceTreeId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Surname { get; set; }
    public string Domain { get; set; } = string.Empty;
    public int RootGeneration { get; set; }
    public List<string> ZibeiPoem { get; set; } = new();
}

public class FamilyArchivedPhotoDto
{
    public string Id { get; set; } = string.Empty;
    public string? Url { get; set; }
    public string? ArchivePath { get; set; }
    public string? Caption { get; set; }
    public int? Year { get; set; }
}

public class FamilyArchivedPersonDto
{
    public string Id { get; set; } = string.Empty;
    public string TreeId { get; set; } = string.Empty;
    public string? LinkedTreeId { get; set; }
    public string? LinkedPersonId { get; set; }
    public string? LinkedTreeName { get; set; }
    public string? LinkedPersonName { get; set; }
    public string Name { get; set; } = string.Empty;
    public List<string> Aliases { get; set; } = new();
    public string Gender { get; set; } = "male";
    public int Generation { get; set; }
    public FamilyDateDto? BirthDate { get; set; }
    public FamilyDateDto? DeathDate { get; set; }
    public string? BirthPlace { get; set; }
    public string? DeathPlace { get; set; }
    public bool? IsAlive { get; set; }
    public string? AvatarUrl { get; set; }
    public string? AvatarArchivePath { get; set; }
    public List<FamilyArchivedPhotoDto> Photos { get; set; } = new();
    public string? Occupation { get; set; }
    public string? Education { get; set; }
    public string? Biography { get; set; }
    public string? BriefNote { get; set; }
    public List<FamilyExperienceDto> Experiences { get; set; } = new();
}

public class FamilyTreeArchiveResponse
{
    public int FormatVersion { get; set; } = 1;
    public string ExportedAt { get; set; } = string.Empty;
    public FamilyTreeArchiveTreeDto Tree { get; set; } = new();
    public FamilyTreeVisibilityResponse? Visibility { get; set; }
    public List<FamilyArchivedPersonDto> Persons { get; set; } = new();
    public List<FamilyRelationshipResponse> Relationships { get; set; } = new();
}

// ─── Import shape (Final.html nested JSON) ──────────────────────────────────

public class NestedPersonImport
{
    public string Name { get; set; } = string.Empty;
    public string? Gender { get; set; }
    public string? Spouse { get; set; }
    public string? SpouseGender { get; set; }
    public int? BirthYear { get; set; }
    public int? DeathYear { get; set; }
    public int? Age { get; set; }
    public List<NestedPersonImport>? Children { get; set; }
}
