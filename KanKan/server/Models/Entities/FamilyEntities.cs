namespace KanKan.API.Models.Entities;

public class FamilyDate
{
    public int Year { get; set; }
    public int? Month { get; set; }
    public int? Day { get; set; }
    public string? CalendarType { get; set; }
    public bool? IsLeapMonth { get; set; }
}

public class FamilyPhoto
{
    public string Id { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string? Caption { get; set; }
    public int? Year { get; set; }
}

public class FamilyExperience
{
    public string Id { get; set; } = string.Empty;
    // "work" | "education" | "military" | "milestone" | "other"
    public string Type { get; set; } = "other";
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? StartYear { get; set; }
    public int? EndYear { get; set; }
}

public class FamilyAttachment
{
    public string Id { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Filename { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
}

public class FamilyTree
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Surname { get; set; }
    public string OwnerId { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public int RootGeneration { get; set; } = 1;
    public List<string> ZibeiPoem { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class FamilyPerson
{
    public string Id { get; set; } = string.Empty;
    public string TreeId { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string? LinkedTreeId { get; set; }
    public string? LinkedPersonId { get; set; }
    public string Name { get; set; } = string.Empty;
    public List<string> Aliases { get; set; } = new();
    // "male" | "female" | "unknown"
    public string Gender { get; set; } = "male";
    public int Generation { get; set; }
    public FamilyDate? BirthDate { get; set; }
    public FamilyDate? DeathDate { get; set; }
    public string? BirthPlace { get; set; }
    public string? DeathPlace { get; set; }
    public bool? IsAlive { get; set; }
    public string? AvatarUrl { get; set; }
    public List<FamilyPhoto> Photos { get; set; } = new();
    public string? Occupation { get; set; }
    public string? Education { get; set; }
    public string? Biography { get; set; }
    public string? BriefNote { get; set; }
    public List<FamilyExperience> Experiences { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class FamilyRelationship
{
    public string Id { get; set; } = string.Empty;
    public string TreeId { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    // "parent-child" | "spouse"
    public string Type { get; set; } = string.Empty;
    public string FromId { get; set; } = string.Empty;
    public string ToId { get; set; } = string.Empty;
    // parent-child fields
    public string? ParentRole { get; set; }
    public string? ChildStatus { get; set; }
    public int SortOrder { get; set; }
    // spouse fields
    public string? UnionType { get; set; }
    public int? StartYear { get; set; }
    public int? EndYear { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class FamilyDocument
{
    public string Id { get; set; } = string.Empty;
    public string TreeId { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    // "history" | "photo-album" | "celebration" | "certificate" | "record" | "announcement"
    public string Type { get; set; } = "history";
    public string Title { get; set; } = string.Empty;
    public string? Body { get; set; }
    public string? CoverImageUrl { get; set; }
    public List<FamilyAttachment> Attachments { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public List<string> LinkedPersonIds { get; set; } = new();
    public int? GenerationFrom { get; set; }
    public int? GenerationTo { get; set; }
    public string AuthorId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
