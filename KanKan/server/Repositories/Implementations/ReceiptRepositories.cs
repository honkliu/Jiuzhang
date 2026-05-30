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
