# Architecture: Phase 4 — Photo-First Receipt & Medical Management

**Version:** 1.0
**Date:** 2026-04-23
**Stack:** .NET 9 + MongoDB, React 18 + TypeScript + MUI
**Related:** PRD_Phase4.md

---

## 1. Overview

Phase 4 shifts KanKan from a **Receipt-Centric** model to a **Photo-First** model. The Photo is now the immutable primary artifact. Receipts are derived, editable metadata layers extracted via OCR. A single Photo can produce multiple Receipts (N:M relationship), and Receipts are grouped by their own dates rather than the Photo's capture date.

---

## 2. Schema Redesign

### 2.1 Collection Mapping Summary

| Collection         | Document Type           | Partition Key | Notes                              |
|--------------------|-------------------------|---------------|------------------------------------|
| `photo_albums`     | PhotoAlbum              | OwnerId       | Primary artifact, no schema change |
| `receipts`         | Receipt                 | OwnerId       | New: SourcePhotoId, AdditionalPhotoIds, MedicalRecordNumber |
| `receipt_visits`   | ReceiptVisit            | OwnerId       | Enhanced: MedicalRecordNumber      |
| `medical_record_index` | MedicalRecordIndex    | OwnerId       | NEW collection                     |
| `shopping_price_index` | ShoppingPriceIndex    | OwnerId       | NEW collection (future)            |

---

### 2.2 PhotoAlbum (photos) — Minimal Changes

