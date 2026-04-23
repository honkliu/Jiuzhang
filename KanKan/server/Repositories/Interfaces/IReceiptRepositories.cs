using KanKan.API.Models.Entities;

namespace KanKan.API.Repositories.Interfaces;

public interface IReceiptRepository
{
    Task<List<Receipt>> GetByOwnerIdAsync(string ownerId, string? type = null, string? category = null);
    Task<List<Receipt>> GetByVisitIdAsync(string visitId);
    Task<Receipt?> GetByIdAsync(string id);
    Task<Receipt> CreateAsync(Receipt receipt);
    Task<Receipt> UpdateAsync(Receipt receipt);
    Task DeleteAsync(string id);
    Task DeleteByVisitIdAsync(string visitId);
}

public interface IReceiptVisitRepository
{
    Task<List<ReceiptVisit>> GetByOwnerIdAsync(string ownerId);
    Task<ReceiptVisit?> GetByIdAsync(string id);
    Task<ReceiptVisit> CreateAsync(ReceiptVisit visit);
    Task<ReceiptVisit> UpdateAsync(ReceiptVisit visit);
    Task DeleteAsync(string id);
}

/// <summary>
/// Phase 5 新增: 病案号索引仓库接口.
/// </summary>
public interface IMedicalRecordIndexRepository
{
    Task<List<MedicalRecordIndex>> GetByOwnerIdAsync(string ownerId);
    Task<MedicalRecordIndex?> GetByIdAsync(string id);
    Task<MedicalRecordIndex?> GetByOwnerIdAndNumberAsync(string ownerId, string medicalRecordNumber);
    Task<MedicalRecordIndex> CreateAsync(MedicalRecordIndex index);
    Task<MedicalRecordIndex> UpdateAsync(MedicalRecordIndex index);
    Task DeleteAsync(string id);
}
