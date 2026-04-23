using KanKan.API.Models.Entities;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace KanKan.API.Repositories.Implementations;

/// <summary>
/// Phase 5: 抽离 PhotoRepository 的关键方法到接口,
/// 使得单元测试可以注入 InMemory 实现而非真实 MongoDB.
/// </summary>
public interface IPhotoRepository
{
    Task<PhotoAlbum?> GetByIdAsync(string id);
    Task<List<PhotoAlbum>> GetByOwnerIdAsync(string ownerId);
    Task<List<PhotoAlbum>> GetByOwnerIdAndDatesAsync(string ownerId, DateTime startDate, DateTime endDate);
    Task<List<PhotoAlbum>> GetByReceiptIdAsync(string receiptId);
    Task<PhotoAlbum> UpdateAsync(PhotoAlbum photo);
    Task<PhotoAlbum> CreateAsync(PhotoAlbum photo);
    Task DeleteAsync(string id);
}