The PhotoAlbum entity requires only **additive** changes. No existing fields are removed.

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

    // -- EXISTING (already supports N:M from photo side) --
    public List<string> AssociatedReceiptIds { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public string? Notes { get; set; }

    // -- NEW FIELDS --
    public int ExtractedReceiptCount { get; set; }          // Derivative: count of receipts extracted from this photo
    public string LastOcrStatus { get; set; } = "Pending";   // Pending | Processing | Completed | Failed

    // -- INVERTED INDEX (embedded, for receipt-date queries) --
    // Maps YYYY-MM -> [receiptId, ...]
    // Populated automatically when receipts are created/updated/deleted.
    // Example: { "2026-01": ["rcpt_001", "rcpt_002"], "2026-02": ["rcpt_003"] }
    public Dictionary<string, List<string>>? PhotoReceiptDateIndex { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

**Design rationale for simplification:**
- The PRD originally described a simplified `Photo` collection storing only image paths, upload timestamp, and EXIF capture timestamp, plus N:M links to receipts. However, the existing `PhotoAlbum` already has all needed fields (EXIF, GPS, dimensions, tags, notes). Adding new fields is cleaner than migrating to a new document. The name stays `PhotoAlbum` to avoid breaking existing MongoDB queries, controller routes, and frontend references.
- `AssociatedReceiptIds` already exists from `PhotoCreateRequest.AssociatedReceiptIds`. This provides the photo-side N:M link.
- The `PhotoReceiptDateIndex` embedded dictionary provides O(1) receipt-date lookups per photo.

---

### 2.3 Receipt — New Fields

The Receipt entity gets three new fields to support the N:M photo-receipt relationship and medical visit linking.

```csharp
[BsonIgnoreExtraElements]
public class Receipt
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string Type { get; set; } = ReceiptType.Shopping;
    public string Category { get; set; } = string.Empty;

    // -- REMOVED (replaced by SourcePhotoId) --
    // public string ImageUrl { get; set; } = string.Empty;        // <-- DEPRECATE
    // public List<string> AdditionalImageUrls { get; set; } = new(); // <-- DEPRECATE

    // -- NEW: photo linkage (replaces ImageUrl/AdditionalImageUrls) --
    public string SourcePhotoId { get; set; } = string.Empty;             // Primary photo the receipt was extracted from
    public List<string> AdditionalPhotoIds { get; set; } = new();         // Additional page photos (multi-page receipts)

    public string? RawText { get; set; }

    // -- Common fields --
    public string? MerchantName { get; set; }
    public decimal? TotalAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateTime? ReceiptDate { get; set; }
    public string? OutpatientNumber { get; set; }
    public string? MedicalInsuranceNumber { get; set; }

    // -- NEW: MedicalRecordNumber for visit grouping --
    public string? MedicalRecordNumber { get; set; }          // 病案号. Optional. Used to group receipts into visits.

    public string? InsuranceType { get; set; }
    public decimal? MedicalInsuranceFundPayment { get; set; }
    public decimal? PersonalSelfPay { get; set; }
    public decimal? OtherPayments { get; set; }
    public decimal? PersonalAccountPayment { get; set; }
    public decimal? PersonalOutOfPocket { get; set; }
    public decimal? CashPayment { get; set; }
    public string? Notes { get; set; }
    public List<string> Tags { get; set; } = new();

    // -- DEPRECATED: replace with MedicalRecordNumber + ReceiptVisit lookup --
    public string? VisitId { get; set; }                       // <-- DEPRECATE (keep for backward compat during migration)

    public string? HospitalName { get; set; }
    public string? Department { get; set; }
    public string? DoctorName { get; set; }
    public string? PatientName { get; set; }
    public string? DiagnosisText { get; set; }
    public string? FhirResourceType { get; set; }

    public List<ReceiptLineItem> Items { get; set; } = new();
    public List<MedicationItem> Medications { get; set; } = new();
    public List<LabResultItem> LabResults { get; set; } = new();
    public string? ImagingFindings { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

**Key changes:**
1. **`SourcePhotoId`** replaces `ImageUrl` as the primary photo reference. It stores the `PhotoAlbum.Id` directly.
2. **`AdditionalPhotoIds`** replaces `AdditionalImageUrls` for multi-page receipts.
3. **`MedicalRecordNumber`** enables cross-visit lookup without needing a separate `VisitId` lookup.
4. **`ImageUrl` / `AdditionalImageUrls`** are deprecated but retained during migration. Once migrated, they can be removed.

**How to resolve a photo URL from SourcePhotoId:**
```
// Given a receipt.SourcePhotoId:
var photo = await photoRepo.GetByIdAsync(receipt.SourcePhotoId);
var imageUrl = $"/photos/{photo.FileName}";  // Same pattern as batch-extract
```

---

### 2.4 New Entity: MedicalRecordIndex

```csharp
[BsonIgnoreExtraElements]
public class MedicalRecordIndex
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;

    // Key lookup fields
    public string MedicalRecordNumber { get; set; } = string.Empty;  // 病案号
    public string HospitalName { get; set; } = string.Empty;

    // Aggregated patient data (from first receipt encountered)
    public string PatientName { get; set; } = string.Empty;

    // All visit IDs associated with this record number
    public List<string> VisitIds { get; set; } = new();

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

**Index:** Compound unique on `(MedicalRecordNumber, OwnerId)`.

---

### 2.5 Optional: MedicalVisits (ReceiptVisit) vs MedicalRecordNumber Design

**Decision: Use MedicalRecordNumber in Receipts + MedicalRecordIndex (no separate MedicalVisits CRUD API).**

The ReceiptVisit entity is retained as a **computed view** layer, not a primary data store.

**Why:**
- MedicalVisits is derived from Receipts that share `MedicalRecordNumber + HospitalName`.
- Creating a separate collection for Visits introduces synchronization complexity (when a receipt is deleted, the Visit must be updated).
- Querying "get all receipts for Visit X" is done by:
  1. Get `MedicalRecordIndex` entry for the record number.
  2. Resolve `VisitIds` to get grouped receipts from the Receipts collection.
- The ReceiptVisit entity remains as a legacy grouping tool (auto-associated by `AutoAssociateService`) but the primary grouping key is `MedicalRecordNumber`.

**Grouping logic (computed on query):**
```
1. Query Receipts WHERE MedicalRecordNumber = X AND OwnerId = Y
2. Group by (MedicalRecordNumber + HospitalName)
3. Within each group, sub-group by visit date range ( receipts within 30 days of each other)
4. This produces the "Visit" view
```

---

### 2.6 New Entity: ShoppingPriceIndex (Deferred)

```csharp
[BsonIgnoreExtraElements]
public class ShoppingPriceIndex
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string NormalizedItemName { get; set; } = string.Empty;  // Lowercase, stripped of qty/unit
    public string MerchantName { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateTime Timestamp { get; set; }    // receipt.ReceiptDate
    public string ReceiptId { get; set; } = string.Empty;
}
```

**Index:** Compound on `(NormalizedItemName, OwnerId, Timestamp)`.

**Build trigger:** When a Shopping receipt is saved, populate this index. Backfill on migration.

---

## 3. Indexing Strategy

### 3.1 Receipts Collection

| Index | Fields | Type | Purpose |
|-------|--------|------|---------|
| idx_receipt_owner_date | OwnerId, ReceiptDate | Compound, ascending on ReceiptDate | Efficient "Group By Date" aggregation. Used by receipt-date views. |
| idx_receipt_owner_medical | OwnerId, MedicalRecordNumber | Compound (sparse, non-null MedicalRecordNumber only) | Fast medical visit lookups by record number. |
| idx_receipt_source_photo | OwnerId, SourcePhotoId | Compound | Fast reverse lookup: "get all receipts from a photo." |
| idx_receipt_owner_type_cat | OwnerId, Type, Category | Compound | Filter receipts by type/category (existing use case). |

### 3.2 PhotoAlbum Collection

| Index | Fields | Type | Purpose |
|-------|--------|------|---------|
| idx_photo_owner_upload | OwnerId, UploadedAt | Compound, descending | Existing: photo list by upload date. |
| idx_photo_owner_captured | OwnerId, CapturedDate | Compound (sparse) | Photo list by capture date. |
| idx_photo_owner_receipt_date_index | OwnerId, PhotoReceiptDateIndex | Document-level | Enable fast lookup of photos by receipt date range via embedded index keys. |

### 3.3 MedicalRecordIndex Collection

| Index | Fields | Type | Purpose |
|-------|--------|------|---------|
| idx_medical_record_unique | MedicalRecordNumber, OwnerId | Compound, **unique** | Enforce one index entry per record number per user. |

### 3.4 ShoppingPriceIndex Collection

| Index | Fields | Type | Purpose |
|-------|--------|------|---------|
| idx_price_item_owner_time | NormalizedItemName, OwnerId, Timestamp | Compound, descending | Fast price history queries. |

---

## 4. API Design

### 4.1 Photo Endpoints (PhotoController — `api/photos`)

#### POST `api/photos/upload` — Standard Upload (existing, unchanged)

Already implemented. No changes needed.

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
  ...
}
```

#### POST `api/photos/{id}/extract` — New OCR Endpoint

Triggers the full OCR pipeline (Step 1: Vision + Step 2: Schema Mapping) on a single photo. Returns a **list** of extracted receipts (not just one).

```
POST /api/photos/{id}/extract
Content-Type: application/json
{
  "ocrPrompt": "string",       // optional, uses default
  "mapPrompt": "string"        // optional, uses default
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
      "items": [{ "name": "milk", "quantity": 2, "unitPrice": 12.50 }]
    },
    {
      "type": "Medical",
      "category": "PaymentReceipt",
      "hospitalName": "Shanghai Sixth People's Hospital",
      "medicalRecordNumber": "B2026001",
      "receiptDate": "2026-02-10",
      "totalAmount": 340.00
    }
  ],
  "parsedCount": 2
}
```

**Implementation note:** This is a refactored, isolated version of the OCR logic currently in `VisitController.BatchExtract()`. It should:
1. Load the photo by ID, verify ownership.
2. Read image bytes (FilePath or Base64Data).
3. Run Step 1 OCR (Qwen VL vision).
4. Run Step 2 mapping (Qwen VL text-only, with multi-receipt prompt).
5. Return results (do NOT auto-save). The frontend confirms/edits first.
6. Update `LastOcrStatus` on the Photo.

**Also update `PhotoReceiptDateIndex` on the Photo** when receipts are saved (see SaveConfirmed flow below).

#### GET `api/photos/grouped` — New Grouped View

Returns Photos grouped by their receipt dates (not capture/upload dates). This is the core "Receipt-Date Grouped View".

```
GET /api/photos/grouped?groupBy=receiptDate&dateRange=2026-01
GET /api/photos/grouped?groupBy=receiptDate&dateRange=2026-01&dateRange=2026-02
GET /api/photos/grouped?groupBy=uploadDate&dateRange=2026-01

