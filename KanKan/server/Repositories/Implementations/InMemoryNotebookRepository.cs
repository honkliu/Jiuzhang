using System.Collections.Concurrent;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class InMemoryNotebookRepository :
    INotebookRepository,
    INotebookVisibilityRepository,
    INotebookSectionRepository,
    INotebookPageRepository
{
    private readonly ConcurrentDictionary<string, Notebook> _notebooks = new();
    private readonly ConcurrentDictionary<string, NotebookVisibility> _visibilities = new();
    private readonly ConcurrentDictionary<string, NotebookSection> _sections = new();
    private readonly ConcurrentDictionary<string, NotebookPage> _pages = new();

    // ── INotebookRepository ─────────────────────────────────────────────

    Task<List<Notebook>> INotebookRepository.GetByOwnerIdAsync(string ownerId)
        => Task.FromResult(_notebooks.Values.Where(n => n.OwnerId == ownerId).OrderByDescending(n => n.UpdatedAt).ToList());

    Task<List<Notebook>> INotebookRepository.GetByDomainAsync(string domain)
        => Task.FromResult(_notebooks.Values.Where(n => n.Domain == domain).OrderByDescending(n => n.UpdatedAt).ToList());

    Task<Notebook?> INotebookRepository.GetByIdAsync(string id)
        => Task.FromResult(_notebooks.TryGetValue(id, out var n) ? n : null);

    Task<Notebook> INotebookRepository.CreateAsync(Notebook notebook)
    {
        notebook.CreatedAt = DateTime.UtcNow;
        notebook.UpdatedAt = DateTime.UtcNow;
        _notebooks[notebook.Id] = notebook;
        return Task.FromResult(notebook);
    }

    Task<Notebook> INotebookRepository.UpdateAsync(Notebook notebook)
    {
        notebook.UpdatedAt = DateTime.UtcNow;
        _notebooks[notebook.Id] = notebook;
        return Task.FromResult(notebook);
    }

    Task INotebookRepository.DeleteAsync(string id)
    {
        _notebooks.TryRemove(id, out _);
        return Task.CompletedTask;
    }

    // ── INotebookVisibilityRepository ───────────────────────────────────

    Task<NotebookVisibility?> INotebookVisibilityRepository.GetByNotebookIdAsync(string notebookId)
        => Task.FromResult(_visibilities.TryGetValue(notebookId, out var v) ? v : null);

    Task<List<NotebookVisibility>> INotebookVisibilityRepository.GetByEmailAsync(string email)
        => Task.FromResult(_visibilities.Values.Where(v =>
            v.UserViewers.Contains(email, StringComparer.Ordinal) ||
            v.UserEditors.Contains(email, StringComparer.Ordinal)).ToList());

    Task<List<NotebookVisibility>> INotebookVisibilityRepository.GetByDomainAsync(string domain)
        => Task.FromResult(_visibilities.Values.Where(v =>
            v.DomainViewers.Contains(domain, StringComparer.OrdinalIgnoreCase) ||
            v.DomainEditors.Contains(domain, StringComparer.OrdinalIgnoreCase)).ToList());

    Task<NotebookVisibility> INotebookVisibilityRepository.UpsertAsync(NotebookVisibility visibility)
    {
        _visibilities[visibility.NotebookId] = visibility;
        return Task.FromResult(visibility);
    }

    Task INotebookVisibilityRepository.DeleteByNotebookIdAsync(string notebookId)
    {
        _visibilities.TryRemove(notebookId, out _);
        return Task.CompletedTask;
    }

    // ── INotebookSectionRepository ──────────────────────────────────────

    Task<List<NotebookSection>> INotebookSectionRepository.GetByNotebookIdAsync(string notebookId)
        => Task.FromResult(_sections.Values.Where(s => s.NotebookId == notebookId).OrderBy(s => s.SortOrder).ToList());

    Task<NotebookSection?> INotebookSectionRepository.GetByIdAsync(string id)
        => Task.FromResult(_sections.TryGetValue(id, out var s) ? s : null);

    Task<NotebookSection> INotebookSectionRepository.CreateAsync(NotebookSection section)
    {
        section.CreatedAt = DateTime.UtcNow;
        section.UpdatedAt = DateTime.UtcNow;
        _sections[section.Id] = section;
        return Task.FromResult(section);
    }

    Task<NotebookSection> INotebookSectionRepository.UpdateAsync(NotebookSection section)
    {
        section.UpdatedAt = DateTime.UtcNow;
        _sections[section.Id] = section;
        return Task.FromResult(section);
    }

    Task INotebookSectionRepository.DeleteAsync(string id)
    {
        _sections.TryRemove(id, out _);
        return Task.CompletedTask;
    }

    Task INotebookSectionRepository.DeleteByNotebookIdAsync(string notebookId)
    {
        var keys = _sections.Where(kv => kv.Value.NotebookId == notebookId).Select(kv => kv.Key).ToList();
        foreach (var k in keys) _sections.TryRemove(k, out _);
        return Task.CompletedTask;
    }

    // ── INotebookPageRepository ─────────────────────────────────────────

    Task<List<NotebookPage>> INotebookPageRepository.GetBySectionIdAsync(string sectionId)
        => Task.FromResult(_pages.Values.Where(p => p.SectionId == sectionId).OrderBy(p => p.PageNumber).ToList());

    Task<NotebookPage?> INotebookPageRepository.GetByIdAsync(string id)
        => Task.FromResult(_pages.TryGetValue(id, out var p) ? p : null);

    Task<NotebookPage> INotebookPageRepository.CreateAsync(NotebookPage page)
    {
        page.CreatedAt = DateTime.UtcNow;
        page.UpdatedAt = DateTime.UtcNow;
        _pages[page.Id] = page;
        return Task.FromResult(page);
    }

    Task<NotebookPage> INotebookPageRepository.UpdateAsync(NotebookPage page)
    {
        page.UpdatedAt = DateTime.UtcNow;
        _pages[page.Id] = page;
        return Task.FromResult(page);
    }

    Task INotebookPageRepository.DeleteAsync(string id)
    {
        _pages.TryRemove(id, out _);
        return Task.CompletedTask;
    }

    Task INotebookPageRepository.DeleteBySectionIdAsync(string sectionId)
    {
        var keys = _pages.Where(kv => kv.Value.SectionId == sectionId).Select(kv => kv.Key).ToList();
        foreach (var k in keys) _pages.TryRemove(k, out _);
        return Task.CompletedTask;
    }

    Task INotebookPageRepository.DeleteByNotebookIdAsync(string notebookId)
    {
        var keys = _pages.Where(kv => kv.Value.NotebookId == notebookId).Select(kv => kv.Key).ToList();
        foreach (var k in keys) _pages.TryRemove(k, out _);
        return Task.CompletedTask;
    }
}
