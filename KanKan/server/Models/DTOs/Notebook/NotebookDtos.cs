using KanKan.API.Models.DTOs.Family;

namespace KanKan.API.Models.DTOs.Notebook;

// ─── Request DTOs ───────────────────────────────────────────────────────────

public class CreateNotebookRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Domain { get; set; }
}

public class UpdateNotebookRequest
{
    public string? Name { get; set; }
}

public class UpdateNotebookVisibilityRequest
{
    public List<string>? UserViewers { get; set; }
    public List<string>? UserEditors { get; set; }
    public List<string>? DomainViewers { get; set; }
    public List<string>? DomainEditors { get; set; }
}

public class CreateNotebookSectionRequest
{
    public string Name { get; set; } = string.Empty;
    public int? SortOrder { get; set; }
}

public class UpdateNotebookSectionRequest
{
    public string? Name { get; set; }
    public int? SortOrder { get; set; }
}

public class CreateNotebookPageRequest
{
    public int? PageNumber { get; set; }
}

public class UpdateNotebookPageRequest
{
    public List<PageElementDto>? Elements { get; set; }
    public int? PageNumber { get; set; }
}

// ─── Response DTOs ──────────────────────────────────────────────────────────

public class NotebookResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string OwnerDisplayName { get; set; } = string.Empty;
    public string OwnerEmail { get; set; } = string.Empty;
    public bool CanEdit { get; set; }
    public bool CanManage { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
}

public class NotebookVisibilityResponse
{
    public string NotebookId { get; set; } = string.Empty;
    public List<string> UserViewers { get; set; } = new();
    public List<string> UserEditors { get; set; } = new();
    public List<string> DomainViewers { get; set; } = new();
    public List<string> DomainEditors { get; set; } = new();
}

public class NotebookSectionResponse
{
    public string Id { get; set; } = string.Empty;
    public string NotebookId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
}

public class NotebookPageResponse
{
    public string Id { get; set; } = string.Empty;
    public string SectionId { get; set; } = string.Empty;
    public string NotebookId { get; set; } = string.Empty;
    public int PageNumber { get; set; }
    public List<PageElementDto> Elements { get; set; } = new();
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
}

public class NotebookPageSummaryResponse
{
    public string Id { get; set; } = string.Empty;
    public int PageNumber { get; set; }
}

// ─── Archive DTOs ───────────────────────────────────────────────────────────

public class NotebookArchiveResponse
{
    public int FormatVersion { get; set; } = 1;
    public string ExportedAt { get; set; } = string.Empty;
    public NotebookArchiveNotebookDto Notebook { get; set; } = new();
    public NotebookVisibilityResponse? Visibility { get; set; }
    public List<NotebookArchiveSectionDto> Sections { get; set; } = new();
}

public class NotebookArchiveNotebookDto
{
    public string SourceNotebookId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
}

public class NotebookArchiveSectionDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public List<NotebookArchivePageDto> Pages { get; set; } = new();
}

public class NotebookArchivePageDto
{
    public string Id { get; set; } = string.Empty;
    public int PageNumber { get; set; }
    public List<NotebookArchiveElementDto> Elements { get; set; } = new();
}

public class NotebookArchiveElementDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = "text";
    public double X { get; set; }
    public double Y { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public string? Text { get; set; }
    public double FontSize { get; set; } = 16;
    public string TextAlign { get; set; } = "left";
    public string? ImageUrl { get; set; }
    public string? ArchivePath { get; set; }
    public int ZIndex { get; set; }
}
