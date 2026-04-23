using KanKan.API.Models.DTOs.Photo;
using KanKan.API.Models.DTOs.Receipt;
using KanKan.API.Models.Entities;

namespace KanKan.API.Services.Interfaces;

public interface IPhotoService
{
    Task<PhotoResponse> UploadAsync(string ownerId, PhotoCreateRequest request);
    Task<PhotoUploadBatchResponse> UploadBatchAsync(string ownerId, PhotoUploadBatchRequest request);
    Task<PhotoResponse?> GetByIdAsync(string ownerId, string photoId);
    Task<List<PhotoResponse>> GetAllAsync(string ownerId);
    Task<List<PhotoResponse>> GetByDateRangeAsync(string ownerId, DateTime startDate, DateTime endDate);
    Task<List<PhotoResponse>> GetByReceiptIdAsync(string ownerId, string receiptId);
    Task<PhotoResponse> UpdateAsync(string ownerId, string photoId, PhotoUpdateRequest request);
    Task DeleteAsync(string ownerId, string photoId);
    Task<byte[]> DownloadAsync(string photoId);
}

public interface IAutoAssociateService
{
    /// <summary>
    /// Try to auto-associate a photo with an existing receipt (3-level matching).
    /// </summary>
    Task<AutoAssociateMatch?> TryAssociatePhotoAsync(string ownerId, string photoId, string receiptId);
    
    /// <summary>
    /// Auto-associate all unassociated photos for a user.
    /// </summary>
    Task<List<AutoAssociateResult>> AutoAssociateAllAsync(string ownerId);
}

public class AutoAssociateMatch
{
    public string ReceiptId { get; set; } = string.Empty;
    public string ReceiptType { get; set; } = string.Empty;
    public string MatchLevel { get; set; } = string.Empty; // "OutpatientNumber", "Hospital+Patient", "Hospital"
    public decimal? ReceiptAmount { get; set; }
    public DateTime? ReceiptDate { get; set; }
    public string? HospitalName { get; set; }
    public string? PatientName { get; set; }
    public string? OutpatientNumber { get; set; }
}

public class AutoAssociateResult
{
    public string PhotoId { get; set; } = string.Empty;
    public bool Matched { get; set; }
    public string? ReceiptId { get; set; }
    public string? MatchLevel { get; set; }
}

public interface IVisitStatsService
{
    /// <summary>
    /// Get visit spending statistics for a date range.
    /// </summary>
    Task<VisitStatsResponse> GetVisitStatsAsync(string ownerId, DateTime startDate, DateTime endDate);
    
    /// <summary>
    /// Relink receipts between visits.
    /// </summary>
    Task RelinkReceiptsAsync(string ownerId, string sourceVisitId, string targetVisitId);
}

public class VisitStatsResponse
{
    public decimal TotalSpending { get; set; }
    public int TotalVisits { get; set; }
    public int TotalReceipts { get; set; }
    public decimal AveragePerVisit { get; set; }
    public List<VisitDayStat> DailyStats { get; set; } = new();
    public List<VisitHospitalStat> HospitalStats { get; set; } = new();
}

public class VisitDayStat
{
    public string Date { get; set; } = string.Empty;
    public decimal Spending { get; set; }
    public int ReceiptCount { get; set; }
}

public class VisitHospitalStat
{
    public string HospitalName { get; set; } = string.Empty;
    public decimal TotalSpending { get; set; }
    public int ReceiptCount { get; set; }
}
