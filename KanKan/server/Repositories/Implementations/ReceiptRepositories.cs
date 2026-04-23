using MongoDB.Driver;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Repositories.Implementations;

public class ReceiptRepository : IReceiptRepository
{
    private readonly IMongoCollection<Receipt> _collection;

    public ReceiptRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<Receipt>(configuration["MongoDB:Collections:Receipts"] ?? "Receipts");
    }

    public async Task<List<Receipt>> GetByOwnerIdAsync(string ownerId, string? type = null, string? category = null)
    {
        var filter = Builders<Receipt>.Filter.Eq(r => r.OwnerId, ownerId);
        if (!string.IsNullOrEmpty(type))
            filter &= Builders<Receipt>.Filter.Eq(r => r.Type, type);
        if (!string.IsNullOrEmpty(category))
            filter &= Builders<Receipt>.Filter.Eq(r => r.Category, category);
        return await _collection.Find(filter).SortByDescending(r => r.ReceiptDate).ThenByDescending(r => r.CreatedAt).ToListAsync();
    }

    public async Task<List<Receipt>> GetByVisitIdAsync(string visitId)
    {
        var filter = Builders<Receipt>.Filter.Eq(r => r.VisitId, visitId);
        return await _collection.Find(filter).SortBy(r => r.ReceiptDate).ThenBy(r => r.CreatedAt).ToListAsync();
    }

    public async Task<Receipt?> GetByIdAsync(string id)
        => await _collection.Find(Builders<Receipt>.Filter.Eq(r => r.Id, id)).FirstOrDefaultAsync();

    public async Task<Receipt> CreateAsync(Receipt receipt)
    {
        receipt.CreatedAt = DateTime.UtcNow;
        receipt.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(receipt);
        return receipt;
    }

    public async Task<Receipt> UpdateAsync(Receipt receipt)
    {
        receipt.UpdatedAt = DateTime.UtcNow;
        await _collection.ReplaceOneAsync(Builders<Receipt>.Filter.Eq(r => r.Id, receipt.Id), receipt);
        return receipt;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<Receipt>.Filter.Eq(r => r.Id, id));

    public async Task DeleteByVisitIdAsync(string visitId)
        => await _collection.DeleteManyAsync(Builders<Receipt>.Filter.Eq(r => r.VisitId, visitId));
}

public class ReceiptVisitRepository : IReceiptVisitRepository
{
    private readonly IMongoCollection<ReceiptVisit> _collection;

    public ReceiptVisitRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<ReceiptVisit>(configuration["MongoDB:Collections:ReceiptVisits"] ?? "ReceiptVisits");
    }

    public async Task<List<ReceiptVisit>> GetByOwnerIdAsync(string ownerId)
    {
        var filter = Builders<ReceiptVisit>.Filter.Eq(v => v.OwnerId, ownerId);
        return await _collection.Find(filter).SortByDescending(v => v.VisitDate).ThenByDescending(v => v.CreatedAt).ToListAsync();
    }

    public async Task<ReceiptVisit?> GetByIdAsync(string id)
        => await _collection.Find(Builders<ReceiptVisit>.Filter.Eq(v => v.Id, id)).FirstOrDefaultAsync();

    public async Task<ReceiptVisit> CreateAsync(ReceiptVisit visit)
    {
        visit.CreatedAt = DateTime.UtcNow;
        visit.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(visit);
        return visit;
    }

    public async Task<ReceiptVisit> UpdateAsync(ReceiptVisit visit)
    {
        visit.UpdatedAt = DateTime.UtcNow;
        await _collection.ReplaceOneAsync(Builders<ReceiptVisit>.Filter.Eq(v => v.Id, visit.Id), visit);
        return visit;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<ReceiptVisit>.Filter.Eq(v => v.Id, id));
}

// ── InMemory stubs for dev mode ─────────────────────────────────────────────

public class InMemoryReceiptRepository : IReceiptRepository, IReceiptVisitRepository
{
    private readonly List<Receipt> _receipts = new();
    private readonly List<ReceiptVisit> _visits = new();

    // IReceiptRepository
    public Task<List<Receipt>> GetByOwnerIdAsync(string ownerId, string? type = null, string? category = null)
    {
        var q = _receipts.Where(r => r.OwnerId == ownerId);
        if (!string.IsNullOrEmpty(type)) q = q.Where(r => r.Type == type);
        if (!string.IsNullOrEmpty(category)) q = q.Where(r => r.Category == category);
        return Task.FromResult(q.OrderByDescending(r => r.ReceiptDate).ThenByDescending(r => r.CreatedAt).ToList());
    }

    public Task<List<Receipt>> GetByVisitIdAsync(string visitId)
        => Task.FromResult(_receipts.Where(r => r.VisitId == visitId).OrderBy(r => r.ReceiptDate).ToList());

    Task<Receipt?> IReceiptRepository.GetByIdAsync(string id)
        => Task.FromResult(_receipts.FirstOrDefault(r => r.Id == id));

    public Task<Receipt> CreateAsync(Receipt receipt)
    {
        receipt.CreatedAt = DateTime.UtcNow;
        receipt.UpdatedAt = DateTime.UtcNow;
        _receipts.Add(receipt);
        return Task.FromResult(receipt);
    }

    public Task<Receipt> UpdateAsync(Receipt receipt)
    {
        receipt.UpdatedAt = DateTime.UtcNow;
        var idx = _receipts.FindIndex(r => r.Id == receipt.Id);
        if (idx >= 0) _receipts[idx] = receipt;
        return Task.FromResult(receipt);
    }

