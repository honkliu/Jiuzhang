using System.Linq.Expressions;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using MongoDB.Driver;

namespace KanKan.API.Repositories.Implementations;

/// <summary>
/// Domain-specific photo repository with MongoDB-backed operations.
/// Implements the generic IRepository and adds photo-specific queries.
/// </summary>
public class PhotoRepository : IRepository<PhotoAlbum>, IPhotoRepository
{
    private readonly IMongoCollection<PhotoAlbum> _collection;

    public PhotoRepository(IMongoClient client, IConfiguration configuration)
    {
        var dbName = configuration["MongoDB:DatabaseName"] ?? "KanKanDB";
        var database = client.GetDatabase(dbName);
        _collection = database.GetCollection<PhotoAlbum>("photo_albums");
    }

    // ── Generic IRepository<PhotoAlbum> implementation ──

    public async Task<List<PhotoAlbum>> FindAsync(Expression<Func<PhotoAlbum, bool>> filter)
    {
        return await _collection.Find(filter).SortByDescending(p => p.UploadedAt).ToListAsync();
    }

    public async Task<PhotoAlbum?> FindOneAsync(Expression<Func<PhotoAlbum, bool>> filter)
    {
        return await _collection.Find(filter).FirstOrDefaultAsync();
    }

    public async Task InsertOneAsync(PhotoAlbum photo)
    {
        await _collection.InsertOneAsync(photo);
    }

    public async Task ReplaceOneAsync(Expression<Func<PhotoAlbum, bool>> filter, PhotoAlbum replacement)
    {
        await _collection.ReplaceOneAsync(filter, replacement);
    }

    public async Task DeleteOneAsync(Expression<Func<PhotoAlbum, bool>> filter)
    {
        await _collection.DeleteOneAsync(filter);
    }

    public async Task UpsertAsync(PhotoAlbum photo)
    {
        await _collection.ReplaceOneAsync(
            p => p.Id == photo.Id,
            photo,
            new ReplaceOptions { IsUpsert = true });
    }

    // ── Domain-specific methods ──

    public async Task<PhotoAlbum> CreateAsync(PhotoAlbum photo)
    {
        await _collection.InsertOneAsync(photo);
        return photo;
    }

    public async Task<PhotoAlbum?> GetByIdAsync(string id)
    {
        return await _collection.Find(p => p.Id == id).FirstOrDefaultAsync();
    }

    public async Task<List<PhotoAlbum>> GetByOwnerIdAsync(string ownerId)
    {
        return await _collection.Find(p => p.OwnerId == ownerId)
            .SortByDescending(p => p.UploadedAt)
            .ToListAsync();
    }

    public async Task<List<PhotoAlbum>> GetByOwnerIdAndDatesAsync(string ownerId, DateTime startDate, DateTime endDate)
    {
        var filter = Builders<PhotoAlbum>.Filter.And(
            Builders<PhotoAlbum>.Filter.Eq(p => p.OwnerId, ownerId),
            Builders<PhotoAlbum>.Filter.Gte(p => p.UploadedAt, startDate),
            Builders<PhotoAlbum>.Filter.Lte(p => p.UploadedAt, endDate)
        );
        return await _collection.Find(filter).SortByDescending(p => p.UploadedAt).ToListAsync();
    }

    public async Task<List<PhotoAlbum>> GetByReceiptIdAsync(string receiptId)
    {
        var filter = Builders<PhotoAlbum>.Filter.ElemMatch(
            p => p.AssociatedReceiptIds,
            rid => rid == receiptId
        );
        return await _collection.Find(filter).SortByDescending(p => p.UploadedAt).ToListAsync();
    }

    public async Task<PhotoAlbum> UpdateAsync(PhotoAlbum photo)
    {
        await _collection.ReplaceOneAsync(
            p => p.Id == photo.Id,
            photo,
            new ReplaceOptions { IsUpsert = false });
        return photo;
    }

    public async Task DeleteAsync(string id)
    {
        await _collection.DeleteOneAsync(p => p.Id == id);
    }

    /// <summary>
    /// 根据 PhotoReceiptDateIndex 查询指定月份有 receipt 的照片.
    /// 返回在指定 yearMonth (如 "2026-04") 有 receipt 的照片列表.
    /// </summary>
    public async Task<List<PhotoAlbum>> GetByReceiptDateIndexMonthAsync(string ownerId, string yearMonth)
    {
        // yearMonth 格式: "YYYY-MM"
        // 匹配 PhotoReceiptDateIndex 中 key 包含该月份的照片
        // 由于 Mongo 不支持对 Dictionary key 的直接查询，我们用 LINQ 在客户端过滤
        var allPhotos = await GetByOwnerIdAsync(ownerId);
        return allPhotos
            .Where(p => p.PhotoReceiptDateIndex != null && p.PhotoReceiptDateIndex.ContainsKey(yearMonth))
            .ToList();
    }
}