Query Params:
  groupBy: "receiptDate" | "uploadDate" | "capturedDate"  (default: "receiptDate")
  dateRange: "YYYY-MM" | "YYYY-MM,YYYY-MM" (comma-separated range)  (default: current month)
  type: "Shopping" | "Medical"  (optional, filter receipts by type)
  limit: int (default: 100)
  page: int (default: 1)
```

**Response:**
```json
{
  "photos": [
    {
      "id": "photo_abc123",
      "fileName": "receipt_scan_20260115.jpg",
      "uploadedAt": "2026-01-15T10:30:00Z",
      "capturedDate": "2026-01-15T09:00:00Z",
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
          "hospitalName": "Shanghai Sixth People's Hospital",
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

**Query Logic (groupBy=receiptDate):**
1. Parse `dateRange` into YYYY-MM keys (e.g., `["2026-01", "2026-02"]`).
2. Query all photos where `PhotoReceiptDateIndex` contains at least one key from the range.
3. For each photo, load associated receipts from the Receipts collection.
4. Filter receipts by optional `type` param.
5. Deduplicate: each photo appears once even if it has receipts across multiple months in the range.
6. Enrich each photo card with the matching receipts' data.

**Query Logic (groupBy=uploadDate / capturedDate):**
1. Standard existing query: filter by `UploadedAt` or `CapturedDate` range.
2. Same response shape for consistency.

---

### 4.2 Receipt Endpoints (ReceiptController — `api/receipts`)

#### GET `api/receipts/by-source-photo/{photoId}` — New

Get all receipts extracted from a specific photo.

```
GET /api/receipts/by-source-photo/photo_abc123

Response 200:
[
  { /* ReceiptResponse */ },
  { /* ReceiptResponse */ }
]
```

#### POST `api/receipts/save-confirmed` — New (moved from VisitController)

Save confirmed receipts with proper photo linkage. This endpoint handles both new receipts and updates.

```
POST /api/receipts/save-confirmed
Content-Type: application/json

{
  "receipts": [
    {
      "photoId": "photo_abc123",
      "receiptId": null,       // null = new receipt
      "type": "Shopping",
      "category": "Supermarket",
      "merchantName": "Walmart",
      "receiptDate": "2026-01-01",
      "totalAmount": 156.50,
      "items": [{ "name": "milk", "quantity": 2, "unitPrice": 12.50 }],
      ...
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

**Post-save processing:**
1. For each saved receipt, update the source Photo's `AssociatedReceiptIds` (ensure uniqueness).
2. Update the source Photo's `PhotoReceiptDateIndex` with the receipt's YYYY-MM key.
3. Update the source Photo's `ExtractedReceiptCount`.
4. If `MedicalRecordNumber` is present, update the `MedicalRecordIndex` entry.
5. If Shopping receipt with items, populate `ShoppingPriceIndex` entries.

---

### 4.3 Visit Endpoints (VisitController — `api/visits`)

#### GET `api/visits/by-medical-record?medicalRecordNumber=B2026001` — New

Query visits (grouped receipts) by MedicalRecordNumber.

```
GET /api/visits/by-medical-record?medicalRecordNumber=B2026001

Response 200:
{
  "medicalRecordNumber": "B2026001",
  "hospitalName": "Shanghai Sixth People's Hospital",
  "patientName": "Zhang San",
  "visits": [
    {
      "visitId": "rvis_001",
      "visitDate": "2026-02-10",
      "department": "Cardiology",
      "doctorName": "Dr. Li",
      "receiptCount": 3,
      "totalAmount": 540.00,
      "photoCount": 2,
      "receipts": [ /* ... */ ]
    }
  ],
  "totalVisits": 1,
  "totalSpending": 540.00,
  "totalReceipts": 3
}
```

#### POST `api/visits/batch-extract` — Modified

Existing endpoint. Minor change: the response DTO includes `SourcePhotoId` for each receipt (which it already does via `BatchExtractResult`). No API contract change needed, just ensure the downstream `SaveConfirmed` flow populates `SourcePhotoId`.

---

### 4.4 Medical Endpoints (New Controller: `api/medical`)

#### GET `api/medical/record-index`

List all MedicalRecordIndex entries for the current user.

```
GET /api/medical/record-index

Response 200:
[
  {
    "id": "mri_001",
    "medicalRecordNumber": "B2026001",
    "hospitalName": "Shanghai Sixth People's Hospital",
    "patientName": "Zhang San",
    "visitCount": 2,
    "visitIds": ["rvis_001", "rvis_002"],
    "createdAt": "2025-06-01T10:00:00Z",
    "updatedAt": "2026-02-10T15:30:00Z"
  }
]
```

#### GET `api/medical/patient-history?medicalRecordNumber=B2026001`

Get full cross-visit patient history.

```
GET /api/medical/patient-history?medicalRecordNumber=B2026001

Response 200:
{
  "medicalRecordNumber": "B2026001",
  "patientName": "Zhang San",
  "hospitalName": "Shanghai Sixth People's Hospital",
  "totalVisits": 2,
  "totalSpending": 880.00,
  "visits": [ /* ordered chronologically */ ],
  "medicationHistory": [ /* aggregate medications across visits */ ]
}
```

---

### 4.5 Shopping Endpoints (New Controller: `api/shopping`) — Deferred

#### GET `api/shopping/price-history?itemName=milk&merchantName=Walmart`

#### GET `api/shopping/merchant-summary`

---

### 4.6 API Summary Table

| Method | Path | Controller | Status |
|--------|------|------------|--------|
| POST | `api/photos/upload` | PhotoController | Existing, unchanged |
| POST | `api/photos/{id}/extract` | PhotoController | **NEW** |
| GET | `api/photos/grouped` | PhotoController | **NEW** |
| GET | `api/photos/{id}` | PhotoController | Existing, adds new response fields |
| GET | `api/photos/by-receipt-date` | PhotoController | **DEPRECATED** (replace with `/grouped`) |
| GET | `api/receipts` | ReceiptController | Existing |
| GET | `api/receipts/{id}` | ReceiptController | Existing, adds SourcePhotoId field |
| GET | `api/receipts/by-source-photo/{photoId}` | ReceiptController | **NEW** |
| POST | `api/receipts/save-confirmed` | ReceiptController | **NEW** (moved from VisitController) |
| POST | `api/receipts/extract` | ReceiptController | Existing, no change |
| GET | `api/visits` | ReceiptController | Existing |
| GET | `api/visits/{id}` | ReceiptController | Existing |
| GET | `api/visits/by-medical-record` | VisitController | **NEW** |
| POST | `api/visits/batch-extract` | VisitController | Existing, source-photo linkage in save flow |
| POST | `api/visits/save-confirmed` | VisitController | **MOVED** to ReceiptController |
| GET | `api/medical/record-index` | MedicalController | **NEW** |
| GET | `api/medical/patient-history` | MedicalController | **NEW** |
| GET | `api/shopping/price-history` | ShoppingController | **DEFERRED** |
| GET | `api/shopping/merchant-summary` | ShoppingController | **DEFERRED** |

---

## 5. Service Layer Design

### 5.1 New Services

#### `IPhotoReceiptDateService`

Resolves photos by receipt date ranges using the embedded `PhotoReceiptDateIndex`.

```csharp
public interface IPhotoReceiptDateService
{
    Task<PhotoGroupedByReceiptDateResponse> GetByDateRangeAsync(
        string ownerId,
        string groupBy,           // "receiptDate" | "uploadDate" | "capturedDate"
        IReadOnlyList<string> dateRanges,  // ["2026-01", "2026-02"]
        string? type = null,
        int page = 1,
        int pageSize = 100);

    Task UpdatePhotoDateIndexAsync(PhotoAlbum photo, Receipt savedReceipt);
    Task RemovePhotoDateIndexAsync(PhotoAlbum photo, Receipt deletedReceipt);
}
```

**Implementation:**
- `GetByDateRangeAsync`:
  - If `groupBy == "receiptDate"`: Query `photo_albums` where `PhotoReceiptDateIndex` contains any key in `dateRanges`. For each matching photo, resolve associated receipts.
  - If `groupBy == "uploadDate"`: Query by `UploadedAt` range (existing logic).
  - If `groupBy == "capturedDate"`: Query by `CapturedDate` range (existing logic).
- `UpdatePhotoDateIndexAsync`: Add the receipt's YYYY-MM key to the photo's index. Increment `ExtractedReceiptCount`.

#### `IMedicalRecordIndexService`

Manages MedicalRecordIndex CRUD and auto-association of new receipts.

```csharp
public interface IMedicalRecordIndexService
{
    Task<MedicalRecordIndex?> GetOrCreateAsync(string ownerId, string recordNumber, string hospitalName, string? patientName);
    Task<List<MedicalRecordIndex>> GetAllAsync(string ownerId);
    Task<MedicalRecordIndex?> GetByRecordNumberAsync(string ownerId, string recordNumber);
    Task<MedicalRecordIndex> AssociateReceiptAsync(string ownerId, string recordNumber, string visitId);
    Task<(List<ReceiptVisit> visits, List<Receipt> receipts, decimal totalSpending)> GetPatientHistoryAsync(
        string ownerId, string recordNumber, string? hospitalName = null);
}
```

**Implementation:**
- `GetOrCreateAsync`: Find or create a MedicalRecordIndex entry. Uses unique compound index on (MedicalRecordNumber, OwnerId).
- `AssociateReceiptAsync`: When a receipt is saved with MedicalRecordNumber, add the visit ID to the index's VisitIds list.
- `GetPatientHistoryAsync`: Resolve all visits and receipts for a given record number.

#### `IShoppingPriceIndexService` — Deferred

```csharp
public interface IShoppingPriceIndexService
{
    Task PopulateFromReceiptAsync(Receipt shoppingReceipt);
    Task<PriceHistoryResponse> GetPriceHistoryAsync(string ownerId, string normalizedItemName, string? merchantName = null);
    Task<MerchantSummaryResponse> GetMerchantSummaryAsync(string ownerId, string merchantName);
}
```

---

### 5.2 Existing Services to Modify

#### `PhotoService`

Add methods:
```csharp
Task<PhotoGroupedByReceiptDateResponse> GetGroupedAsync(string ownerId, GetGroupedRequest request);
Task UpdateReceiptCountAsync(string ownerId, string photoId, int receiptCount);
```

#### `ReceiptRepository`

Add methods:
```csharp
Task<List<Receipt>> GetBySourcePhotoIdAsync(string ownerId, string sourcePhotoId);
Task<List<Receipt>> GetByMedicalRecordNumberAsync(string ownerId, string? medicalRecordNumber);
Task<List<Receipt>> GetByDateRangeAsync(string ownerId, DateTime startDate, DateTime endDate);
```

#### `PhotoRepository`

Add methods:
```csharp
Task<List<PhotoAlbum>> GetByReceiptDateIndexAsync(string ownerId, IReadOnlyList<string> dateKeys);
```

---

## 6. DTO Updates

### 6.1 PhotoDtos.cs Changes

Add to `PhotoCreateRequest`:
```csharp
public Dictionary<string, List<string>>? PhotoReceiptDateIndex { get; set; }
```

Add to `PhotoResponse`:
```csharp
public int ExtractedReceiptCount { get; set; }
public string LastOcrStatus { get; set; } = "Pending";
public string? SourcePhotoId => Id;  // alias
```

Add new DTOs:
```csharp
public class PhotoGroupedRequest
{
    public string GroupBy { get; set; } = "receiptDate";  // receiptDate | uploadDate | capturedDate
    public string DateRange { get; set; } = "";           // "YYYY-MM" or "YYYY-MM,YYYY-MM"
    public string? Type { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 100;
}

public class PhotoGroupedByReceiptDateResponse
{
    public List<PhotoGroupItem> Photos { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

public class PhotoGroupItem
{
    public string Id { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? FilePath { get; set; }
    public DateTime UploadedAt { get; set; }
    public DateTime? CapturedDate { get; set; }
    public int ExtractedReceiptCount { get; set; }
    public string LastOcrStatus { get; set; } = "Pending";
    public List<string> AssociatedReceiptIds { get; set; } = new();
    public List<ReceiptSummaryDto> Receipts { get; set; } = new();
}

public class ReceiptSummaryDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string? MerchantName { get; set; }
    public string? HospitalName { get; set; }
    public DateTime? ReceiptDate { get; set; }
    public decimal? TotalAmount { get; set; }
}

public class PhotoExtractResponse
{
    public string PhotoId { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public string? Step1RawOcr { get; set; }
    public string? Step2MappedJson { get; set; }
    public List<ParsedExtractedReceipt> ParsedReceipts { get; set; } = new();
    public int ParsedCount => ParsedReceipts.Count;
}
```

### 6.2 ReceiptDtos.cs Changes

Add to `ReceiptResponse`:
```csharp
public string SourcePhotoId { get; set; } = string.Empty;
public List<string> AdditionalPhotoIds { get; set; } = new();
public string? MedicalRecordNumber { get; set; }
```

Deprecate (mark for future removal):
```csharp
[Obsolete("Use SourcePhotoId + resolve photo file path instead. Will be removed in Phase 5.")]
public string ImageUrl { get; set; } = string.Empty;
```

### 6.3 BatchExtractDtos.cs — No structural change needed

The existing `ConfirmedReceipt` already has `PhotoId`. The `SaveConfirmed` flow will now use `SourcePhotoId` instead of `ImageUrl`.

---

## 7. Migration Strategy

### 7.1 Startup Migration (Run Once)

#### Step 1: Backfill SourcePhotoId on Existing Receipts

```csharp
foreach (var receipt in allReceipts)
{
    if (string.IsNullOrEmpty(receipt.SourcePhotoId) && !string.IsNullOrEmpty(receipt.ImageUrl))
    {
        // Extract photo filename from ImageUrl (e.g., "/photos/receipt_001.jpg")
        var fileName = Path.GetFileName(receipt.ImageUrl.TrimStart('/'));
        var photo = await photoRepo.FindOneAsync(p => p.FileName == fileName && p.OwnerId == receipt.OwnerId);
        if (photo != null)
        {
            receipt.SourcePhotoId = photo.Id;
            receipt.UpdatedAt = DateTime.UtcNow;
            await receiptRepo.UpdateAsync(receipt);
        }
    }
}
```

#### Step 2: Populate PhotoReceiptDateIndex on Existing Photos

```csharp
foreach (var photo in allPhotos)
{
    if (photo.AssociatedReceiptIds.Any())
    {
        var receipts = await receiptRepo.GetByIdsAsync(photo.AssociatedReceiptIds);
        var index = new Dictionary<string, List<string>>();
        foreach (var receipt in receipts.Where(r => r.ReceiptDate.HasValue))
        {
            var month = receipt.ReceiptDate.Value.ToString("yyyy-MM");
            if (!index.ContainsKey(month)) index[month] = new();
            if (!index[month].Contains(receipt.Id))
                index[month].Add(receipt.Id);
        }
        photo.PhotoReceiptDateIndex = index.Any() ? index : null;
        photo.ExtractedReceiptCount = receipts.Count;
        photo.UpdatedAt = DateTime.UtcNow;
        await photoRepo.UpdateAsync(photo);
    }
}
```

#### Step 3: Backfill MedicalRecordNumber

For existing Medical receipts with RawText:
```csharp
foreach (var receipt in medicalReceipts.Where(r => r.Type == ReceiptType.Medical && string.IsNullOrEmpty(r.MedicalRecordNumber) && !string.IsNullOrEmpty(r.RawText)))
{
    // Use regex or AI to extract MedicalRecordNumber from RawText
    // Pattern examples: 病案号: B2026001, 住院号: Z2026001, etc.
    var match = Regex.Match(receipt.RawText, @"[病住]案号[:：]?\s*([A-Z]?\d{6,})");
    if (match.Success)
    {
        receipt.MedicalRecordNumber = match.Groups[1].Value;
        receipt.UpdatedAt = DateTime.UtcNow;
        await receiptRepo.UpdateAsync(receipt);
    }
}
```

#### Step 4: Populate MedicalRecordIndex

```csharp
var medicalReceipts = await receiptRepo.GetByMedicalRecordNumberAsync(ownerId, null); // get all with MedicalRecordNumber
var indexMap = new Dictionary<string, MedicalRecordIndex>();

foreach (var receipt in medicalReceipts)
{
    var key = $"{receipt.MedicalRecordNumber}_{receipt.HospitalName}";
    if (!indexMap.ContainsKey(key))
    {
        indexMap[key] = new MedicalRecordIndex
        {
            Id = $"mri_{Guid.NewGuid():N}",
            OwnerId = ownerId,
            MedicalRecordNumber = receipt.MedicalRecordNumber!,
            HospitalName = receipt.HospitalName ?? "",
            PatientName = receipt.PatientName ?? "",
            VisitIds = new List<string> { receipt.VisitId ?? $"rvis_{Guid.NewGuid():N}" }
        };
    }
    else if (!indexMap[key].VisitIds.Contains(receipt.VisitId ?? string.Empty))
    {
        indexMap[key].VisitIds.Add(receipt.VisitId ?? string.Empty);
        indexMap[key].UpdatedAt = DateTime.UtcNow;
    }
}

foreach (var entry in indexMap.Values)
{
    await medicalRecordIndexRepo.CreateAsync(entry);
}
```

---

## 8. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PHOTO-FIRST DATA FLOW                        │
└─────────────────────────────────────────────────────────────────────┘

  User uploads Photo
        │
        ▼
  POST /api/photos/upload
        │
        ▼
  Photo stored: wwwroot/photos/{fileName}
  MongoDB: photo_albums { OwnerId, FileName, UploadedAt, CapturedDate, ... }
        │
        ├──► User triggers OCR
        │        │
        │        ▼
        │   POST /api/photos/{id}/extract
        │        │
        │        ▼
        │   Step 1: Qwen VL Vision → Raw text
        │   Step 2: Qwen VL Mapping → JSON array of receipts
        │        │
        │        ▼
        │   Return parsedReceipts (list, not single)
        │        │
        │        ▼
        │   Frontend: user confirms/edits receipts
        │        │
        │        ▼
        │   POST /api/receipts/save-confirmed
        │        │
        │        ▼
        │   For each confirmed receipt:
        │     1. Create/update Receipt (set SourcePhotoId)
        │     2. Add receipt Id to Photo.AssociatedReceiptIds
        │     3. Update Photo.PhotoReceiptDateIndex[YYYY-MM]
        │     4. Update Photo.ExtractedReceiptCount
        │     5. If Medical: update MedicalRecordIndex
        │     6. If Shopping: populate ShoppingPriceIndex
        │        │
        │        ▼
        │   Photo now appears in:
        │     - Capture-date views (by UploadedAt/CapturedDate)
        │     - Receipt-date views (via PhotoReceiptDateIndex)
        │     - Medical visit timelines (via MedicalRecordNumber)
        │     - Shopping dashboard (via ShoppingPriceIndex)
        │
        ▼
  Photo persists as immutable artifact
  Receipts are derived, editable metadata layers
```

---

## 9. Field Replacement Guide: ImageUrl → SourcePhotoId

| Old Field | New Field | Resolution |
|-----------|-----------|------------|
| `receipt.ImageUrl` | `receipt.SourcePhotoId` | `photo = photoRepo.GetByIdAsync(receipt.SourcePhotoId)` → `"/photos/" + photo.FileName` |
| `receipt.AdditionalImageUrls` | `receipt.AdditionalPhotoIds` | Same resolution for each ID |

**Migration note:** During the transition period, `ImageUrl` is populated from the SourcePhotoId. After migration is complete, `ImageUrl` and `AdditionalImageUrls` can be removed.

---

## 10. Edge Cases

### 10.1 Photo Deleted After Receipt Extraction

- Receipts are NOT deleted when source photo is deleted.
- `SourcePhotoId` becomes a dangling reference.
- Receipt detail view shows "Source photo unavailable" placeholder.

### 10.2 Photo Appears in Multiple Month Views

- A photo with Receipt #1 (Jan) and Receipt #2 (Feb) appears in BOTH views.
- This is the core behavior change. Each photo appears once per month view (deduplicated).

### 10.3 Re-OCR on Same Photo

- Photo stays in album with `LastOcrStatus` updated.
- New receipts are added; existing receipts are preserved unless explicitly replaced.
- `ExtractedReceiptCount` is incremented.

### 10.4 MedicalRecordNumber Transcription Errors

- Receipts with same MedicalRecordNumber but dates > 30 days apart show a "Possible separate visits" warning.
- User can manually split the group.

---

## 11. Implementation Order (Phased Within Phase 4)

### Phase 4A — Foundation (1-2 days)
1. Add `SourcePhotoId`, `AdditionalPhotoIds`, `MedicalRecordNumber` to Receipt entity.
2. Add `ExtractedReceiptCount`, `LastOcrStatus`, `PhotoReceiptDateIndex` to PhotoAlbum entity.
3. Create MedicalRecordIndex entity + repository.
4. Create DTOs for new endpoints.
5. Add MongoDB indexes.

### Phase 4B — New Endpoints (2-3 days)
1. Implement `POST /api/photos/{id}/extract`.
2. Implement `GET /api/photos/grouped`.
3. Implement `GET /api/receipts/by-source-photo/{photoId}`.
4. Implement `POST /api/receipts/save-confirmed`.
5. Implement `GET /api/visits/by-medical-record`.
6. Implement `GET /api/medical/record-index` and `/api/medical/patient-history`.

### Phase 4C — Integration & Services (1-2 days)
1. Wire up services: `PhotoReceiptDateService`, `MedicalRecordIndexService`.
2. Update `SaveConfirmed` to populate indexes.
3. Update `BatchExtract` save flow to use `SourcePhotoId`.

### Phase 4D — Migration Script (0.5 day)
1. Backfill `SourcePhotoId`, `PhotoReceiptDateIndex`, `MedicalRecordNumber`, `MedicalRecordIndex`.

### Phase 4E — Frontend (TBD, out of scope for this doc)

---

## 12. Appendix: Full New Entity Definitions

### MedicalRecordIndex
```csharp
[BsonIgnoreExtraElements]
public class MedicalRecordIndex
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string MedicalRecordNumber { get; set; } = string.Empty;
    public string HospitalName { get; set; } = string.Empty;
    public string PatientName { get; set; } = string.Empty;
    public List<string> VisitIds { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

### ShoppingPriceIndex (Deferred)
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

---

## 13. Appendix: Index Creation Commands

```javascript
// MongoDB indexes to create:

// Receipts collection
db.receipts.createIndex({ OwnerId: 1, ReceiptDate: 1 }, { name: "idx_receipt_owner_date" });
db.receipts.createIndex({ OwnerId: 1, MedicalRecordNumber: 1 }, { 
    name: "idx_receipt_owner_medical", 
    sparse: true, 
    partialFilterExpression: { MedicalRecordNumber: { $exists: true, $ne: null } } 
});
db.receipts.createIndex({ OwnerId: 1, SourcePhotoId: 1 }, { name: "idx_receipt_source_photo" });
db.receipts.createIndex({ OwnerId: 1, Type: 1, Category: 1 }, { name: "idx_receipt_owner_type_cat" });

// PhotoAlbum collection
db.photo_albums.createIndex({ OwnerId: 1, UploadedAt: -1 }, { name: "idx_photo_owner_upload" });
db.photo_albums.createIndex({ OwnerId: 1, CapturedDate: 1 }, { 
    name: "idx_photo_owner_captured", 
    sparse: true 
});
// PhotoReceiptDateIndex is embedded — no separate index needed for dict keys.
// Use $where or $expr queries, or a collection scan with key matching.
// For large collections, consider a separate photo_receipt_date_mapping collection instead of embedded.

// MedicalRecordIndex collection
db.medical_record_index.createIndex(
    { MedicalRecordNumber: 1, OwnerId: 1 }, 
    { name: "idx_medical_record_unique", unique: true }
);

// ShoppingPriceIndex collection (deferred)
db.shopping_price_index.createIndex(
    { NormalizedItemName: 1, OwnerId: 1, Timestamp: -1 }, 
    { name: "idx_price_item_owner_time" }
);
```

**Important note on PhotoReceiptDateIndex:** The embedded dictionary approach works well for < 500 photos. For larger datasets, consider replacing it with a separate `photo_receipt_date_mapping` collection:
```javascript
// Alternative: flat mapping collection
{
    _id: "photo_abc123_2026-01",
    photoId: "photo_abc123",
    owner: "user_xyz",
    yearMonth: "2026-01"
}
// Index: { photoId: 1, yearMonth: 1, owner: 1 }
```

---

## 14. Appendix: Deprecation Plan

| Field | Replaced By | Phase to Remove |
|-------|-------------|-----------------|
| `Receipt.ImageUrl` | `Receipt.SourcePhotoId` | Phase 5 |
| `Receipt.AdditionalImageUrls` | `Receipt.AdditionalPhotoIds` | Phase 5 |
| `Receipt.VisitId` (string) | `Receipt.MedicalRecordNumber` + `MedicalRecordIndex` | Phase 5 |
| `Photo.AssociatedReceiptIds` | (kept, now dual-redundant with SourcePhotoId) | Never (backward compat) |
| `GET /api/photos/by-receipt-date` | `GET /api/photos/grouped` | Phase 5 |
