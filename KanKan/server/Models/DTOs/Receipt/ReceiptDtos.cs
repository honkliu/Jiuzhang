using KanKan.API.Models.Entities;

namespace KanKan.API.Models.DTOs.Receipt;

// ─── Request DTOs ───────────────────────────────────────────────────────────

public class CreateReceiptRequest
{
    public string Type { get; set; } = ReceiptType.Shopping;
    public string Category { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public List<string>? AdditionalImageUrls { get; set; }
    /// <summary>主照片ID (Photo-First, Phase 5 新增)</summary>
    public string? SourcePhotoId { get; set; }
    /// <summary>额外照片IDs (Phase 5 新增)</summary>
    public List<string>? AdditionalPhotoIds { get; set; }
    public string? RawText { get; set; }
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    /// <summary>病案号/住院号 (Phase 5 新增)</summary>
    public string? MedicalRecordNumber { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string? Currency { get; set; }
    public DateTime? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }
    /// <summary>医保类型 (Phase 5 新增)</summary>
    public string? InsuranceType { get; set; }
    public decimal? MedicalInsuranceFundPayment { get; set; }
    public decimal? PersonalSelfPay { get; set; }
    public decimal? OtherPayments { get; set; }
    public decimal? PersonalAccountPayment { get; set; }
    public decimal? PersonalOutOfPocket { get; set; }
    public decimal? CashPayment { get; set; }
    public string? Notes { get; set; }
    public List<string>? Tags { get; set; }
    public string? VisitId { get; set; }
    /// <summary>诊断文本 (Phase 5 已有字段)</summary>
    public string? DiagnosisText { get; set; }
    public string? ImagingFindings { get; set; }
    public List<ReceiptLineItemDto>? Items { get; set; }
    public List<MedicationItemDto>? Medications { get; set; }
    public List<LabResultItemDto>? LabResults { get; set; }
}

public class UpdateReceiptRequest
{
    public string? Category { get; set; }
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    /// <summary>病案号/住院号 (Phase 5 新增)</summary>
    public string? MedicalRecordNumber { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string? Currency { get; set; }
    public DateTime? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }
    /// <summary>医保类型 (Phase 5 已有字段)</summary>
    public string? InsuranceType { get; set; }
    public decimal? MedicalInsuranceFundPayment { get; set; }
    public decimal? PersonalSelfPay { get; set; }
    public decimal? OtherPayments { get; set; }
    public decimal? PersonalAccountPayment { get; set; }
    public decimal? PersonalOutOfPocket { get; set; }
    public decimal? CashPayment { get; set; }
    public string? Notes { get; set; }
    public List<string>? Tags { get; set; }
    public string? VisitId { get; set; }
    public string? DiagnosisText { get; set; }
    public string? ImagingFindings { get; set; }
    public List<ReceiptLineItemDto>? Items { get; set; }
    public List<MedicationItemDto>? Medications { get; set; }
    public List<LabResultItemDto>? LabResults { get; set; }
    public List<string>? AdditionalImageUrls { get; set; }
}

public class CreateReceiptVisitRequest
{
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public DateTime? VisitDate { get; set; }
    public string? PatientName { get; set; }
    public string? DoctorName { get; set; }
    public string? Notes { get; set; }
    public List<string>? Tags { get; set; }
}

public class UpdateReceiptVisitRequest
{
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public DateTime? VisitDate { get; set; }
    public string? PatientName { get; set; }
    public string? DoctorName { get; set; }
    public string? Notes { get; set; }
    public List<string>? Tags { get; set; }
}

// ─── Sub-item DTOs ──────────────────────────────────────────────────────────

public class ReceiptLineItemDto
{
    public string Name { get; set; } = string.Empty;
    public decimal? Quantity { get; set; }
    public string? Unit { get; set; }
    public decimal? UnitPrice { get; set; }
    public decimal? TotalPrice { get; set; }
    public string? Category { get; set; }
}

public class MedicationItemDto
{
    public string Name { get; set; } = string.Empty;
    public string? Dosage { get; set; }
    public string? Frequency { get; set; }
    public int? Days { get; set; }
    public decimal? Quantity { get; set; }
    public decimal? Price { get; set; }
}

public class LabResultItemDto
{
    public string Name { get; set; } = string.Empty;
    public string? Value { get; set; }
    public string? Unit { get; set; }
    public string? ReferenceRange { get; set; }
    public string? Status { get; set; }
}

// ─── Response DTOs ──────────────────────────────────────────────────────────

public class ReceiptResponse
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public List<string> AdditionalImageUrls { get; set; } = new();
    /// <summary>主照片ID (Photo-First, Phase 5 新增)</summary>
    public string SourcePhotoId { get; set; } = string.Empty;
    /// <summary>额外照片IDs (Phase 5 新增)</summary>
    public List<string> AdditionalPhotoIds { get; set; } = new();
    public string? RawText { get; set; }
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    /// <summary>病案号/住院号 (Phase 5 新增)</summary>
    public string? MedicalRecordNumber { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateTime? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }
    /// <summary>医保编号 (与 ReceiptVisit 同步, Phase 5 新增)</summary>
    public string? InsuranceNumber { get; set; }
    public string? InsuranceType { get; set; }
    public decimal? MedicalInsuranceFundPayment { get; set; }
    public decimal? PersonalSelfPay { get; set; }
    public decimal? OtherPayments { get; set; }
    public decimal? PersonalAccountPayment { get; set; }
    public decimal? PersonalOutOfPocket { get; set; }
    public decimal? CashPayment { get; set; }
    public string? Notes { get; set; }
    public List<string> Tags { get; set; } = new();
    public string? VisitId { get; set; }
    public string? DiagnosisText { get; set; }
    public string? ImagingFindings { get; set; }
    public string? FhirResourceType { get; set; }
    public List<ReceiptLineItemDto> Items { get; set; } = new();
    public List<MedicationItemDto> Medications { get; set; } = new();
    public List<LabResultItemDto> LabResults { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ReceiptVisitResponse
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public DateTime? VisitDate { get; set; }
    public string? PatientName { get; set; }
    public string? DoctorName { get; set; }
    public string? Notes { get; set; }
    /// <summary>病案号/住院号 (Phase 5 新增)</summary>
    public string? MedicalRecordNumber { get; set; }
    /// <summary>医保编号 (Phase 5 新增)</summary>
    public string? InsuranceNumber { get; set; }
    public List<string> Tags { get; set; } = new();
    public List<ReceiptResponse> Receipts { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ReceiptStatsResponse
{
    public decimal TotalSpending { get; set; }
    public int TotalCount { get; set; }
    public Dictionary<string, decimal> SpendingByCategory { get; set; } = new();
    public Dictionary<string, int> CountByCategory { get; set; } = new();
}

public class ExtractReceiptRequest
{
    public string ImageUrl { get; set; } = string.Empty;
    public string? OcrPrompt { get; set; }
    public string? MapPrompt { get; set; }
}

/// <summary>
/// Request for the multi-receipt extraction endpoint.
/// Accepts a photo URL and an optional type hint (Shopping / Medical) to select
/// the appropriate enhanced prompt.
/// </summary>
public class MultiReceiptExtractRequest
{
    public string ImageUrl { get; set; } = string.Empty;
    public string? TypeHint { get; set; } // "Shopping" or "Medical" — overrides auto-detection
    public bool ReturnDrafts { get; set; } = false; // If true, return draft DTOs; if false, save to DB
}

/// <summary>
/// Single receipt extracted from multi-receipt photo (minimal DTO for API response).
/// </summary>
public class ExtractedReceiptDto
{
    public string Type { get; set; } = "Shopping";
    public string Category { get; set; } = string.Empty;
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    /// <summary>病案号/住院号 (Phase 5 新增)</summary>
    public string? MedicalRecordNumber { get; set; }
    /// <summary>诊断文本 (Phase 5 新增)</summary>
    public string? DiagnosisText { get; set; }
    /// <summary>医保类型 (Phase 5 新增)</summary>
    public string? InsuranceType { get; set; }
    public decimal? TotalAmount { get; set; }
    public string? Currency { get; set; } = "CNY";
    public DateTime? ReceiptDate { get; set; }
    public string? Notes { get; set; }
    public string? RawText { get; set; }
    public List<ReceiptLineItemDto> Items { get; set; } = new();
    public List<MedicationItemDto> Medications { get; set; } = new();
    public List<LabResultItemDto> LabResults { get; set; } = new();
}

public class MultiReceiptExtractResponse
{
    public List<ExtractedReceiptDto> Receipts { get; set; } = new();
    public string? Step1Raw { get; set; }
    public string? Step2Raw { get; set; }
}

public class ReceiptExtractionResult
{
    public string? Type { get; set; }
    public string? Category { get; set; }
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string? Currency { get; set; }
    public string? ReceiptDate { get; set; }
    public string? Notes { get; set; }
    public string? DiagnosisText { get; set; }
    public string? ImagingFindings { get; set; }
    public List<ReceiptLineItemDto>? Items { get; set; }
    public List<MedicationItemDto>? Medications { get; set; }
    public List<LabResultItemDto>? LabResults { get; set; }
}

public class CheckDuplicateRequest
{
    public string NewOcrText { get; set; } = string.Empty;
    public List<string> ExistingOcrTexts { get; set; } = new();
    public string DedupPrompt { get; set; } = string.Empty;
}

// ─── Phase 5 新增: MedicalRecordIndex DTOs ──────────────────────────────────

/// <summary>
/// 获取病案号索引响应的 DTO.
/// </summary>
public class MedicalRecordIndexResponse
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string MedicalRecordNumber { get; set; } = string.Empty;
    public string HospitalName { get; set; } = string.Empty;
    public string PatientName { get; set; } = string.Empty;
    public string? InsuranceType { get; set; }
    public List<string> VisitIds { get; set; } = new();
    public List<string> ReceiptIds { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// 按 receipt 日期查询照片的响应 DTO.
/// 返回在指定月份有 receipt 的照片列表, 每组包含该照片对应的 receipt 信息.
/// </summary>
public class PhotoReceiptDateGroupedResponse
{
    /// <summary>照片列表 (每张照片只出现一次)</summary>
    public List<PhotoReceiptGroupItem> Photos { get; set; } = new();
    /// <summary>按月份分组的 receipt 信息</summary>
    public Dictionary<string, List<GroupReceiptInfo>> GroupedReceipts { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 100;
}

public class PhotoReceiptGroupItem
{
    public string Id { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? FilePath { get; set; }
    public DateTime UploadedAt { get; set; }
    public DateTime? CapturedDate { get; set; }
    public int ExtractedReceiptCount { get; set; }
    public string LastOcrStatus { get; set; } = "Pending";
    public List<string> AssociatedReceiptIds { get; set; } = new();
    public List<string>? Tags { get; set; }
    public string? Notes { get; set; }
    /// <summary>该照片在指定月份范围内匹配的 receipt 信息</summary>
    public List<GroupReceiptInfo> MatchedReceipts { get; set; } = new();
}

public class GroupReceiptInfo
{
    public string ReceiptId { get; set; } = string.Empty;
    public string Type { get; set; } = "Shopping";
    public string Category { get; set; } = string.Empty;
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public decimal? TotalAmount { get; set; }
    public DateTime? ReceiptDate { get; set; }
    public string YearMonth { get; set; } = string.Empty;
    /// <summary>有意义的分组标题 (商户名/医院名 + 金额)</summary>
    public string? GroupTitle { get; set; }
}

/// <summary>
/// 更新 Visit 归属的请求 DTO.
/// </summary>
public class UpdateVisitRequest
{
    public string ReceiptId { get; set; } = string.Empty;
    public string? VisitId { get; set; }
    public string? SourcePhotoId { get; set; }
    public List<string>? AdditionalPhotoIds { get; set; }
    public string? MedicalRecordNumber { get; set; }
}
