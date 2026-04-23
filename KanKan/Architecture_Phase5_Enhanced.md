# Architecture: Phase 5 — Photo-First Receipt & Medical Management (Enhanced)

**Version:** 2.0
**Date:** 2026-04-23
**Stack:** .NET 9 + MongoDB, React 18 + TypeScript + MUI
**Related:** PRD_Phase5_Enhanced.md, Architecture_Phase4.md, Director_Briefing_Phase5.md
**Author:** Architecture Director (KanKan)

---

## 1. Overview

Phase 5 builds upon the Phase 4 Photo-First architecture and introduces three core enhancements:

1. **Scenario-Aware OCR Enhancement** — Medical/Shopping differentiated prompt strategies, multi-step extraction with dedicated MedicalRecordNumber extraction.
2. **Photo Grouped View by Receipt Date** — Photos appear in receipt-date groups, not upload-date groups. Each photo can appear in multiple groups (one photo, multiple receipts on different dates).
3. **Deep Medical Data Association** — MedicalRecordNumber (病案号) as the primary cross-visit correlation key, with `MedicalRecordIndex` entity and auto-association service.

**Key Design Principle:** All changes are additive. No existing functionality is removed. `ImageUrl` fields are deprecated but retained for backward compatibility.

---

## 2. Complete Entity Definitions (C#)

### 2.1 Receipt Entity (Enhanced)

File: `server/Models/Entities/ReceiptEntities.cs`

