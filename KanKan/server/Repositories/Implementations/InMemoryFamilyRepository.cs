using System.Collections.Concurrent;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

/// <summary>
/// Combined in-memory stub for all three Family repository interfaces.
/// Used in InMemory (development) mode. Data is kept in memory per process lifetime.
/// </summary>
public class InMemoryFamilyRepository :
    IFamilyTreeRepository,
    IFamilyPersonRepository,
    IFamilyRelationshipRepository
{
    private readonly ConcurrentDictionary<string, FamilyTree> _trees = new();
    private readonly ConcurrentDictionary<string, FamilyPerson> _persons = new();
    private readonly ConcurrentDictionary<string, FamilyRelationship> _rels = new();

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
}
