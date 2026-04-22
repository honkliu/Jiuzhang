using KanKan.API.Models.Entities;

namespace KanKan.API.Models.DTOs.Receipt;

// ─── Request DTOs ───────────────────────────────────────────────────────────

public class CreateReceiptRequest
{
    public string Type { get; set; } = ReceiptType.Shopping;
    public string Category { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public List<string>? AdditionalImageUrls { get; set; }
    public string? RawText { get; set; }
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string? Currency { get; set; }
    public DateTime? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }
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
}

public class UpdateReceiptRequest
{
    public string? Category { get; set; }
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string? Currency { get; set; }
    public DateTime? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }
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
    public string? RawText { get; set; }
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateTime? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }
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