```csharp
[BsonIgnoreExtraElements]
public class Receipt
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;

    /// <summary>"Shopping" or "Medical"</summary>
    public string Type { get; set; } = ReceiptType.Shopping;

    /// <summary>Category within the type (ShoppingCategory or MedicalCategory)</summary>
    public string Category { get; set; } = string.Empty;

    // ── DEPRECATED (replace by SourcePhotoId) ──
    /// <summary>URL to the original photo via /uploads/ — DEPRECATED, use SourcePhotoId</summary>
    [Obsolete("Use SourcePhotoId + PhotoAlbum.FileName instead. Will be removed in Phase 6.")]
    public string ImageUrl { get; set; } = string.Empty;

    /// <summary>Additional photo URLs (multi-page receipts) — DEPRECATED, use AdditionalPhotoIds</summary>
    [Obsolete("Use AdditionalPhotoIds instead. Will be removed in Phase 6.")]
    public List<string> AdditionalImageUrls { get; set; } = new();

    /// <summary>OCR raw text (future use)</summary>
    public string? RawText { get; set; }

    // ── Common fields ──
    public string? MerchantName { get; set; }
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

    // ── Photo-First linkage (Phase 5) ──
    /// <summary>Primary photo ID from which this receipt was extracted (PhotoAlbum.Id)</summary>
    public string SourcePhotoId { get; set; } = string.Empty;

    /// <summary>Additional page photos for multi-page receipts</summary>
    public List<string> AdditionalPhotoIds { get; set; } = new();

    // ── Medical-specific fields (Phase 5) ──
    /// <summary>Medical record number (病案号/住院号) — core key for cross-visit grouping</summary>
    public string? MedicalRecordNumber { get; set; }

    /// <summary>Diagnosis text — extracted from diagnosis reports/discharge notes</summary>
    public string? DiagnosisText { get; set; }

    /// <summary>Insurance type (城镇职工 / 城镇居民 / 新农合 / 自费)</summary>
    public string? InsuranceType { get; set; }

    // ── Medical-specific fields (continues) ──
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    public string? FhirResourceType { get; set; }

    public List<ReceiptLineItem> Items { get; set; } = new();
    public List<MedicationItem> Medications { get; set; } = new();
    public List<LabResultItem> LabResults { get; set; } = new();
    public string? ImagingFindings { get; set; }

    // ── Visit linkage (DEPRECATED: superseded by MedicalRecordNumber + MedicalRecordIndex) ──
    /// <summary>Visit ID for legacy grouping — DEPRECATED. Use MedicalRecordNumber lookup instead.</summary>
    [Obsolete("Use MedicalRecordNumber + MedicalRecordIndex for visit grouping. Will be removed in Phase 6.")]
    public string? VisitId { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

**Key changes from Phase 4:**
- `SourcePhotoId` replaces `ImageUrl` as the canonical photo reference (stores `PhotoAlbum.Id`)
- `AdditionalPhotoIds` replaces `AdditionalImageUrls` (stores list of `PhotoAlbum.Id`s)
- `MedicalRecordNumber` enables cross-visit grouping at the Receipt level
- `DiagnosisText` and `InsuranceType` for full medical data capture
- `ImageUrl` / `AdditionalImageUrls` marked `[Obsolete]` but retained for backward compatibility

### 2.2 ReceiptVisit Entity (Enhanced)

File: `server/Models/Entities/ReceiptEntities.cs`

```csharp
/// <summary>
/// Groups related hospital receipts into a single visit/encounter.
/// Phase 5 Enhanced: Added MedicalRecordNumber and InsuranceNumber fields.
/// ReceiptVisit is now a computed view layer, not a primary data store.
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

    // ── Phase 5 New Fields ──

    /// <summary>Medical record number (病案号/住院号) — core correlation key</summary>
    public string? MedicalRecordNumber { get; set; }

    /// <summary>Medical insurance number (医保编号)</summary>
    public string? InsuranceNumber { get; set; }

    public List<string> Tags { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

### 2.3 NEW Entity: MedicalRecordIndex

File: `server/Models/Entities/ReceiptEntities.cs`

```csharp
/// <summary>
/// Medical Record Index — 病案号索引实体.
/// One index entry per (MedicalRecordNumber + OwnerId) per hospital.
/// Aggregates all visit IDs and receipt IDs for a given medical record number.
/// Phase 5 New Entity.
/// </summary>
[BsonIgnoreExtraElements]
public class MedicalRecordIndex
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;

    // ── Core correlation keys ──
    /// <summary>Medical record number (病案号/住院号)</summary>
    public string MedicalRecordNumber { get; set; } = string.Empty;

    /// <summary>Hospital name</summary>
    public string HospitalName { get; set; } = string.Empty;

    // ── Aggregated patient data (from first receipt encountered) ──
    /// <summary>Patient name</summary>
    public string PatientName { get; set; } = string.Empty;

    /// <summary>Insurance type (城镇职工 / 城镇居民 / 新农合 / 自费)</summary>
    public string? InsuranceType { get; set; }

    // ── All associated visit IDs ──
    /// <summary>Associated ReceiptVisit IDs</summary>
    public List<string> VisitIds { get; set; } = new();

    /// <summary>Directly associated Receipt IDs (independent of visits)</summary>
    public List<string> ReceiptIds { get; set; } = new();

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

**MongoDB Collection:** `medical_record_index`
**Unique Index:** Compound on `(MedicalRecordNumber, OwnerId)`

### 2.4 PhotoAlbum Entity (Enhanced)

File: `server/Models/Entities/PhotoEntities.cs`

```csharp
[BsonIgnoreExtraElements]
public class PhotoAlbum
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;

    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string? Base64Data { get; set; }
    public string? FilePath { get; set; }
    public DateTime UploadedAt { get; set; }
    public DateTime? CapturedDate { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? LocationName { get; set; }
    public string? CameraModel { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }

    // ── EXISTING (already supports N:M from photo side) ──
    public List<string> AssociatedReceiptIds { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public string? Notes { get; set; }

    // ── Phase 5 New Fields ──

    /// <summary>
    /// Derivative: Count of receipts extracted from this photo.
    /// Updated automatically when receipts are saved/updated/deleted.
    /// </summary>
    public int ExtractedReceiptCount { get; set; }

    /// <summary>Last OCR status: Pending | Processing | Completed | Failed</summary>
    public string LastOcrStatus { get; set; } = "Pending";

    /// <summary>
    /// Inverted index mapping YYYY-MM -> [receiptId, ...].
    /// Populated automatically when receipts are created/updated.
    /// Enables O(1) receipt-date grouping queries per photo.
    /// Example: { "2026-01": ["rcpt_001", "rcpt_002"], "2026-02": ["rcpt_003"] }
    /// </summary>
    public Dictionary<string, List<string>>? PhotoReceiptDateIndex { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

### 2.5 Optional Entity: ShoppingPriceIndex (Deferred)

```csharp
[BsonIgnoreExtraElements]
public class ShoppingPriceIndex
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string NormalizedItemName { get; set; } = string.Empty;
    public string MerchantName { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateTime Timestamp { get; set; }
    public string ReceiptId { get; set; } = string.Empty;
}
```

**Collection:** `shopping_price_index` (deferred to Phase 5 backend infrastructure)
**Index:** Compound on `(NormalizedItemName, OwnerId, Timestamp)`

---

## 3. API Endpoint Design

### 3.1 Photo Endpoints (PhotoController — `/api/photos`)

#### POST `/api/photos/upload` — Existing (Unchanged)

```
POST /api/photos/upload
Content-Type: application/json

{
  "fileName": "receipt_001.jpg",
  "contentType": "image/jpeg",
  "fileSize": 123456,
  "base64Data": "data:image/jpeg;base64,...",
  "capturedDate": "2026-01-15T09:00:00Z",
  "latitude": 31.23,
  "longitude": 121.47,
  "tags": ["shopping", "walmart"]
}

Response 201:
{
  "id": "photo_abc123",
  "fileName": "receipt_001.jpg",
  "uploadedAt": "2026-01-15T10:30:00Z",
  "capturedDate": "2026-01-15T09:00:00Z",
  "extractedReceiptCount": 0,
  "lastOcrStatus": "Pending",
  "associatedReceiptIds": []
}
```

#### POST `/api/photos/{id}/extract` — Phase 5 New (OCR Trigger)

Triggers the full OCR pipeline (Step 1: Vision + Step 2: Schema Mapping + Step 3: MedicalRecordNumber extraction) on a single photo. Returns a **list** of extracted receipts (not just one).

```
POST /api/photos/{id}/extract
Content-Type: application/json

{
  "ocrPrompt": "string",       // optional, uses default scenario-aware prompt
  "mapPrompt": "string"        // optional, uses default enhanced mapping
}

Response 200:
{
  "photoId": "photo_abc123",
  "status": "Completed",
  "step1RawOcr": "...",
  "step2MappedJson": "[{...}, {...}]",
  "parsedReceipts": [
    {
      "type": "Shopping",
      "category": "Supermarket",
      "merchantName": "Walmart",
      "receiptDate": "2026-01-01",
      "totalAmount": 156.50,
      "items": [{"name": "milk", "quantity": 2, "unitPrice": 12.50}]
    },
    {
      "type": "Medical",
      "category": "PaymentReceipt",
      "hospitalName": "Shanghai Sixth People's Hospital",
      "medicalRecordNumber": "B2026001",
      "receiptDate": "2026-02-10",
      "totalAmount": 340.00,
      "insuranceType": "城镇职工",
      "diagnosisText": "高血压",
      "items": [{"name": "血压检测", "unitPrice": 50.00, "totalPrice": 50.00}]
    }
  ],
  "parsedCount": 2
}
```

**Implementation Note:** This endpoint:
1. Loads the photo, verifies ownership
2. Reads image bytes (FilePath or Base64Data)
3. Runs Step 1 OCR using scenario-aware prompt (GetScenarioAwarePrompt)
4. Runs Step 2 mapping (Qwen VL text-only, with multi-receipt prompt)
5. Runs Step 3 MedicalRecordNumber extraction if type == Medical and number is empty
6. Returns results (does NOT auto-save). The frontend confirms/edits first.
7. Updates `LastOcrStatus` on the PhotoAlbum

#### GET `/api/photos/by-receipt-date?yearMonth=2026-04` — Phase 5 New (DEPRECATED, use /grouped)

```
GET /api/photos/by-receipt-date?yearMonth=2026-04

Response 200:
{
  "yearMonth": "2026-04",
  "photos": [
    {
      "id": "photo_abc123",
      "fileName": "receipt_scan_20260115.jpg",
      "filePath": "/photos/receipt_scan_20260115.jpg",
      "extractedReceiptCount": 2,
      "lastOcrStatus": "Completed",
      "receiptsInMonth": [
        {
          "id": "rcpt_001",
          "type": "Medical",
          "hospitalName": "上海市第六人民医院",
          "receiptDate": "2026-04-15",
          "totalAmount": 340.00,
          "category": "PaymentReceipt"
        }
      ]
    }
  ],
  "totalCount": 5
}
```

**Query Logic:**
1. Query all photos where `PhotoReceiptDateIndex` contains the `yearMonth` key
2. For each matching photo, load associated receipts
3. Filter receipts to those with ReceiptDate in the specified month
4. Return photo summary with matching receipts

#### GET `/api/photos/grouped` — Phase 5 New (Preferred replacement for /by-receipt-date)

```
GET /api/photos/grouped?groupBy=receiptDate&dateRange=2026-04
GET /api/photos/grouped?groupBy=uploadDate&dateRange=2026-01,2026-02
GET /api/photos/grouped?groupBy=capturedDate

Query Params:
  groupBy: "receiptDate" | "uploadDate" | "capturedDate" (default: "receiptDate")
  dateRange: "YYYY-MM" | "YYYY-MM,YYYY-MM" (comma-separated, default: current month)
  type: "Shopping" | "Medical" (optional)
  limit: int (default: 100)
  page: int (default: 1)

Response 200 (groupBy=receiptDate):
{
  "photos": [
    {
      "id": "photo_abc123",
      "fileName": "receipt_scan_20260115.jpg",
      "filePath": "/photos/receipt_scan_20260115.jpg",
      "extractedReceiptCount": 2,
      "lastOcrStatus": "Completed",
      "associatedReceiptIds": ["rcpt_001", "rcpt_002"],
      "receipts": [
        {
          "id": "rcpt_001",
          "type": "Shopping",
          "merchantName": "Walmart",
          "receiptDate": "2026-01-01",
          "totalAmount": 156.50
        },
        {
          "id": "rcpt_002",
          "type": "Medical",
          "hospitalName": "上海市第六人民医院",
          "receiptDate": "2026-02-10",
          "totalAmount": 340.00
        }
      ]
    }
  ],
  "totalCount": 1,
  "page": 1,
  "pageSize": 100
}
```

### 3.2 Receipt Endpoints (ReceiptController — `/api/receipts`)

#### GET `/api/receipts/by-source-photo/{photoId}` — Phase 5 New

Get all receipts extracted from a specific photo.

```
GET /api/receipts/by-source-photo/photo_abc123

Response 200:
[
  {
    "id": "rcpt_001",
    "type": "Shopping",
    "sourcePhotoId": "photo_abc123",
    "additionalPhotoIds": [],
    "merchantName": "Walmart",
    "receiptDate": "2026-01-01",
    "totalAmount": 156.50,
    "items": [{"name": "milk", "quantity": 2, "unitPrice": 12.50}]
  }
]
```

#### POST `/api/receipts/save-confirmed` — Phase 5 New (Moved from VisitController)

Save confirmed receipts with proper photo linkage and index updates.

```
POST /api/receipts/save-confirmed
Content-Type: application/json

{
  "receipts": [
    {
      "photoId": "photo_abc123",
      "sourcePhotoId": "photo_abc123",
      "additionalPhotoIds": [],
      "receiptId": null,         // null = new receipt
      "type": "Medical",
      "category": "PaymentReceipt",
      "hospitalName": "上海市第六人民医院",
      "medicalRecordNumber": "B2026001",
      "insuranceType": "城镇职工",
      "receiptDate": "2026-02-10",
      "totalAmount": 340.00,
      "diagnosisText": "高血压",
      "items": [{"name": "血压检测", "unitPrice": 50.00, "totalPrice": 50.00}]
    }
  ]
}

Response 200:
{
  "results": [
    { "receiptId": "rcpt_new001", "photoId": "photo_abc123", "success": true },
    { "receiptId": "rcpt_old002", "photoId": "photo_abc123", "success": true }
  ]
}
```

**Post-save processing (each confirmed receipt):**
1. Create/update the Receipt document (set `SourcePhotoId` + `AdditionalPhotoIds`)
2. Add receipt ID to source Photo's `AssociatedReceiptIds`
3. Update source Photo's `PhotoReceiptDateIndex[YYYY-MM]` with receipt ID
4. Update source Photo's `ExtractedReceiptCount`
5. If Medical + has `MedicalRecordNumber`: update `MedicalRecordIndex` entry
6. If Shopping: populate `ShoppingPriceIndex` entries
7. If `MedicalRecordNumber` present and `VisitId` present: sync `ReceiptVisit.MedicalRecordNumber`

### 3.3 Visit Endpoints (VisitController — `/api/visits`)

#### GET `/api/visits/medical-index/{medicalRecordNumber}` — Phase 5 New

Query the MedicalRecordIndex entry for a specific record number.

```
GET /api/visits/medical-index/B2026001

Response 200:
{
  "id": "mri_B2026001_上海市第六人民医院",
  "medicalRecordNumber": "B2026001",
  "hospitalName": "上海市第六人民医院",
  "patientName": "张三",
  "insuranceType": "城镇职工",
  "visitIds": ["rvis_001", "rvis_002"],
  "receiptIds": ["rcpt_001", "rcpt_002", "rcpt_003"],
  "createdAt": "2026-01-15T10:00:00Z",
  "updatedAt": "2026-02-10T15:30:00Z"
}

Response 404: No medical record index found for B2026001
```

#### POST `/api/visits/update-visit` — Phase 5 New

Manually adjust a receipt's Visit association, MedicalRecordNumber, and photo linkage.

```
POST /api/visits/update-visit
Content-Type: application/json

{
  "receiptId": "rcpt_001",
  "visitId": "rvis_002",              // optional: change visit group
  "medicalRecordNumber": "B2026002",   // optional: change record number
  "sourcePhotoId": "photo_xyz",        // optional: change source photo
  "additionalPhotoIds": ["photo_abc123"]  // optional: change additional photos
}

Response 200:
{
  "message": "Visit updated successfully.",
  "receiptId": "rcpt_001"
}
```

**Side effects:**
- Updates receipt fields
- If `MedicalRecordNumber` changed: triggers `UpdateMedicalRecordIndexAsync` to update both old and new index entries
- Updates `PhotoReceiptDateIndex` on source Photo
- Syncs `ReceiptVisit.MedicalRecordNumber` if visit changed

#### POST `/api/visits/batch-extract` — Enhanced (Existing)

No API contract change. Phase 5 enhancement is internal:
- Uses scenario-aware prompts (medical/shopping/mixed) via `GetScenarioAwarePrompt()`
- Step 2 mapping now includes `medicalRecordNumber`, `diagnosisText`, `insuranceType`
- Returns `ParsedExtractedReceipt` objects with all Phase 5 fields

#### POST `/api/visits/save-confirmed` — Enhanced (Existing, but moved)

Same contract, but now in ReceiptController. Updated to:
- Save `SourcePhotoId` from DTO (Phase 5)
- Save `AdditionalPhotoIds` (Phase 5)
- Save `MedicalRecordNumber`, `DiagnosisText`, `InsuranceType` (Phase 5)
- Call `UpdateMedicalRecordIndexAsync` when Medical + has MedicalRecordNumber (Phase 5)
- Update Photo `PhotoReceiptDateIndex` and `ExtractedReceiptCount` (Phase 5)

### 3.4 Medical Endpoints (New Controller: MedicalController — `/api/medical`)

#### GET `/api/medical/record-index` — Phase 5 New

List all MedicalRecordIndex entries for the current user.

```
GET /api/medical/record-index

Response 200:
[
  {
    "id": "mri_001",
    "medicalRecordNumber": "B2026001",
    "hospitalName": "上海市第六人民医院",
    "patientName": "张三",
    "visitCount": 2,
    "visitIds": ["rvis_001", "rvis_002"],
    "createdAt": "2026-01-01T10:00:00Z",
    "updatedAt": "2026-02-10T15:30:00Z"
  }
]
```

#### GET `/api/medical/patient-history?medicalRecordNumber=B2026001` — Phase 5 New

Get full cross-visit patient history for a given record number.

```
GET /api/medical/patient-history?medicalRecordNumber=B2026001

Response 200:
{
  "medicalRecordNumber": "B2026001",
  "patientName": "张三",
  "hospitalName": "上海市第六人民医院",
  "totalVisits": 2,
  "totalSpending": 880.00,
  "visits": [
    {
      "visitId": "rvis_001",
      "visitDate": "2026-01-15",
      "department": "心内科",
      "doctorName": "李医生",
      "receiptCount": 3,
      "totalAmount": 540.00,
      "photoCount": 2,
      "receipts": [{ /* ... */ }],
      "medications": [{ /* ... */ }]
    }
  ],
  "medicationHistory": [
    {
      "medicationName": "阿司匹林",
      "prescriptionCount": 2,
      "firstPrescribed": "2026-01-15",
      "lastPrescribed": "2026-03-20",
      "dosages": ["100mg", "100mg"],
      "frequency": "每日一次"
    }
  ]
}
```

### 3.5 Shopping Endpoints (New Controller: ShoppingController — `/api/shopping`) — Deferred

#### GET `/api/shopping/price-history?itemName=milk&merchantName=Walmart`

#### GET `/api/shopping/merchant-summary`

*These endpoints are defined in the PRD but deferred. The backend data infrastructure (ShoppingPriceIndex) is created in Phase 5, but the API endpoints are not implemented until Phase 6+.*

### 3.6 API Summary Table

| Method | Path | Controller | Status |
|--------|------|------------|--------|
| POST | `api/photos/upload` | PhotoController | Existing, unchanged |
| POST | `api/photos/{id}/extract` | PhotoController | **PHASE 5 NEW** |
| GET | `api/photos/grouped` | PhotoController | **PHASE 5 NEW** |
| GET | `api/photos/by-receipt-date` | PhotoController | DEPRECATED (use `/grouped`) |
| GET | `api/receipts/by-source-photo/{photoId}` | ReceiptController | **PHASE 5 NEW** |
| POST | `api/receipts/save-confirmed` | ReceiptController | **PHASE 5 NEW** (moved from VisitController) |
| GET | `api/visits` | VisitController | Existing |
| GET | `api/visits/medical-index/{medicalRecordNumber}` | VisitController | **PHASE 5 NEW** |
| POST | `api/visits/batch-extract` | VisitController | Enhanced (scenario-aware prompts) |
| POST | `api/visits/save-confirmed` | VisitController | **MOVED** to ReceiptController |
| POST | `api/visits/update-visit` | VisitController | **PHASE 5 NEW** |
| GET | `api/medical/record-index` | MedicalController | **PHASE 5 NEW** |
| GET | `api/medical/patient-history` | MedicalController | **PHASE 5 NEW** |
| GET | `api/shopping/price-history` | ShoppingController | DEFERRED (data infra only) |
| GET | `api/shopping/merchant-summary` | ShoppingController | DEFERRED (data infra only) |

---

## 4. Data Flow Diagram

### 4.1 Complete Photo-First Data Flow (Phase 5)

```
+-----------------------------------------------------------------------------+
|                        PHOTO-FIRST DATA FLOW (Phase 5)                       |
+-----------------------------------------------------------------------------+

  User uploads Photo (single or batch)
        │
        ▼
  POST /api/photos/upload  OR  POST /api/photos/batch
        │
        ├─────────────────────────────────────────────────────────┐
        ▼                                                         ▼
  Photo stored: wwwroot/photos/{fileName}          MongoDB: photo_albums
  MongoDB: photo_albums {                            { OwnerId, FileName,
     OwnerId, FileName, UploadedAt,                   UploadedAt, CapturedDate,
     CapturedDate, ...                               ExtractedReceiptCount=0,
  }                                                  LastOcrStatus="Pending",
                                                     PhotoReceiptDateIndex=null }
        │
        ├──► User triggers OCR (single or batch)
        │        │
        │        ▼
        │   POST /api/photos/{id}/extract   OR   POST /api/visits/batch-extract
        │        │
        │        ▼
        │   Step 1: Scenario-Aware Vision OCR (Qwen VL)
        │     GetScenarioAwarePrompt(photo)
        │       ├─ Medical prompt  (filename contains "挂号"/"收费"/...)
        │       ├─ Shopping prompt (filename contains "超市"/"购物"/...)
        │       └─ Mixed prompt   (default fallback)
        │
        │   Step 2: Enhanced Schema Mapping (Qwen VL text-only)
        │     Maps raw OCR → JSON array of ParsedExtractedReceipt
        │     Fields: type, category, hospitalName, medicalRecordNumber,
        │              diagnosisText, insuranceType, totalAmount, items, ...
        │
        │   Step 3: MedicalRecordNumber Special Extraction (NEW)
        │     IF type == "Medical" AND medicalRecordNumber is empty:
        │       Run ExtractMedicalRecordNumberFromText(ocrText)
        │       Patterns: 病案号:B2026001, 住院号:Z2026001, etc.
        │
        │        │
        │        ▼
        │   Return parsedReceipts list to frontend
        │        │
        │        ▼
        │   Frontend: BatchExtractDialog (Phase 5 enhanced)
        │     - Display each receipt as a card (header + preview)
        │     - Editable fields for ALL Phase 5 new fields
        │     - Per-receipt: Save / Edit / Discard / Split
        │     - Batch: Confirm All / Retake
        │        │
        │        ▼
        │   POST /api/receipts/save-confirmed   (or POST /api/visits/save-confirmed)
        │        │
        │        ▼
        │   For EACH confirmed receipt:
        │     1. Create/update Receipt document
        │        - Set SourcePhotoId, AdditionalPhotoIds
        │        - Set MedicalRecordNumber, DiagnosisText, InsuranceType
        │     2. Add receipt.Id to Photo.AssociatedReceiptIds (deduplicated)
        │     3. Update Photo.PhotoReceiptDateIndex[YYYY-MM] += receipt.Id
        │     4. Increment Photo.ExtractedReceiptCount
        │     5. Update Photo.LastOcrStatus = "Completed"
        │     6. IF Medical + MedicalRecordNumber present:
        │        → UpdateMedicalRecordIndexAsync()
        │          - Find or create MedicalRecordIndex entry
        │          - Add receipt.Id to index.ReceiptIds
        │          - Add receipt.VisitId to index.VisitIds (if present)
        │          - Sync HospitalName, PatientName, InsuranceType
        │        → Update ReceiptVisit.MedicalRecordNumber (if VisitId exists)
        │     7. IF Shopping:
        │        → Populate ShoppingPriceIndex entries
        │        → NormalizeItemName for each line item
        │        │
        │        ▼
        │   Photo now appears in:
        │     - Capture-date views (by UploadedAt/CapturedDate)
        │     - Receipt-date views (via PhotoReceiptDateIndex lookup)
        │     - Medical visit timelines (via MedicalRecordNumber lookup)
        │     - Shopping dashboard (via ShoppingPriceIndex, Phase 6+)
        │
        ▼
  Photo persists as immutable artifact
  Receipts are derived, editable metadata layers
```

### 4.2 MedicalRecordNumber Auto-Association Flow

```
  Receipt saved with MedicalRecordNumber = "B2026001"
        │
        ▼
  ┌─ Check MedicalRecordIndex ─────────────────────────────┐
  │  GET by (MedicalRecordNumber, OwnerId)                 │
  │                                                         │
  │  Found? ──Yes──► Add receipt.Id to ReceiptIds          │
  │                   Add visit.Id to VisitIds (if present) │
  │                   Update HospitalName, PatientName       │
  │                   Update MedicalRecordIndex             │
  │                                                         │
  │  Not found? ──► Create new MedicalRecordIndex          │
  │                   ID = "mri_{RecordNumber}_{Hospital}"  │
  │                   ReceiptIds = [receipt.Id]             │
  │                   Store new entry                       │
  └─────────────────────────────────────────────────────────┘
        │
        ▼
  ReceiptVisit sync (if VisitId exists):
    Update ReceiptVisit.MedicalRecordNumber = "B2026001"
    Update ReceiptVisit.InsuranceNumber (if present)
```

### 4.3 Enhanced AutoAssociateService Flow

```
  AutoAssociateAllAsync(userId)
        │
        For each photo without AssociatedReceiptIds:
        │
        ▼
  Level 0: MedicalRecordNumber Exact Match (NEW — HIGHEST PRIORITY)
    For each medical receipt:
      IF receipt.MedicalRecordNumber matches photo tags:
        Associate with highest confidence
        BREAK
        │
  Level 1: OutpatientNumber Match (EXISTING, unchanged)
    For each medical receipt:
      IF receipt.OutpatientNumber found in photo.Tags:
        Associate
        BREAK
        │
  Level 2: Hospital + Patient + Date (EXISTING, enhanced)
    For each medical receipt:
      IF HospitalName + PatientName both present
      AND photo.UploadedAt within +/-3 days of receipt.ReceiptDate
      AND photo.LocationName contains hospital/patient name:
        Associate with higher weight
        BREAK
        │
  Level 3: Hospital Name Match (EXISTING, lowered priority)
    For each medical receipt:
      IF HospitalName present
      AND photo.UploadedAt within +/-7 days of receipt.ReceiptDate
      AND photo.LocationName contains hospital name:
        Associate with lower weight
        BREAK
        │
  No match: bestMatch.Matched = false (record for manual review)
```

---

## 5. MongoDB Index Strategy

### 5.1 Receipts Collection (`receipts`)

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `idx_receipt_owner_date` | `(OwnerId, ReceiptDate)` | Compound, ascending | Efficient "Group By Date" aggregation. Used by receipt-date views. |
| `idx_receipt_owner_medical` | `(OwnerId, MedicalRecordNumber)` | Compound, sparse, partial filter | Fast medical visit lookups by record number. Only indexes documents where MedicalRecordNumber is not null. |
| `idx_receipt_source_photo` | `(OwnerId, SourcePhotoId)` | Compound | Fast reverse lookup: "get all receipts from a photo." Used by `/api/receipts/by-source-photo/{photoId}`. |
| `idx_receipt_owner_type_cat` | `(OwnerId, Type, Category)` | Compound | Filter receipts by type/category (existing use case). |

**MongoDB index creation commands:**
```javascript
db.receipts.createIndex(
    { OwnerId: 1, ReceiptDate: 1 },
    { name: "idx_receipt_owner_date" }
);

db.receipts.createIndex(
    { OwnerId: 1, MedicalRecordNumber: 1 },
    {
        name: "idx_receipt_owner_medical",
        sparse: true,
        partialFilterExpression: { MedicalRecordNumber: { $exists: true, $ne: null } }
    }
);

db.receipts.createIndex(
    { OwnerId: 1, SourcePhotoId: 1 },
    { name: "idx_receipt_source_photo" }
);

db.receipts.createIndex(
    { OwnerId: 1, Type: 1, Category: 1 },
    { name: "idx_receipt_owner_type_cat" }
);
```

### 5.2 PhotoAlbum Collection (`photo_albums`)

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `idx_photo_owner_upload` | `(OwnerId, UploadedAt)` | Compound, descending | Existing: photo list by upload date. |
| `idx_photo_owner_captured` | `(OwnerId, CapturedDate)` | Compound, sparse | Photo list by capture date. |

**PhotoReceiptDateIndex (embedded dictionary):**
- No separate MongoDB index needed for embedded dictionary keys.
- Query uses `$expr` or in-memory matching on the embedded field.
- For large collections (>500 photos), consider a separate flat mapping collection:
```javascript
// Alternative flat mapping collection (if embedded approach becomes slow)
{
    _id: "photo_abc123_2026-01",
    photoId: "photo_abc123",
    owner: "user_xyz",
    yearMonth: "2026-01"
}
// Index: { photoId: 1, yearMonth: 1, owner: 1 }
```

### 5.3 MedicalRecordIndex Collection (`medical_record_index`)

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `idx_medical_record_unique` | `(MedicalRecordNumber, OwnerId)` | Compound, **unique** | Enforce one index entry per record number per user. |

**MongoDB index creation commands:**
```javascript
db.medical_record_index.createIndex(
    { MedicalRecordNumber: 1, OwnerId: 1 },
    { name: "idx_medical_record_unique", unique: true }
);
```

### 5.4 ShoppingPriceIndex Collection (`shopping_price_index`) — Deferred

| Index Name | Fields | Type | Purpose |
|------------|--------|------|---------|
| `idx_price_item_owner_time` | `(NormalizedItemName, OwnerId, Timestamp)` | Compound, descending on Timestamp | Fast price history queries. |

**MongoDB index creation commands:**
```javascript
db.shopping_price_index.createIndex(
    { NormalizedItemName: 1, OwnerId: 1, Timestamp: -1 },
    { name: "idx_price_item_owner_time" }
);
```

---

## 6. DTO Updates

### 6.1 ParsedExtractedReceipt (Step 2 mapping output)

```csharp
public class ParsedExtractedReceipt
{
    public string Type { get; set; } = "Shopping";
    public string Category { get; set; } = string.Empty;
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }

    // ── Phase 5 New Fields ──
    public string? MedicalRecordNumber { get; set; }
    public string? DiagnosisText { get; set; }
    public string? InsuranceType { get; set; }
    public string? InsuranceNumber { get; set; }

    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string Currency { get; set; } = "CNY";
    public string? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }
    public string? Notes { get; set; }
    public List<ReceiptLineItemDto> Items { get; set; } = new();
    public List<MedicationItemDto> Medications { get; set; } = new();
    public List<LabResultItemDto> LabResults { get; set; } = new();
}
```

### 6.2 SaveConfirmed Request DTO

```csharp
public class SaveConfirmedRequest
{
    public List<ConfirmReceipt> Receipts { get; set; } = new();
}

public class ConfirmReceipt
{
    public string? ReceiptId { get; set; }
    public string PhotoId { get; set; } = string.Empty;

    // ── Phase 5: Primary photo reference ──
    public string? SourcePhotoId { get; set; }
    public List<string>? AdditionalPhotoIds { get; set; }

    // ── Receipt fields ──
    public string Type { get; set; } = ReceiptType.Shopping;
    public string Category { get; set; } = string.Empty;
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }

    // ── Phase 5 New Fields ──
    public string? MedicalRecordNumber { get; set; }
    public string? DiagnosisText { get; set; }
    public string? InsuranceType { get; set; }
    public string? InsuranceNumber { get; set; }

    public decimal? TotalAmount { get; set; }
    public string? Currency { get; set; } = "CNY";
    public string? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }
    public string? Notes { get; set; }

    public string? PhotoImageUrl { get; set; }
    public string? RawText { get; set; }
    public List<ReceiptLineItemDto> Items { get; set; } = new();
    public List<MedicationItemDto> Medications { get; set; } = new();
    public List<LabResultItemDto> LabResults { get; set; } = new();
}
```

### 6.3 TypeScript Frontend Types

```typescript
// MedicalRecordIndex entry
interface MedicalRecordIndexEntry {
  id: string;
  medicalRecordNumber: string;
  hospitalName: string;
  patientName: string;
  insuranceType?: string;
  visitIds: string[];
  receiptIds: string[];
  createdAt: string;
  updatedAt: string;
}

// Patient cross-visit history response
interface PatientHistoryResponse {
  medicalRecordNumber: string;
  patientName: string;
  hospitalName: string;
  totalVisits: number;
  totalSpending: number;
  visits: MedicalVisitSummary[];
  medicationHistory: MedHistoryEntry[];
}

interface MedicalVisitSummary {
  visitId: string;
  visitDate: string;
  department: string;
  doctorName: string;
  receiptCount: number;
  totalAmount: number;
  photoCount: number;
  receipts: ReceiptSummary[];
  medications: MedicationSummary[];
}

// Photo grouped by receipt date
interface PhotoGroupedByReceiptDateResponse {
  photos: PhotoGroupItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface PhotoGroupItem {
  id: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
  capturedDate?: string;
  extractedReceiptCount: number;
  lastOcrStatus: string;
  associatedReceiptIds: string[];
  receipts: ReceiptSummary[];
}

interface ReceiptSummary {
  id: string;
  type: string;
  category: string;
  merchantName?: string;
  hospitalName?: string;
  receiptDate: string;
  totalAmount: number;
}
```

---

## 7. Group Title Generation (Frontend Logic)

```csharp
string GenerateGroupTitle(IEnumerable<Receipt> receipts)
{
    var dateStr = $"{receipts.First().ReceiptDate.Value.Year}年{receipts.First().ReceiptDate.Value.Month}月";

    var hospitals = receipts
        .Where(r => r.Type == "Medical")
        .Select(r => r.HospitalName)
        .Distinct()
        .Where(h => !string.IsNullOrEmpty(h))
        .ToList();

    var merchants = receipts
        .Where(r => r.Type == "Shopping")
        .Select(r => r.MerchantName)
        .Distinct()
        .Where(m => !string.IsNullOrEmpty(m))
        .ToList();

    if (hospitals.Count == 1 && merchants.Count == 0)
        return $"{dateStr} - {hospitals[0]} ({receipts.First().Category}) - {receipts.Sum(r => r.TotalAmount ?? 0):F2}元";

    if (merchants.Count == 1 && hospitals.Count == 0)
        return $"{dateStr} - {merchants[0]} ({receipts.First().Category}) - {receipts.Sum(r => r.TotalAmount ?? 0):F2}元";

    if (hospitals.Count > 1 || merchants.Count > 1)
        return $"{dateStr} - 多种票据 - {receipts.Count()}张";

    return $"{dateStr} - 未分类票据 - {receipts.Sum(r => r.TotalAmount ?? 0):F2}元";
}
```

---

## 8. Compatibility with Existing Architecture

### 8.1 Additive-Only Changes

All Phase 5 changes follow the additive principle:

| File | Change Type | Backward Compatibility |
|------|-------------|----------------------|
| `ReceiptEntities.cs` | Added fields only | **Compatible** — Old clients ignore new fields |
| `ReceiptEntities.cs` | `ReceiptVisit` added fields | **Compatible** — Existing visit queries unchanged |
| `ReceiptEntities.cs` | New `MedicalRecordIndex` class | **Compatible** — New collection, no existing code touches it |
| `PhotoEntities.cs` | Added 3 new fields | **Compatible** — New fields have default values |
| `VisitController.cs` | Enhanced `BatchExtract` prompt | **Compatible** — Same request/response contract |
| `VisitController.cs` | Enhanced `SaveConfirmed` | **Compatible** — Additional side effects, same response |
| `VisitController.cs` | Added new endpoints | **Compatible** — New routes, no existing route changes |
| `AutoAssociateService.cs` | Added Level 0 matching | **Compatible** — Same interface, higher accuracy |
| `PhotoController.cs` | New endpoints | **Compatible** — New routes |
| `Program.cs` | New MongoDB indexes | **Compatible** — Idempotent, safe to re-run |

### 8.2 Deprecated Fields (Migration Path)

| Old Field | Replaced By | Deprecation Phase | Removal Plan |
|-----------|-------------|-------------------|-------------|
| `Receipt.ImageUrl` | `Receipt.SourcePhotoId` | Phase 5 | Phase 6 — backfill from SourcePhotoId |
| `Receipt.AdditionalImageUrls` | `Receipt.AdditionalPhotoIds` | Phase 5 | Phase 6 — backfill from AdditionalPhotoIds |
| `Receipt.VisitId` (string) | `MedicalRecordNumber` + `MedicalRecordIndex` | Phase 5 | Phase 6 — query replaced by MedicalRecordIndex lookup |
| `GET /api/photos/by-receipt-date` | `GET /api/photos/grouped?groupBy=receiptDate` | Phase 5 | Phase 6 — return 410 Gone |

**Deprecation Strategy:**
- All deprecated fields retain their `[Obsolete]` attribute with a message indicating replacement
- During Phase 5 migration, `ImageUrl` is populated from `SourcePhotoId` for backward compat
- Old clients can continue to use `ImageUrl` until Phase 6 migration removes it
- API versioning is NOT used — all changes are additive at the response level

### 8.3 Existing Endpoints Unchanged

The following existing endpoints are NOT modified (backward compatible):

| Endpoint | Method | Status |
|----------|--------|--------|
| `GET /api/photos` | GET | No change |
| `GET /api/photos/by-date-range` | GET | No change |
| `GET /api/photos/by-upload-date` | GET | No change |
| `GET /api/photos/by-captured-date` | GET | No change |
| `GET /api/photos/by-receipt/{receiptId}` | GET | No change |
| `GET /api/photos/{id}` | GET | Response adds `extractedReceiptCount`, `lastOcrStatus` |
| `PUT /api/photos/{id}` | PUT | No change |
| `DELETE /api/photos/{id}` | DELETE | No change |
| `GET /api/receipts` | GET | Response adds `sourcePhotoId`, `medicalRecordNumber` |
| `GET /api/receipts/{id}` | GET | Response adds `sourcePhotoId`, `medicalRecordNumber` |
| `POST /api/receipts` | POST | No change |
| `PUT /api/receipts/{id}` | PUT | No change |
| `DELETE /api/receipts/{id}` | DELETE | No change |
| `GET /api/visits` | GET | No change |
| `GET /api/visits/stats` | GET | No change |
| `POST /api/visits/auto-associate` | POST | No change |
| `POST /api/visits/relink` | POST | No change |

### 8.4 Service Layer Changes

| Service | Changes | Backward Compatible |
|---------|---------|-------------------|
| `PhotoService` | New methods: `GetGroupedAsync`, `UpdateReceiptCountAsync` | **Yes** — existing methods unchanged |
| `ReceiptRepository` | New methods: `GetBySourcePhotoIdAsync`, `GetByMedicalRecordNumberAsync` | **Yes** — existing methods unchanged |
| `PhotoRepository` | New method: `GetByReceiptDateIndexAsync` | **Yes** |
| `AutoAssociateService` | Added Level 0 matching, enhanced Level 2 | **Yes** — same interface |
| `VisitStatsService` | Unchanged | **Yes** |

### 8.5 Data Migration Compatibility

Phase 5 includes startup migration scripts that are idempotent and safe to re-run:

1. **Backfill SourcePhotoId** — Sets `SourcePhotoId` from `ImageUrl` filename matching (if not already set)
2. **Backfill PhotoReceiptDateIndex** — Builds embedded index from existing `AssociatedReceiptIds`
3. **Backfill MedicalRecordNumber** — Extracts from `RawText` using regex patterns
4. **Build MedicalRecordIndex** — Creates index entries from existing Medical receipts
5. **Backfill ShoppingPriceIndex** — Populates price index from existing Shopping receipts

All migration scripts check if data already exists before writing, making them safe to run multiple times.

---

## 9. Edge Cases and Design Decisions

### 9.1 Photo Deleted After Receipt Extraction

- Receipts are NOT deleted when source photo is deleted.
- `SourcePhotoId` becomes a dangling reference.
- Receipt detail view shows "Source photo unavailable" placeholder.

### 9.2 Photo Appears in Multiple Month Views

- A photo with Receipt #1 (Jan) and Receipt #2 (Feb) appears in BOTH month views.
- This is the core behavior. Each photo appears once per month (deduplicated per group).
- The `PhotoReceiptDateIndex` naturally supports this: `{ "2026-01": [rcpt_1], "2026-02": [rcpt_2] }`

### 9.3 Re-OCR on Same Photo

- Photo stays in album with `LastOcrStatus` updated.
- New receipts are added; existing receipts are preserved unless explicitly replaced.
- `ExtractedReceiptCount` is incremented.
- `PhotoReceiptDateIndex` is updated with new receipt IDs.

### 9.4 MedicalRecordNumber Transcription Errors

- Receipts with the same `MedicalRecordNumber` but dates > 30 days apart show a "Possible separate visits" warning.
- User can manually split the group via `POST /api/visits/update-visit`.

### 9.5 MedicalRecordIndex Key Collision

- The unique index on `(MedicalRecordNumber, OwnerId)` ensures one entry per record number per user.
- If the same user uploads receipts from the same record number at different hospitals, a second entry is created (different `HospitalName`).

### 9.6 Performance: Embedded Dictionary vs Separate Collection

- `PhotoReceiptDateIndex` as an embedded dictionary works well for < 500 photos.
- For larger collections, the flat mapping collection (see Index Strategy section) provides better query performance via standard MongoDB indexes.

---

## 10. Implementation Order (Recommended)

### Phase 5A — Entity & Index Foundation (1 day)
1. Verify `Receipt`, `ReceiptVisit`, `PhotoAlbum`, `MedicalRecordIndex` entities in code
2. Add MongoDB indexes (all are idempotent)
3. Create new DTOs for new endpoints

### Phase 5B — New Endpoints (2-3 days)
1. Implement `POST /api/photos/{id}/extract`
2. Implement `GET /api/photos/grouped`
3. Implement `GET /api/receipts/by-source-photo/{photoId}`
4. Implement `POST /api/receipts/save-confirmed`
5. Implement `GET /api/visits/medical-index/{medicalRecordNumber}`
6. Implement `POST /api/visits/update-visit`
7. Create `MedicalController` with `/api/medical/record-index` and `/api/medical/patient-history`

### Phase 5C — Service & Integration (1-2 days)
1. Wire up `UpdateMedicalRecordIndexAsync` in SaveConfirmed flow
2. Wire up `UpdatePhotoReceiptDateIndexAsync` in SaveConfirmed flow
3. Enhance `AutoAssociateService` with Level 0 matching
4. Update `ReceiptRepository` with new query methods

### Phase 5D — Migration Script (0.5 day)
1. Run backfill scripts for SourcePhotoId, PhotoReceiptDateIndex, MedicalRecordNumber, MedicalRecordIndex

### Phase 5E — Frontend (Phase 6, out of scope for this doc)

---

## 11. Appendix: Deprecation Plan Summary

| Item | Replaced By | Phase 5 Status | Phase 6+ Action |
|------|-------------|----------------|-----------------|
| `Receipt.ImageUrl` | `Receipt.SourcePhotoId` | Kept, marked `[Obsolete]` | Backfill from SourcePhotoId, then remove |
| `Receipt.AdditionalImageUrls` | `Receipt.AdditionalPhotoIds` | Kept, marked `[Obsolete]` | Backfill, then remove |
| `Receipt.VisitId` (string) | `MedicalRecordNumber` + `MedicalRecordIndex` | Kept for compat | Query replaced, then remove |
| `GET /api/photos/by-receipt-date` | `GET /api/photos/grouped` | Kept for compat | Return 410 Gone |
| `POST /api/visits/save-confirmed` | `POST /api/receipts/save-confirmed` | Kept in VisitController (same impl) | Redirect to ReceiptController |

---

**Document End — Architecture_Phase5_Enhanced.md v2.0**
**Created by:** Architecture Director (KanKan)
**Date:** 2026-04-23