    Task IReceiptRepository.DeleteAsync(string id)
    {
        _receipts.RemoveAll(r => r.Id == id);
        return Task.CompletedTask;
    }

    public Task DeleteByVisitIdAsync(string visitId)
    {
        _receipts.RemoveAll(r => r.VisitId == visitId);
        return Task.CompletedTask;
    }

    // IReceiptVisitRepository
    public Task<List<ReceiptVisit>> GetByOwnerIdAsync(string ownerId)
        => Task.FromResult(_visits.Where(v => v.OwnerId == ownerId).OrderByDescending(v => v.VisitDate).ToList());

    Task<ReceiptVisit?> IReceiptVisitRepository.GetByIdAsync(string id)
        => Task.FromResult(_visits.FirstOrDefault(v => v.Id == id));

    public Task<ReceiptVisit> CreateAsync(ReceiptVisit visit)
    {
        visit.CreatedAt = DateTime.UtcNow;
        visit.UpdatedAt = DateTime.UtcNow;
        _visits.Add(visit);
        return Task.FromResult(visit);
    }

    public Task<ReceiptVisit> UpdateAsync(ReceiptVisit visit)
    {
        visit.UpdatedAt = DateTime.UtcNow;
        var idx = _visits.FindIndex(v => v.Id == visit.Id);
        if (idx >= 0) _visits[idx] = visit;
        return Task.FromResult(visit);
    }

    Task IReceiptVisitRepository.DeleteAsync(string id)
    {
        _visits.RemoveAll(v => v.Id == id);
        return Task.CompletedTask;
    }
}

public class MedicalRecordIndexRepository : IMedicalRecordIndexRepository
{
    private readonly IMongoCollection<MedicalRecordIndex> _collection;

    public MedicalRecordIndexRepository(IMongoClient mongoClient, IConfiguration configuration)
    {
        var db = mongoClient.GetDatabase(configuration["MongoDB:DatabaseName"] ?? "KanKanDB");
        _collection = db.GetCollection<MedicalRecordIndex>(configuration["MongoDB:Collections:MedicalRecordIndex"] ?? "MedicalRecordIndex");
    }

    public async Task<List<MedicalRecordIndex>> GetByOwnerIdAsync(string ownerId)
    {
        var filter = Builders<MedicalRecordIndex>.Filter.Eq(i => i.OwnerId, ownerId);
        return await _collection.Find(filter).SortByDescending(i => i.UpdatedAt).ToListAsync();
    }

    public async Task<MedicalRecordIndex?> GetByIdAsync(string id)
        => await _collection.Find(Builders<MedicalRecordIndex>.Filter.Eq(i => i.Id, id)).FirstOrDefaultAsync();

    public async Task<MedicalRecordIndex?> GetByOwnerIdAndNumberAsync(string ownerId, string medicalRecordNumber)
    {
        var filter = Builders<MedicalRecordIndex>.Filter.And(
            Builders<MedicalRecordIndex>.Filter.Eq(i => i.OwnerId, ownerId),
            Builders<MedicalRecordIndex>.Filter.Eq(i => i.MedicalRecordNumber, medicalRecordNumber)
        );
        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task<MedicalRecordIndex> CreateAsync(MedicalRecordIndex index)
    {
        index.CreatedAt = DateTime.UtcNow;
        index.UpdatedAt = DateTime.UtcNow;
        await _collection.InsertOneAsync(index);
        return index;
    }

    public async Task<MedicalRecordIndex> UpdateAsync(MedicalRecordIndex index)
    {
        index.UpdatedAt = DateTime.UtcNow;
        await _collection.ReplaceOneAsync(Builders<MedicalRecordIndex>.Filter.Eq(i => i.Id, index.Id), index);
        return index;
    }

    public async Task DeleteAsync(string id)
        => await _collection.DeleteOneAsync(Builders<MedicalRecordIndex>.Filter.Eq(i => i.Id, id));
}

// ── InMemory stubs for MedicalRecordIndex (dev mode) ──────────────────────

public class InMemoryMedicalRecordIndexRepository : IMedicalRecordIndexRepository
{
    private readonly List<MedicalRecordIndex> _records = new();

    public Task<List<MedicalRecordIndex>> GetByOwnerIdAsync(string ownerId)
        => Task.FromResult(_records.Where(r => r.OwnerId == ownerId).OrderByDescending(r => r.UpdatedAt).ToList());

    Task<MedicalRecordIndex?> IMedicalRecordIndexRepository.GetByIdAsync(string id)
        => Task.FromResult(_records.FirstOrDefault(r => r.Id == id));

    public Task<MedicalRecordIndex?> GetByOwnerIdAndNumberAsync(string ownerId, string medicalRecordNumber)
        => Task.FromResult(_records.FirstOrDefault(r => r.OwnerId == ownerId && r.MedicalRecordNumber == medicalRecordNumber));

    public Task<MedicalRecordIndex> CreateAsync(MedicalRecordIndex index)
    {
        index.CreatedAt = DateTime.UtcNow;
        index.UpdatedAt = DateTime.UtcNow;
        _records.Add(index);
        return Task.FromResult(index);
    }

    public Task<MedicalRecordIndex> UpdateAsync(MedicalRecordIndex index)
    {
        index.UpdatedAt = DateTime.UtcNow;
        var idx = _records.FindIndex(r => r.Id == index.Id);
        if (idx >= 0) _records[idx] = index;
        return Task.FromResult(index);
    }

    Task IMedicalRecordIndexRepository.DeleteAsync(string id)
    {
        _records.RemoveAll(r => r.Id == id);
        return Task.CompletedTask;
    }
}
