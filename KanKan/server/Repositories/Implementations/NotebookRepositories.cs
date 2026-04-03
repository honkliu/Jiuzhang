using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class NotebookRepository : INotebookRepository
{
    private readonly IMongoCollection<Notebook> _collection;

    public NotebookRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<Notebook>(configuration["MongoDB:Collections:Notebooks"] ?? "Notebooks");
    }

    public async Task<List<Notebook>> GetByOwnerIdAsync(string ownerId)
    {
        var filter = Builders<Notebook>.Filter.Eq(n => n.OwnerId, ownerId);
        return await _collection.Find(filter).SortByDescending(n => n.UpdatedAt).ToListAsync();
    }

    public async Task<List<Notebook>> GetByDomainAsync(string domain)
    {
        var filter = Builders<Notebook>.Filter.Eq(n => n.Domain, domain);
        return await _collection.Find(filter).SortByDescending(n => n.UpdatedAt).ToListAsync();
    }

    public async Task<Notebook?> GetByIdAsync(string id)
        => await _collection.Find(Builders<Notebook>.Filter.Eq(n => n.Id, id)).FirstOrDefaultAsync();

    public async Task<Notebook> CreateAsync(Notebook notebook)
    {
        notebook.CreatedAt = DateTime.UtcNow;
        notebook.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(notebook);
        return notebook;
    }

    public async Task<Notebook> UpdateAsync(Notebook notebook)
    {
        notebook.UpdatedAt = DateTime.UtcNow;
        await _collection.ReplaceOneAsync(Builders<Notebook>.Filter.Eq(n => n.Id, notebook.Id), notebook);
        return notebook;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<Notebook>.Filter.Eq(n => n.Id, id));
}

public class NotebookVisibilityRepository : INotebookVisibilityRepository
{
    private readonly IMongoCollection<NotebookVisibility> _collection;

    public NotebookVisibilityRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<NotebookVisibility>(configuration["MongoDB:Collections:NotebookVisibilities"] ?? "NotebookVisibilities");
    }

    public async Task<NotebookVisibility?> GetByNotebookIdAsync(string notebookId)
        => await _collection.Find(Builders<NotebookVisibility>.Filter.Eq(v => v.NotebookId, notebookId)).FirstOrDefaultAsync();

    public async Task<List<NotebookVisibility>> GetByEmailAsync(string email)
    {
        var filter = Builders<NotebookVisibility>.Filter.Or(
            Builders<NotebookVisibility>.Filter.AnyEq(v => v.UserViewers, email),
            Builders<NotebookVisibility>.Filter.AnyEq(v => v.UserEditors, email));
        return await _collection.Find(filter).ToListAsync();
    }

    public async Task<List<NotebookVisibility>> GetByDomainAsync(string domain)
    {
        var filter = Builders<NotebookVisibility>.Filter.Or(
            Builders<NotebookVisibility>.Filter.AnyEq(v => v.DomainViewers, domain),
            Builders<NotebookVisibility>.Filter.AnyEq(v => v.DomainEditors, domain));
        return await _collection.Find(filter).ToListAsync();
    }

    public async Task<NotebookVisibility> UpsertAsync(NotebookVisibility visibility)
    {
        await _collection.ReplaceOneAsync(
            Builders<NotebookVisibility>.Filter.Eq(v => v.NotebookId, visibility.NotebookId),
            visibility,
            new ReplaceOptions { IsUpsert = true });
        return visibility;
    }

    public async Task DeleteByNotebookIdAsync(string notebookId)
        => await _collection.DeleteOneAsync(Builders<NotebookVisibility>.Filter.Eq(v => v.NotebookId, notebookId));
}

public class NotebookSectionRepository : INotebookSectionRepository
{
    private readonly IMongoCollection<NotebookSection> _collection;

    public NotebookSectionRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<NotebookSection>(configuration["MongoDB:Collections:NotebookSections"] ?? "NotebookSections");
    }

    public async Task<List<NotebookSection>> GetByNotebookIdAsync(string notebookId)
    {
        var filter = Builders<NotebookSection>.Filter.Eq(s => s.NotebookId, notebookId);
        return await _collection.Find(filter).SortBy(s => s.SortOrder).ToListAsync();
    }

    public async Task<NotebookSection?> GetByIdAsync(string id)
        => await _collection.Find(Builders<NotebookSection>.Filter.Eq(s => s.Id, id)).FirstOrDefaultAsync();

    public async Task<NotebookSection> CreateAsync(NotebookSection section)
    {
        section.CreatedAt = DateTime.UtcNow;
        section.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(section);
        return section;
    }

    public async Task<NotebookSection> UpdateAsync(NotebookSection section)
    {
        section.UpdatedAt = DateTime.UtcNow;
        await _collection.ReplaceOneAsync(Builders<NotebookSection>.Filter.Eq(s => s.Id, section.Id), section);
        return section;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<NotebookSection>.Filter.Eq(s => s.Id, id));

    public async Task DeleteByNotebookIdAsync(string notebookId)
        => await _collection.DeleteManyAsync(Builders<NotebookSection>.Filter.Eq(s => s.NotebookId, notebookId));
}

public class NotebookPageRepository : INotebookPageRepository
{
    private readonly IMongoCollection<NotebookPage> _collection;

    public NotebookPageRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<NotebookPage>(configuration["MongoDB:Collections:NotebookPages"] ?? "NotebookPages");
    }

    public async Task<List<NotebookPage>> GetBySectionIdAsync(string sectionId)
    {
        var filter = Builders<NotebookPage>.Filter.Eq(p => p.SectionId, sectionId);
        return await _collection.Find(filter).SortBy(p => p.PageNumber).ToListAsync();
    }

    public async Task<NotebookPage?> GetByIdAsync(string id)
        => await _collection.Find(Builders<NotebookPage>.Filter.Eq(p => p.Id, id)).FirstOrDefaultAsync();

    public async Task<NotebookPage> CreateAsync(NotebookPage page)
    {
        page.CreatedAt = DateTime.UtcNow;
        page.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(page);
        return page;
    }

    public async Task<NotebookPage> UpdateAsync(NotebookPage page)
    {
        page.UpdatedAt = DateTime.UtcNow;
        await _collection.ReplaceOneAsync(Builders<NotebookPage>.Filter.Eq(p => p.Id, page.Id), page);
        return page;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<NotebookPage>.Filter.Eq(p => p.Id, id));

    public async Task DeleteBySectionIdAsync(string sectionId)
        => await _collection.DeleteManyAsync(Builders<NotebookPage>.Filter.Eq(p => p.SectionId, sectionId));

    public async Task DeleteByNotebookIdAsync(string notebookId)
        => await _collection.DeleteManyAsync(Builders<NotebookPage>.Filter.Eq(p => p.NotebookId, notebookId));
}
