using MongoDB.Bson.Serialization.Attributes;

namespace KanKan.API.Models.Entities;

/// <summary>
/// Receipt types
/// </summary>
public static class ReceiptType
{
    public const string Shopping = "Shopping";
    public const string Medical = "Medical";
}

/// <summary>
/// Shopping receipt categories
/// </summary>
public static class ShoppingCategory
{
    public const string Supermarket = "Supermarket";
    public const string Restaurant = "Restaurant";
    public const string OnlineShopping = "OnlineShopping";
    public const string Other = "Other";
}

/// <summary>
/// Medical receipt categories — HL7 FHIR-inspired resource mapping:
///   Registration  → Encounter
///   Diagnosis     → DiagnosticReport
///   Prescription  → MedicationRequest
///   LabResult     → Observation
///   ImagingResult → ImagingStudy
///   PaymentReceipt→ Claim
///   DischargeNote → Encounter (summary)
/// </summary>
public static class MedicalCategory
{
    public const string Registration = "Registration";       // 挂号单
    public const string Diagnosis = "Diagnosis";             // 诊断报告
    public const string Prescription = "Prescription";       // 处方/开药
    public const string LabResult = "LabResult";             // 检验/化验报告
    public const string ImagingResult = "ImagingResult";     // 影像报告 (CT/X光/B超)
    public const string PaymentReceipt = "PaymentReceipt";   // 收费收据/发票
    public const string DischargeNote = "DischargeNote";     // 出院小结
    public const string Other = "Other";
}

/// <summary>
/// A single scanned receipt/document with structured data extracted from the photo.
/// </summary>
[BsonIgnoreExtraElements]
public class Receipt
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;

    /// <summary>"Shopping" or "Medical"</summary>
    public string Type { get; set; } = ReceiptType.Shopping;

    /// <summary>Category within the type (ShoppingCategory or MedicalCategory constants)</summary>
    public string Category { get; set; } = string.Empty;

    /// <summary>URL to the original photo via /uploads/</summary>
    public string ImageUrl { get; set; } = string.Empty;

    /// <summary>Additional photo URLs (multi-page receipts)</summary>
    public List<string> AdditionalImageUrls { get; set; } = new();

    /// <summary>OCR raw text (future use)</summary>
    public string? RawText { get; set; }

    // ── Common fields ──
    public string? MerchantName { get; set; }
    public decimal? TotalAmount { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateTime? ReceiptDate { get; set; }
    public string? Notes { get; set; }
    public List<string> Tags { get; set; } = new();

    // ── Shopping-specific fields ──
    public List<ReceiptLineItem> Items { get; set; } = new();

    // ── Medical-specific fields ──
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    public string? DiagnosisText { get; set; }
    public List<MedicationItem> Medications { get; set; } = new();
    public List<LabResultItem> LabResults { get; set; } = new();
    public string? ImagingFindings { get; set; }

    /// <summary>Groups related hospital receipts by visit</summary>
    public string? VisitId { get; set; }

    /// <summary>HL7 FHIR resource type hint for interoperability</summary>
    public string? FhirResourceType { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// A line item on a shopping receipt.
/// </summary>
[BsonIgnoreExtraElements]
public class ReceiptLineItem
{
    public string Name { get; set; } = string.Empty;
    public decimal? Quantity { get; set; }
    public string? Unit { get; set; }
    public decimal? UnitPrice { get; set; }
    public decimal? TotalPrice { get; set; }
    public string? Category { get; set; }
}

/// <summary>
/// A medication entry on a prescription.
/// </summary>
[BsonIgnoreExtraElements]
public class MedicationItem
{
    public string Name { get; set; } = string.Empty;
    public string? Dosage { get; set; }
    public string? Frequency { get; set; }
    public int? Days { get; set; }
    public decimal? Quantity { get; set; }
    public decimal? Price { get; set; }
}

/// <summary>
/// A single lab test result entry.
/// </summary>
[BsonIgnoreExtraElements]
public class LabResultItem
{
    public string Name { get; set; } = string.Empty;
    public string? Value { get; set; }
    public string? Unit { get; set; }
    public string? ReferenceRange { get; set; }
    public string? Status { get; set; }  // Normal, High, Low, Abnormal
}

/// <summary>
/// Groups related hospital receipts into a single visit/encounter.
/// </summary>
[BsonIgnoreExtraElements]
public class ReceiptVisit
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
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
