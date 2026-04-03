using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface INotebookRepository
{
    Task<List<Notebook>> GetByOwnerIdAsync(string ownerId);
    Task<List<Notebook>> GetByDomainAsync(string domain);
    Task<Notebook?> GetByIdAsync(string id);
    Task<Notebook> CreateAsync(Notebook notebook);
    Task<Notebook> UpdateAsync(Notebook notebook);
    Task DeleteAsync(string id);
}

public interface INotebookVisibilityRepository
{
    Task<NotebookVisibility?> GetByNotebookIdAsync(string notebookId);
    Task<List<NotebookVisibility>> GetByEmailAsync(string email);
    Task<List<NotebookVisibility>> GetByDomainAsync(string domain);
    Task<NotebookVisibility> UpsertAsync(NotebookVisibility visibility);
    Task DeleteByNotebookIdAsync(string notebookId);
}

public interface INotebookSectionRepository
{
    Task<List<NotebookSection>> GetByNotebookIdAsync(string notebookId);
    Task<NotebookSection?> GetByIdAsync(string id);
    Task<NotebookSection> CreateAsync(NotebookSection section);
    Task<NotebookSection> UpdateAsync(NotebookSection section);
    Task DeleteAsync(string id);
    Task DeleteByNotebookIdAsync(string notebookId);
}

public interface INotebookPageRepository
{
    Task<List<NotebookPage>> GetBySectionIdAsync(string sectionId);
    Task<NotebookPage?> GetByIdAsync(string id);
    Task<NotebookPage> CreateAsync(NotebookPage page);
    Task<NotebookPage> UpdateAsync(NotebookPage page);
    Task DeleteAsync(string id);
    Task DeleteBySectionIdAsync(string sectionId);
    Task DeleteByNotebookIdAsync(string notebookId);
}
