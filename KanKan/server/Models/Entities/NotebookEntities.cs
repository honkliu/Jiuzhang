using MongoDB.Bson.Serialization.Attributes;
using KanKan.API.Models.Entities;

namespace KanKan.API.Models.Entities;

[BsonIgnoreExtraElements]
public class Notebook
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

[BsonIgnoreExtraElements]
public class NotebookVisibility
{
    public string NotebookId { get; set; } = string.Empty;
    public List<string> UserViewers { get; set; } = new();
    public List<string> UserEditors { get; set; } = new();
    public List<string> DomainViewers { get; set; } = new();
    public List<string> DomainEditors { get; set; } = new();
}

[BsonIgnoreExtraElements]
public class NotebookSection
{
    public string Id { get; set; } = string.Empty;
    public string NotebookId { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

[BsonIgnoreExtraElements]
public class NotebookPage
{
    public string Id { get; set; } = string.Empty;
    public string SectionId { get; set; } = string.Empty;
    public string NotebookId { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public int PageNumber { get; set; } = 1;
    public List<PageElement> Elements { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
