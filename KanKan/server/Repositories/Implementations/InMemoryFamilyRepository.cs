using System.Collections.Concurrent;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

/// <summary>
/// Combined in-memory stub for all four Family repository interfaces.
/// Used in InMemory (development) mode. Data is kept in memory per process lifetime.
/// </summary>
public class InMemoryFamilyRepository :
    IFamilyTreeRepository,
    IFamilyPersonRepository,
    IFamilyRelationshipRepository,
    IFamilyTreeVisibilityRepository,
    IFamilySectionRepository,
    IFamilyPageRepository
{
    private readonly ConcurrentDictionary<string, FamilyTree> _trees = new();
    private readonly ConcurrentDictionary<string, FamilyPerson> _persons = new();
    private readonly ConcurrentDictionary<string, FamilyRelationship> _rels = new();
    private readonly ConcurrentDictionary<string, FamilyTreeVisibility> _visibilities = new();
    private readonly ConcurrentDictionary<string, FamilySection> _sections = new();
    private readonly ConcurrentDictionary<string, FamilyPage> _pages = new();

    // ── IFamilyTreeRepository ────────────────────────────────────────────────

    Task<List<FamilyTree>> IFamilyTreeRepository.GetByDomainAsync(string domain)
        => Task.FromResult(_trees.Values.Where(t => t.Domain == domain).OrderByDescending(t => t.UpdatedAt).ToList());

    Task<FamilyTree?> IFamilyTreeRepository.GetByIdAsync(string id)
        => Task.FromResult(_trees.TryGetValue(id, out var t) ? t : null);

    Task<FamilyTree> IFamilyTreeRepository.CreateAsync(FamilyTree tree)
    {
        tree.CreatedAt = DateTime.UtcNow;
        tree.UpdatedAt = DateTime.UtcNow;
        _trees[tree.Id] = tree;
        return Task.FromResult(tree);
    }

    Task<FamilyTree> IFamilyTreeRepository.UpdateAsync(FamilyTree tree)
    {
        tree.UpdatedAt = DateTime.UtcNow;
        _trees[tree.Id] = tree;
        return Task.FromResult(tree);
    }

    Task IFamilyTreeRepository.DeleteAsync(string id)
    {
        _trees.TryRemove(id, out _);
        return Task.CompletedTask;
    }

    // ── IFamilyPersonRepository ──────────────────────────────────────────────

    Task<List<FamilyPerson>> IFamilyPersonRepository.GetByTreeIdAsync(string treeId)
        => Task.FromResult(_persons.Values.Where(p => p.TreeId == treeId).ToList());

    Task<FamilyPerson?> IFamilyPersonRepository.GetByIdAsync(string id)
        => Task.FromResult(_persons.TryGetValue(id, out var p) ? p : null);

    Task<FamilyPerson> IFamilyPersonRepository.CreateAsync(FamilyPerson person)
    {
        person.CreatedAt = DateTime.UtcNow;
        person.UpdatedAt = DateTime.UtcNow;
        _persons[person.Id] = person;
        return Task.FromResult(person);
    }

    Task<FamilyPerson> IFamilyPersonRepository.UpdateAsync(FamilyPerson person)
    {
        person.UpdatedAt = DateTime.UtcNow;
        _persons[person.Id] = person;
        return Task.FromResult(person);
    }

    Task IFamilyPersonRepository.DeleteAsync(string id)
    {
        _persons.TryRemove(id, out _);
        return Task.CompletedTask;
    }

    Task IFamilyPersonRepository.DeleteByTreeIdAsync(string treeId)
    {
        var keys = _persons.Where(kv => kv.Value.TreeId == treeId).Select(kv => kv.Key).ToList();
        foreach (var k in keys) _persons.TryRemove(k, out _);
        return Task.CompletedTask;
    }

    Task IFamilyPersonRepository.ClearLinkedTreeReferencesAsync(string linkedTreeId)
    {
        foreach (var person in _persons.Values.Where(p => string.Equals(p.LinkedTreeId, linkedTreeId, StringComparison.Ordinal)).ToList())
        {
            person.LinkedTreeId = null;
            person.LinkedPersonId = null;
            person.UpdatedAt = DateTime.UtcNow;
            _persons[person.Id] = person;
        }

        return Task.CompletedTask;
    }

    // ── IFamilyRelationshipRepository ────────────────────────────────────────

    Task<List<FamilyRelationship>> IFamilyRelationshipRepository.GetByTreeIdAsync(string treeId)
        => Task.FromResult(_rels.Values.Where(r => r.TreeId == treeId).ToList());

    Task<FamilyRelationship?> IFamilyRelationshipRepository.GetByIdAsync(string id)
        => Task.FromResult(_rels.TryGetValue(id, out var r) ? r : null);

    Task<FamilyRelationship> IFamilyRelationshipRepository.CreateAsync(FamilyRelationship rel)
    {
        rel.CreatedAt = DateTime.UtcNow;
        _rels[rel.Id] = rel;
        return Task.FromResult(rel);
    }

    Task<FamilyRelationship> IFamilyRelationshipRepository.UpdateAsync(FamilyRelationship rel)
    {
        _rels[rel.Id] = rel;
        return Task.FromResult(rel);
    }

    Task IFamilyRelationshipRepository.DeleteAsync(string id)
    {
        _rels.TryRemove(id, out _);
        return Task.CompletedTask;
    }

    Task IFamilyRelationshipRepository.DeleteByPersonIdAsync(string personId)
    {
        var keys = _rels.Where(kv => kv.Value.FromId == personId || kv.Value.ToId == personId)
                        .Select(kv => kv.Key).ToList();
        foreach (var k in keys) _rels.TryRemove(k, out _);
        return Task.CompletedTask;
    }

    Task IFamilyRelationshipRepository.DeleteByTreeIdAsync(string treeId)
    {
        var keys = _rels.Where(kv => kv.Value.TreeId == treeId).Select(kv => kv.Key).ToList();
        foreach (var k in keys) _rels.TryRemove(k, out _);
        return Task.CompletedTask;
    }

    Task IFamilyRelationshipRepository.InsertManyAsync(List<FamilyRelationship> rels)
    {
        foreach (var r in rels)
        {
            r.CreatedAt = DateTime.UtcNow;
            _rels[r.Id] = r;
        }
        return Task.CompletedTask;
    }

    // ── IFamilyTreeVisibilityRepository ─────────────────────────────────────

    Task<FamilyTreeVisibility?> IFamilyTreeVisibilityRepository.GetByTreeIdAsync(string treeId)
        => Task.FromResult(_visibilities.TryGetValue(treeId, out var visibility) ? visibility : null);

    Task<List<FamilyTreeVisibility>> IFamilyTreeVisibilityRepository.GetByEmailAsync(string email)
        => Task.FromResult(_visibilities.Values.Where(v => v.UserViewers.Contains(email, StringComparer.Ordinal) || v.UserEditors.Contains(email, StringComparer.Ordinal)).ToList());

    Task<List<FamilyTreeVisibility>> IFamilyTreeVisibilityRepository.GetByDomainAsync(string domain)
        => Task.FromResult(_visibilities.Values.Where(v => v.DomainViewers.Contains(domain, StringComparer.OrdinalIgnoreCase) || v.DomainEditors.Contains(domain, StringComparer.OrdinalIgnoreCase)).ToList());

    Task<FamilyTreeVisibility> IFamilyTreeVisibilityRepository.UpsertAsync(FamilyTreeVisibility visibility)
    {
        _visibilities[visibility.TreeId] = visibility;
        return Task.FromResult(visibility);
    }

    Task IFamilyTreeVisibilityRepository.DeleteByTreeIdAsync(string treeId)
    {
        _visibilities.TryRemove(treeId, out _);
        return Task.CompletedTask;
    }

    // ── IFamilySectionRepository ────────────────────────────────────────────

    Task<List<FamilySection>> IFamilySectionRepository.GetByTreeIdAsync(string treeId)
        => Task.FromResult(_sections.Values.Where(s => s.TreeId == treeId).OrderBy(s => s.SortOrder).ToList());

    Task<FamilySection?> IFamilySectionRepository.GetByIdAsync(string id)
        => Task.FromResult(_sections.TryGetValue(id, out var s) ? s : null);

    Task<FamilySection> IFamilySectionRepository.CreateAsync(FamilySection section)
    {
        section.CreatedAt = DateTime.UtcNow;
        section.UpdatedAt = DateTime.UtcNow;
        _sections[section.Id] = section;
        return Task.FromResult(section);
    }

    Task<FamilySection> IFamilySectionRepository.UpdateAsync(FamilySection section)
    {
        section.UpdatedAt = DateTime.UtcNow;
        _sections[section.Id] = section;
        return Task.FromResult(section);
    }

    Task IFamilySectionRepository.DeleteAsync(string id)
    {
        _sections.TryRemove(id, out _);
        return Task.CompletedTask;
    }

    Task IFamilySectionRepository.DeleteByTreeIdAsync(string treeId)
    {
        var keys = _sections.Where(kv => kv.Value.TreeId == treeId).Select(kv => kv.Key).ToList();
        foreach (var k in keys) _sections.TryRemove(k, out _);
        return Task.CompletedTask;
    }

    // ── IFamilyPageRepository ───────────────────────────────────────────────

    Task<List<FamilyPage>> IFamilyPageRepository.GetBySectionIdAsync(string sectionId)
        => Task.FromResult(_pages.Values.Where(p => p.SectionId == sectionId).OrderBy(p => p.PageNumber).ToList());

    Task<FamilyPage?> IFamilyPageRepository.GetByIdAsync(string id)
        => Task.FromResult(_pages.TryGetValue(id, out var p) ? p : null);

    Task<FamilyPage> IFamilyPageRepository.CreateAsync(FamilyPage page)
    {
        page.CreatedAt = DateTime.UtcNow;
        page.UpdatedAt = DateTime.UtcNow;
        _pages[page.Id] = page;
        return Task.FromResult(page);
    }

    Task<FamilyPage> IFamilyPageRepository.UpdateAsync(FamilyPage page)
    {
        page.UpdatedAt = DateTime.UtcNow;
        _pages[page.Id] = page;
        return Task.FromResult(page);
    }

    Task IFamilyPageRepository.DeleteAsync(string id)
    {
        _pages.TryRemove(id, out _);
        return Task.CompletedTask;
    }

    Task IFamilyPageRepository.DeleteBySectionIdAsync(string sectionId)
    {
        var keys = _pages.Where(kv => kv.Value.SectionId == sectionId).Select(kv => kv.Key).ToList();
        foreach (var k in keys) _pages.TryRemove(k, out _);
        return Task.CompletedTask;
    }

    Task IFamilyPageRepository.DeleteByTreeIdAsync(string treeId)
    {
        var keys = _pages.Where(kv => kv.Value.TreeId == treeId).Select(kv => kv.Key).ToList();
        foreach (var k in keys) _pages.TryRemove(k, out _);
        return Task.CompletedTask;
    }
}
