using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class FamilyTreeRepository : IFamilyTreeRepository
{
    private readonly IMongoCollection<FamilyTree> _collection;

    public FamilyTreeRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<FamilyTree>(configuration["MongoDB:Collections:FamilyTrees"] ?? "FamilyTrees");
    }

    public async Task<List<FamilyTree>> GetByDomainAsync(string domain)
    {
        var filter = Builders<FamilyTree>.Filter.Eq(t => t.Domain, domain);
        return await _collection.Find(filter).SortByDescending(t => t.UpdatedAt).ToListAsync();
    }

    public async Task<FamilyTree?> GetByIdAsync(string id)
        => await _collection.Find(Builders<FamilyTree>.Filter.Eq(t => t.Id, id)).FirstOrDefaultAsync();

    public async Task<FamilyTree> CreateAsync(FamilyTree tree)
    {
        tree.CreatedAt = DateTime.UtcNow;
        tree.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(tree);
        return tree;
    }

    public async Task<FamilyTree> UpdateAsync(FamilyTree tree)
    {
        tree.UpdatedAt = DateTime.UtcNow;
        await _collection.ReplaceOneAsync(Builders<FamilyTree>.Filter.Eq(t => t.Id, tree.Id), tree);
        return tree;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<FamilyTree>.Filter.Eq(t => t.Id, id));
}

public class FamilyPersonRepository : IFamilyPersonRepository
{
    private readonly IMongoCollection<FamilyPerson> _collection;

    public FamilyPersonRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<FamilyPerson>(configuration["MongoDB:Collections:FamilyPersons"] ?? "FamilyPersons");
    }

    public async Task<List<FamilyPerson>> GetByTreeIdAsync(string treeId)
    {
        var filter = Builders<FamilyPerson>.Filter.Eq(p => p.TreeId, treeId);
        return await _collection.Find(filter).ToListAsync();
    }

    public async Task<FamilyPerson?> GetByIdAsync(string id)
        => await _collection.Find(Builders<FamilyPerson>.Filter.Eq(p => p.Id, id)).FirstOrDefaultAsync();

    public async Task<FamilyPerson> CreateAsync(FamilyPerson person)
    {
        person.CreatedAt = DateTime.UtcNow;
        person.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(person);
        return person;
    }

    public async Task<FamilyPerson> UpdateAsync(FamilyPerson person)
    {
        person.UpdatedAt = DateTime.UtcNow;
        await _collection.ReplaceOneAsync(Builders<FamilyPerson>.Filter.Eq(p => p.Id, person.Id), person);
        return person;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<FamilyPerson>.Filter.Eq(p => p.Id, id));

    public async Task DeleteByTreeIdAsync(string treeId)
        => await _collection.DeleteManyAsync(Builders<FamilyPerson>.Filter.Eq(p => p.TreeId, treeId));

    public async Task ClearLinkedTreeReferencesAsync(string linkedTreeId)
    {
        var filter = Builders<FamilyPerson>.Filter.Eq(p => p.LinkedTreeId, linkedTreeId);
        var update = Builders<FamilyPerson>.Update
            .Set(p => p.LinkedTreeId, null)
            .Set(p => p.LinkedPersonId, null)
            .Set(p => p.UpdatedAt, DateTime.UtcNow);
        await _collection.UpdateManyAsync(filter, update);
    }
}

public class FamilyRelationshipRepository : IFamilyRelationshipRepository
{
    private readonly IMongoCollection<FamilyRelationship> _collection;

    public FamilyRelationshipRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<FamilyRelationship>(configuration["MongoDB:Collections:FamilyRelationships"] ?? "FamilyRelationships");
    }

    public async Task<List<FamilyRelationship>> GetByTreeIdAsync(string treeId)
    {
        var filter = Builders<FamilyRelationship>.Filter.Eq(r => r.TreeId, treeId);
        return await _collection.Find(filter).ToListAsync();
    }

    public async Task<FamilyRelationship?> GetByIdAsync(string id)
        => await _collection.Find(Builders<FamilyRelationship>.Filter.Eq(r => r.Id, id)).FirstOrDefaultAsync();

    public async Task<FamilyRelationship> CreateAsync(FamilyRelationship rel)
    {
        rel.CreatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(rel);
        return rel;
    }

    public async Task<FamilyRelationship> UpdateAsync(FamilyRelationship rel)
    {
        await _collection.ReplaceOneAsync(Builders<FamilyRelationship>.Filter.Eq(r => r.Id, rel.Id), rel);
        return rel;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<FamilyRelationship>.Filter.Eq(r => r.Id, id));

    public async Task DeleteByPersonIdAsync(string personId)
    {
        var filter = Builders<FamilyRelationship>.Filter.Or(
            Builders<FamilyRelationship>.Filter.Eq(r => r.FromId, personId),
            Builders<FamilyRelationship>.Filter.Eq(r => r.ToId, personId));
        await _collection.DeleteManyAsync(filter);
    }

    public async Task DeleteByTreeIdAsync(string treeId)
        => await _collection.DeleteManyAsync(Builders<FamilyRelationship>.Filter.Eq(r => r.TreeId, treeId));

    public async Task InsertManyAsync(List<FamilyRelationship> rels)
    {
        if (rels.Count == 0) return;
        foreach (var r in rels) r.CreatedAt = DateTime.UtcNow;
        await _collection.InsertManyAsync(rels);
    }
}

public class FamilyTreeVisibilityRepository : IFamilyTreeVisibilityRepository
{
    private readonly IMongoCollection<FamilyTreeVisibility> _collection;

    public FamilyTreeVisibilityRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<FamilyTreeVisibility>(configuration["MongoDB:Collections:FamilyTreeVisibilities"] ?? "FamilyTreeVisibilities");
    }

    public async Task<FamilyTreeVisibility?> GetByTreeIdAsync(string treeId)
        => await _collection.Find(Builders<FamilyTreeVisibility>.Filter.Eq(v => v.TreeId, treeId)).FirstOrDefaultAsync();

    public async Task<List<FamilyTreeVisibility>> GetByEmailAsync(string email)
    {
        var filter = Builders<FamilyTreeVisibility>.Filter.Or(
            Builders<FamilyTreeVisibility>.Filter.AnyEq(v => v.UserViewers, email),
            Builders<FamilyTreeVisibility>.Filter.AnyEq(v => v.UserEditors, email));
        return await _collection.Find(filter).ToListAsync();
    }

    public async Task<List<FamilyTreeVisibility>> GetByDomainAsync(string domain)
    {
        var filter = Builders<FamilyTreeVisibility>.Filter.Or(
            Builders<FamilyTreeVisibility>.Filter.AnyEq(v => v.DomainViewers, domain),
            Builders<FamilyTreeVisibility>.Filter.AnyEq(v => v.DomainEditors, domain));
        return await _collection.Find(filter).ToListAsync();
    }

    public async Task<FamilyTreeVisibility> UpsertAsync(FamilyTreeVisibility visibility)
    {
        await _collection.ReplaceOneAsync(
            Builders<FamilyTreeVisibility>.Filter.Eq(v => v.TreeId, visibility.TreeId),
            visibility,
            new ReplaceOptions { IsUpsert = true });
        return visibility;
    }

    public async Task DeleteByTreeIdAsync(string treeId)
        => await _collection.DeleteOneAsync(Builders<FamilyTreeVisibility>.Filter.Eq(v => v.TreeId, treeId));
}
