using KanKan.API.Models.DTOs.Receipt;

public class BatchExtractRequest
{
    public List<string> PhotoIds { get; set; } = new();
}

public class BatchExtractResponse
{
    /// <summary>Extraction results for each photo (returns immediately for synchronous flow).</summary>
    public List<BatchExtractResult> Results { get; set; } = new();
}

public class BatchExtractResult
{
    public string PhotoId { get; set; } = string.Empty;
    public string? PhotoImageUrl { get; set; } // URL path to the photo for receipt.ImageUrl
    public string Status { get; set; } = "Pending"; // Pending, Completed, Failed
    public string? Error { get; set; }

    // ── Extraction results (filled when Status == Completed) ──
    /// <summary>Step 1: raw OCR output from vision model (markdown + JSON blocks).</summary>
    public string? Step1RawOcr { get; set; }
    /// <summary>Step 2: mapped schema JSON array (one receipt per element).</summary>
    public string? Step2MappedJson { get; set; }
    /// <summary>Parsed receipt objects from step 2 (for quick UI rendering).</summary>
    public List<ParsedExtractedReceipt> ParsedReceipts { get; set; } = new();
}

public class ParsedExtractedReceipt
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
    public string? ReceiptDate { get; set; }
    public string? Notes { get; set; }
    public string? RawText { get; set; }  // markdown block for this receipt
    public List<ReceiptLineItemDto>? Items { get; set; }
    public List<MedicationItemDto>? Medications { get; set; }
    public List<LabResultItemDto>? LabResults { get; set; }
}

public class SaveConfirmedRequest
{
    public List<ConfirmedReceipt> Receipts { get; set; } = new();
}

public class ConfirmedReceipt
{
    public string PhotoId { get; set; } = string.Empty;
    public string? PhotoImageUrl { get; set; } // URL path for receipt.ImageUrl
    /// <summary>主照片ID (Photo-First, Phase 5 新增)</summary>
    public string? SourcePhotoId { get; set; }
    /// <summary>额外照片IDs (多页票据, Phase 5 新增)</summary>
    public List<string>? AdditionalPhotoIds { get; set; }
    public string? ReceiptId { get; set; } // null if new
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
    /// <summary>挂号号/就诊号</summary>
    public string? OutpatientNumber { get; set; }
    public decimal? TotalAmount { get; set; }
    public string? Currency { get; set; } = "CNY";
    public string? ReceiptDate { get; set; }
    public string? Notes { get; set; }
    public string? RawText { get; set; }  // OCR raw text for dedup
    public List<ReceiptLineItemDto>? Items { get; set; }
    public List<MedicationItemDto>? Medications { get; set; }
    public List<LabResultItemDto>? LabResults { get; set; }
}
