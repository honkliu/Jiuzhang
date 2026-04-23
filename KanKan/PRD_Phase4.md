# PRD: Phase 4 — Photo-First Receipt & Medical Management

**版本:** 1.0
**日期:** 2026-04-23
**状态:** Draft for Review
**项目:** KanKan (~/gitroot/Jiuzhang/KanKan)
**技术栈:** .NET 9 + MongoDB, React 18 + TypeScript + MUI

---

## 1. Executive Summary

### 1.1 Problem Statement

The current KanKan Photo/OCR module uses a **Receipt-Centric** model: Receipts are the primary artifact, and Photos are secondary attachments. This creates several issues:

1. **One-time extraction loss**: Once OCR is performed, the photo is effectively discarded from the UI. Users can revisit the receipt details but cannot re-examine the original photo in context.
2. **One-Photo-One-Receipt constraint**: The current model handles a single receipt per photo poorly. Real-world behavior — holding up a paper with both a shopping receipt and a medical receipt on the same page — is forced into a manual "one receipt per photo" workflow.
3. **No cross-receipt photo persistence**: When the same photo contains receipts from different dates (e.g., a Jan 1 shopping receipt and a Feb 1 medical receipt on the same piece of paper), the photo only appears under its capture/upload date. It does not surface in views filtered by receipt dates.
4. **Medical visits are scattered**: Without MedicalRecordNumber (病案号) linkage, bills from the same visit remain scattered across separate receipts with no unified "Visit" container.

### 1.2 Vision

Shift from "Receipt Entry" to **Photo-First Management**.

- The **Photo** is the primary, immutable artifact.
- **Receipts** are extracted metadata layers — derived, editable, and always traceable back to the source photo.
- A **single photo can contain multiple receipts** (N:M relationship).
- Receipts are **grouped by their own date** (not the photo's capture date), so a photo appears in every relevant month view.
- Chinese medical data is structured by **Visit** and linked via MedicalRecordNumber for cross-visit history.
- Shopping data is structured by **Merchant + Item + Unit Price** to enable future price comparison and purchase frequency reminders.

---

## 2. Core Concept: Photo-First Architecture

### 2.1 The Photo as Primary Artifact

```
Photo (single source of truth)
  |
  +-- Photo file (JPEG/PNG/WebP, stored in wwwroot/photos/)
  |
  +-- Photo metadata (upload date, capture date, EXIF, tags, notes)
  |
  +-- [Extracted Receipt Layers]  <-- RECEIPT IS NOW A CHILD OF PHOTO
       |
       +-- Receipt #1 (extracted by OCR)
       |     Type: Shopping
       |     Date: 2026-01-15
       |     Merchant: Walmart
       |     Items: [milk, bread, eggs]
       |
       +-- Receipt #2 (extracted by OCR)
             Type: Medical
             Date: 2026-02-10
             Hospital: Shanghai Sixth People's Hospital
             Category: PaymentReceipt
```

### 2.2 N:M Relationship: Photo <-> Receipt

```
Current Model (1-to-many, receipt-centric):
  Photo ---> AssociatedReceiptIds ---> [Receipt A, Receipt B]

New Model (N:M, photo-centric):
  Photo A ---> [Receipt #1 (date Jan 1), Receipt #2 (date Feb 1)]
  Photo B ---> [Receipt #3 (date Jan 15)]

  Result: Photo A appears in BOTH January AND February views.
          Photo B appears in January view only.
```

**Key Logic:**
- A Receipt references its source Photo (and optionally additional page photos).
- A Photo references all Receipts extracted from it.
- View queries by date (month/year) must return Photos whose **associated receipts** fall within the queried date range, **regardless of the photo's own capture/upload date**.

### 2.3 Data Flow

```
User uploads Photo --> Photo stored on disk + MongoDB metadata
     |
     v
Batch OCR (Qwen VL Step1 + Step2) --> Raw OCR text + Mapped JSON receipts
     |
     v
Frontend review: User confirms / edits / splits receipts
     |
     v
Save Confirmed --> Create/update Receipt entities, link to Photo
     |
     v
Photo appears in:
  - Photo Album (by capture date)
  - Receipt views (by receipt date)
  - Medical Visit Timeline (by MedicalRecordNumber grouping)
  - Shopping Dashboard (by merchant/item price tracking)
```

---

## 3. Data Model Changes

### 3.1 PhotoAlbum (Photos) — No structural changes needed

Existing fields remain compatible. The `AssociatedReceiptIds` list already supports the N:M relationship from the photo side.

**Additional fields needed:**

| Field | Type | Purpose |
|-------|------|---------|
| `ExtractedReceiptCount` | int | Derivative count of receipts extracted from this photo. Useful for UI badges and index building. |
| `LastOcrStatus` | string | "Pending", "Processing", "Completed", "Failed" |

### 3.2 Receipt — New field: SourcePhotoId

| Field | Type | Purpose |
|-------|------|---------|
| `SourcePhotoId` | string | **The primary photo this receipt was extracted from.** Required. Links back to PhotoAlbum. |
| `AdditionalPhotoIds` | List<string> | Additional page photos (multi-page receipts). |

These fields ensure every receipt is always traceable to its source photo. They also enable "reverse lookup" — find all receipts from a given photo, and find all photos that contributed to a given receipt.

### 3.3 ReceiptVisit — Enhanced with MedicalRecordNumber

Existing fields are retained. New field added:

| Field | Type | Purpose |
|-------|------|---------|
| `MedicalRecordNumber` | string | **病案号**. The Chinese hospital record number used to group multiple bills into a single visit. This is the key linkage field for cross-bill visit grouping. |

**Relationship:**
- A ReceiptVisit groups receipts that share the same `MedicalRecordNumber`.
- A single Receipt can belong to at most one Visit.
- A Visit can contain multiple Receipts (Registration + Lab Result + Payment Receipt + etc.).
- The Visit's `VisitDate` is derived as the earliest receipt date within the group.

### 3.4 New: MedicalRecordIndex

A lookup index to quickly find all visits associated with a given MedicalRecordNumber:

| Field | Type | Purpose |
|-------|------|---------|
| `MedicalRecordNumber` | string | The 病案号 (unique per patient per hospital). |
| `OwnerId` | string | User who owns the record. |
| `HospitalName` | string | The hospital associated with this record number. |
| `VisitIds` | List<string> | IDs of all visits using this record number. |
| `PatientName` | string | Patient name (from the first receipt encountered). |
| `CreatedAt` | DateTime | When this index was created. |
| `UpdatedAt` | DateTime | Last update time. |

**Purpose:** Enables cross-visit patient history aggregation. When a user uploads a new receipt with a known MedicalRecordNumber, the system can immediately associate it with all prior visits for that patient.

### 3.5 New: ShoppingPriceIndex

A price tracking index for future price comparison:

| Field | Type | Purpose |
|-------|------|---------|
| `OwnerId` | string | User who owns the record. |
| `NormalizedItemName` | string | Lowercase, trimmed item name (stripped of quantity/unit suffixes like "500ml", "袋", "瓶"). |
| `MerchantName` | string | The merchant where this item was purchased. |
| `UnitPrice` | decimal | Unit price at time of purchase. |
| `Currency` | string | Currency code (default CNY). |
| `Timestamp` | DateTime | Purchase date. |
| `ReceiptId` | string | Source receipt ID for traceability. |

**Purpose:** Enables future features:
- Price trend charts per item.
- "Best price" alerts (was this item cheaper elsewhere?).
- Purchase frequency reminders ("You bought milk 3 times in the past 2 weeks").

---

## 4. User-Facing Features

### 4.1 Photo Album — Enhanced Views

#### 4.1.1 Capture-Date Grouped View (Existing, Enhanced)

Photos grouped by their `CapturedDate` (or `UploadedAt` fallback). This is the default view.

- **Modification:** Each photo card now shows a badge indicating how many receipts were extracted. Clicking the badge or receipt icon opens the receipt detail overlay without leaving the photo view.

#### 4.1.2 Receipt-Date Grouped View (NEW)

Photos grouped by the **receipt dates** of their extracted receipts.

**Logic:**
1. Query all receipts where `ReceiptDate` falls within the selected month.
2. For each matching receipt, resolve its `SourcePhotoId`.
3. Collect unique Photos. Each Photo appears **once** in the month view, even if it contains multiple receipts that fall in the same month.
4. Each Photo in this view shows **all** its associated receipts' details as a collapsible overlay.

**Example:**
```
Photo A (CapturedDate: Jan 15)
  contains:
    - Receipt #1 (Date: Jan 1) -- Shopping
    - Receipt #2 (Date: Feb 1) -- Medical

Result:
  - Photo A appears in JANUARY view (because Receipt #1 is Jan 1)
  - Photo A appears in FEBRUARY view (because Receipt #2 is Feb 1)
  - In both views, the user can see both Receipt #1 and Receipt #2
```

This is the **most critical behavioral change** for Phase 4.

#### 4.1.3 Receipt-Centric View (NEW)

A traditional receipt list view, but with enhanced photo links:

- Receipts sorted by receipt date (newest first).
- Each receipt card shows a thumbnail link to its source photo.
- Filtering by date range shows receipts whose dates fall in range.
- **Filter by Photo:** A dropdown showing all photos, with a count of extracted receipts per photo. Selecting a photo shows all its receipts.

#### 4.1.4 Batch Operations from Photo View

From the Photo Album:
- **Batch OCR**: Select 1-20 photos, trigger OCR pipeline. Results shown inline.
- **Batch Confirm**: After OCR, user confirms/edit individual receipt data inline within the photo card.
- **Batch Export**: Export all receipt data from selected photos as CSV/JSON.

### 4.2 Medical Visit Timeline — Enhanced by MedicalRecordNumber

#### 4.2.1 Visit Grouping

Current behavior: Receipts grouped by `HospitalName + Date`.

New behavior: Receipts grouped by `MedicalRecordNumber` (病案号) first.

**Grouping logic:**
1. If a receipt has a `MedicalRecordNumber`, look up or create a `MedicalRecordIndex` entry.
2. If the `MedicalRecordNumber` already exists for this user + hospital, associate the receipt with all existing visits for that record number.
3. If `MedicalRecordNumber` is new, create a new `MedicalRecordIndex` entry and a new `ReceiptVisit`.
4. Within a MedicalRecordNumber group, group by actual visit date (earliest receipt date in the batch).

#### 4.2.2 Cross-Visit Patient History

In the Medical Dashboard:

- **Patient Timeline**: A vertical timeline showing all visits for a patient (by MedicalRecordNumber), ordered chronologically.
- Each visit shows:
  - Visit date range
  - Hospital name
  - Department
  - Doctor name
  - Diagnosis (from Diagnosis receipts)
  - Total amount paid
  - Photo count (how many source photos contribute to this visit)
- **Search by patient name**: Search across all visits for a given patient name (useful when different visits have slightly different name spellings).
- **MedicalRecordNumber search**: Direct lookup by record number.

#### 4.2.3 ReceiptDetail in Medical Context

When viewing a Medical receipt:
- Show a sidebar listing all other receipts from the same Visit (same MedicalRecordNumber).
- Show a "Previous Visits" panel listing other visits for the same MedicalRecordNumber.
- Show medication history: aggregate all medications prescribed across all visits for this patient.

### 4.3 Shopping Dashboard — Price Tracking

#### 4.3.1 Item Price History

Per item (normalized name):
- Chart showing unit price over time.
- Table showing all purchase instances (date, merchant, quantity, unit price, total).
- Highlight cheapest purchase.

#### 4.3.2 Merchant Summary

Per merchant:
- Total spending
- Number of purchases
- Average visit frequency
- Most-purchased items
- Price trends for top items

#### 4.3.3 Purchase Frequency Reminders (Future)

When an item is purchased with regular frequency:
- Flag items purchased within user-defined intervals (e.g., "milk every 7 days").
- Send notification when it's time to restock (future feature, but data must be available).

### 4.4 Receipt Capture & Extraction UX

#### 4.3.1 Single-Photo Extraction Flow

1. User selects a photo in the Photo Album.
2. Clicks "Extract Receipts" or the photo auto-triggers OCR (if batch-extract is configured).
3. OCR returns one or more receipt candidates (JSON array from Step 2).
4. Frontend displays each receipt as a **card overlay** on the photo.
5. User can:
   - Confirm a receipt (saves it, links to photo).
   - Edit fields (merchant, date, amount, items, etc.).
   - Split a receipt (if OCR merged two receipts).
   - Delete a receipt (if it's a false positive).
   - Add a new receipt (manual entry, referencing the photo).

#### 4.3.2 Multi-Receipt Confirmation

When a photo contains multiple receipts:
- Each receipt card shows a "Source Photo" thumbnail (always visible).
- Receipts with different dates are visually separated (different month headers in the overlay).
- The parent photo is **not** hidden; it remains accessible via a "View Full Photo" button on each receipt card.

---

## 5. API Changes

### 5.1 New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/photos/by-receipt-date` | Query photos whose associated receipts have `ReceiptDate` in the given range. Query params: `startDate`, `endDate`, `type` (optional). |
| GET | `/api/receipts/by-source-photo/{photoId}` | Get all receipts extracted from a specific photo. |
| POST | `/api/visits/by-medical-record` | Query visits by `MedicalRecordNumber`. Query param: `medicalRecordNumber`. |
| GET | `/api/medical/record-index` | List all MedicalRecordIndex entries for the current user. |
| GET | `/api/shopping/price-history` | Get price history for a normalized item name. Query params: `itemName`, `merchantName` (optional). |
| GET | `/api/shopping/merchant-summary` | Get spending summary per merchant. |

### 5.2 Modified Endpoints

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/visits` | Added `MedicalRecordNumber` to response DTOs. Group receipts by MedicalRecordNumber first. |
| POST | `/api/visits/batch-extract` | Response now includes `SourcePhotoId` for each receipt. |
| POST | `/api/visits/save-confirmed` | Now accepts `SourcePhotoId` and `AdditionalPhotoIds`. Creates receipts with proper photo linkage. |
| POST | `/api/photos` | Added `ExtractedReceiptCount` tracking on save. |

### 5.3 New Backend Services

| Service | Purpose |
|---------|---------|
| `IPhotoByReceiptDateService` | Resolves photos by receipt date ranges. Uses an inverted index for performance. |
| `IMedicalRecordIndexService` | Manages MedicalRecordIndex CRUD and lookups. Auto-associates new receipts to existing records. |
| `IShoppingPriceIndexService` | Manages ShoppingPriceIndex entries. Builds and queries price history. |
| `IVisitGroupingService` | Orchestrates visit grouping logic: first by MedicalRecordNumber, then by date. |

### 5.4 API Contract Details

#### GET /api/photos/by-receipt-date

**Request:**
```
GET /api/photos/by-receipt-date?startDate=2026-01-01&endDate=2026-01-31&type=Medical
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
      "thumbnailUrl": "/photos/thumbnails/abc123.jpg",
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
          "receiptDate": "2026-01-15",
          "totalAmount": 234.00
        }
      ]
    }
  ],
  "totalCount": 1
}
```

**Behavior:** Returns a photo if ANY of its associated receipts have a `ReceiptDate` within the query range. Each receipt's date is checked independently. A single photo appears once even if multiple receipts match.

#### GET /api/shopping/price-history

**Request:**
```
GET /api/shopping/price-history?itemName=milk&merchantName=Walmart
```

**Response:**
```json
{
  "itemName": "Milk",
  "currency": "CNY",
  "entries": [
    {
      "date": "2026-01-01",
      "merchantName": "Walmart",
      "quantity": 1,
      "unit": "瓶",
      "unitPrice": 12.50,
      "totalPrice": 12.50,
      "receiptId": "rcpt_001"
    },
    {
      "date": "2025-12-20",
      "merchantName": "Carrefour",
      "quantity": 1,
      "unit": "瓶",
      "unitPrice": 11.00,
      "totalPrice": 11.00,
      "receiptId": "rcpt_098"
    }
  ],
  "priceTrend": {
    "minUnitPrice": 11.00,
    "maxUnitPrice": 12.50,
    "avgUnitPrice": 11.75,
    "currentPrice": 12.50,
    "cheapestMerchant": "Carrefour"
  }
}
```

---

## 6. MongoDB Schema Details

### 6.1 Inverted Photo-Receipt Date Index

For performance, add an embedded index in each `PhotoAlbum` document:

```json
{
  "_photoReceiptDateIndex": {
    "2026-01": ["rcpt_001", "rcpt_002"],
    "2026-02": ["rcpt_003"]
  }
}
```

This maps YYYY-MM keys to receipt IDs contained within the photo. When querying by date range, the system:
1. Looks up photos where ANY key in `_photoReceiptDateIndex` falls within the range.
2. Resolves receipt details to populate the full response.
3. Deduplicates photos (a photo with receipts in both Jan and Feb appears once).

### 6.2 Collection Mapping

| Collection | Document Type | Partition/Owner Key |
|-----------|---------------|---------------------|
| `photo_albums` | PhotoAlbum | OwnerId |
| `receipts` | Receipt | OwnerId |
| `receipt_visits` | ReceiptVisit | OwnerId |
| `medical_record_index` | MedicalRecordIndex | OwnerId |
| `shopping_price_index` | ShoppingPriceIndex | OwnerId |

### 6.3 Indexes to Create

| Collection | Field(s) | Type | Purpose |
|-----------|----------|------|---------|
| receipts | OwnerId + ReceiptDate | Compound | Fast receipt date range queries |
| receipts | SourcePhotoId | Single | Fast reverse lookup from photo to receipts |
| receipts | MedicalRecordNumber + OwnerId | Compound | Fast visit lookups by record number |
| medical_record_index | MedicalRecordNumber + OwnerId | Compound (unique) | Enforce record number uniqueness per user |
| shopping_price_index | NormalizedItemName + OwnerId + Timestamp | Compound | Fast price history queries |
| photo_albums | OwnerId + UploadedAt | Compound | Existing query pattern |
| photo_albums | _photoReceiptDateIndex | Document-level | Index-based photo-by-receipt-date resolution |

---

## 7. Frontend Architecture

### 7.1 Component Hierarchy

```
PhotoAlbumPage (main container)
  |-- ViewModeToggle (grid / grouped / receiptGrouped / receiptDateGrouped)
  |-- PhotoUploader (upload dialog)
  |-- PhotoReceiptGroupedView (receipt-centric grouping)
  |-- PhotoDateGroupedView (NEW: receipt-date grouped)
  |-- ReceiptDateFilterBar (NEW: filter by receipt date range)
  |-- BatchExtractDialog (existing, enhanced)
  |-- PhotoLightbox (existing)
  |-- ReceiptDetailOverlay (NEW: inline receipt detail over photo)

ReceiptsPage
  |-- ReceiptList (existing, enhanced with source photo thumbnails)
  |-- ReceiptDetail (existing, enhanced with visit/medical context)
  |-- MedicalVisitTimeline (existing, enhanced with MedicalRecordNumber grouping)
  |-- BatchSelectBar (existing)

MedicalDashboard (existing, enhanced)
  |-- VisitStatsCards
  |-- MedicalRecordNumberSearch (NEW)
  |-- PatientCrossVisitTimeline (NEW)
  |-- AutoAssociatePanel (existing)
  |-- HospitalStatsTable

ShoppingDashboard (NEW)
  |-- SpendingOverviewCards
  |-- MerchantSummaryTable
  |-- ItemPriceHistoryChart (per item)
  |-- PurchaseFrequencyPanel (future-ready data display)
```

### 7.2 Service Layer Changes

| Service | Existing | New |
|---------|----------|-----|
| `photo.service.ts` | list, getById, upload, getByReceiptId, getByUploadDate, getByCapturedDate | **byReceiptDate**, updateReceiptCount, download |
| `receipt.service.ts` | list, getById, listVisits | bySourcePhoto, byMedicalRecord, listConfirmed |
| `medical.service.ts` (NEW) | | getAllVisits, getByMedicalRecordNumber, getPatientHistory, createMedicalRecordIndex |
| `shopping.service.ts` (NEW) | | getPriceHistory, getMerchantSummary, getTopItems, getPriceTrend |

### 7.3 TypeScript Types

New types to add to `client/src/types/`:

```typescript
// Photo-Receipt N:M types
interface PhotoWithReceipts {
  id: string;
  fileName: string;
  uploadedAt: string;
  capturedDate: string | null;
  thumbnailUrl: string;
  associatedReceiptIds: string[];
  receipts: ReceiptDto[]; // full receipt data, not just IDs
}

// MedicalRecordIndex type
interface MedicalRecordIndexEntry {
  medicalRecordNumber: string;
  hospitalName: string;
  patientName: string;
  visitIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ShoppingPriceIndex type
interface ShoppingPriceEntry {
  normalizedItemName: string;
  merchantName: string;
  unitPrice: number;
  currency: string;
  timestamp: string;
  receiptId: string;
}

// Price history response
interface PriceHistoryResponse {
  itemName: string;
  currency: string;
  entries: PriceEntryDto[];
  priceTrend: PriceTrendSummary;
}

interface PriceTrendSummary {
  minUnitPrice: number;
  maxUnitPrice: number;
  avgUnitPrice: number;
  currentPrice: number;
  cheapestMerchant: string;
}

// VisitStats enhanced with MedicalRecordNumber
interface VisitStatsResponse {
  totalSpending: number;
  totalVisits: number;
  totalReceipts: number;
  averagePerVisit: number;
  medicalRecordCount: number;  // NEW: number of unique medical record numbers
  hospitalStats: HospitalStatsDto[];
}
```

---

## 8. OCR Pipeline Changes

### 8.1 Step 1: Vision OCR (No Changes)

Qwen VL receives the photo image and outputs raw markdown text. This step is unchanged.

### 8.2 Step 2: Schema Mapping — Enhanced for N:M

The mapping prompt must now explicitly handle **multi-receipt per photo** scenarios:

**Enhanced prompt instructions:**
1. If the image contains multiple independent receipts (different dates, different merchants, different hospitals), output a **JSON array with one element per receipt**.
2. Each array element represents one independent receipt.
3. If the image contains only one receipt, output a JSON array with exactly one element.
4. If a receipt spans multiple pages, each page's OCR output should reference the same logical receipt via a common `pageGroup` identifier (future enhancement).

**Example response:**
```json
[
  {
    "type": "Shopping",
    "category": "Supermarket",
    "merchantName": "Walmart",
    "receiptDate": "2026-01-01",
    "totalAmount": 156.50,
    "items": [{"name": "milk", "quantity": 2, "unitPrice": 12.50, "totalPrice": 25.00}]
  },
  {
    "type": "Medical",
    "category": "PaymentReceipt",
    "hospitalName": "Shanghai Sixth People's Hospital",
    "department": "Cardiology",
    "medicalRecordNumber": "B2026001",
    "patientName": "Zhang San",
    "receiptDate": "2026-02-10",
    "totalAmount": 340.00,
    "medicalInsuranceFundPayment": 256.00,
    "personalSelfPay": 84.00
  }
]
```

### 8.3 Frontend: Receipt Confirmation Overlay

After OCR returns, the frontend:
1. Groups receipts by `receiptDate` (month header).
2. Displays each receipt as a card overlay on the source photo.
3. Allows the user to:
   - Confirm (save to database).
   - Edit fields inline.
   - Split (if one card actually contains two receipts).
   - Delete (if false positive).
4. On "Save All", posts a single `SaveConfirmedRequest` containing all receipts with the shared `PhotoId`.

---

## 9. Implementation Phases (Within Phase 4)

### Phase 4A: Data Model & Backend Foundation

**Deliverables:**
1. Add `SourcePhotoId` and `AdditionalPhotoIds` to Receipt entity.
2. Add `MedicalRecordNumber` to Receipt entity and ReceiptVisit entity.
3. Create `MedicalRecordIndex` entity and repository.
4. Create `ShoppingPriceIndex` entity and repository.
5. Add `_photoReceiptDateIndex` field to PhotoAlbum.
6. Update `PhotoRepository` and `ReceiptRepository`.

**API:**
1. Add `GET /api/photos/by-receipt-date` endpoint.
2. Add `GET /api/receipts/by-source-photo/{photoId}` endpoint.
3. Add `GET /api/visits/by-medical-record` endpoint.
4. Add `GET /api/shopping/price-history` endpoint.

**Services:**
1. `PhotoByReceiptDateService` — resolves photos by receipt date.
2. `MedicalRecordIndexService` — manages medical record index.
3. `ShoppingPriceIndexService` — manages shopping price index.

**Tests:**
- Unit tests for all new services.
- Controller tests for new endpoints.
- Integration tests for photo-receipt date resolution.

---

### Phase 4B: Frontend — Photo-First Views

**Deliverables:**
1. `PhotoDateGroupedView` component — photos grouped by receipt date.
2. `ReceiptDateFilterBar` — date range filter for receipt dates.
3. Enhanced `PhotoReceiptGroupedView` — now shows receipt details inline.
4. `ReceiptDetailOverlay` — inline receipt detail card overlaid on photo.
5. Enhanced `BatchExtractDialog` — supports editing before confirm.

**Services:**
1. `photo.service.ts` — new `byReceiptDate()` method.
2. `receipt.service.ts` — new `bySourcePhoto()` method.

**Tests:**
- Component tests for `PhotoDateGroupedView`.
- Component tests for `ReceiptDetailOverlay`.

---

### Phase 4C: Medical Visit Enhancement

**Deliverables:**
1. Enhanced `MedicalVisitTimeline` — group by MedicalRecordNumber.
2. `MedicalRecordNumberSearch` component.
3. `PatientCrossVisitTimeline` component.
4. Enhanced `MedicalDashboard` — new stats cards for medical record count.

**Services:**
1. `medical.service.ts` — new service for medical record operations.

**Tests:**
- Component tests for cross-visit timeline.

---

### Phase 4D: Shopping Dashboard

**Deliverables:**
1. `ShoppingDashboard` page — overview of shopping data.
2. `PriceHistoryChart` — line chart of item prices over time.
3. `MerchantSummaryTable` — spending by merchant.
4. `PurchaseFrequencyPanel` — placeholder for future reminders.

**Services:**
1. `shopping.service.ts` — new service for shopping data.

**Tests:**
- Component tests for ShoppingDashboard.

---

## 10. Migration Strategy

### 10.1 Existing Receipts Without SourcePhotoId

All existing receipts must be populated with `SourcePhotoId`:

```
For each Receipt:
  IF receipt.ImageUrl contains "photos/" or "/uploads/":
    Find PhotoAlbum where FileName matches ImageUrl's basename
    Set receipt.SourcePhotoId = that Photo's Id
  ELSE:
    Set receipt.SourcePhotoId = null (unattached receipt)
```

This migration runs once on startup.

### 10.2 Existing Photos Without ReceiptDateIndex

Populate `_photoReceiptDateIndex` for all existing photos:

```
For each PhotoAlbum:
  IF photo.AssociatedReceiptIds has entries:
    For each receiptId in AssociatedReceiptIds:
      Get receipt by receiptId
      Get receipt.ReceiptDate
      Add receiptId to _photoReceiptDateIndex[YYYY-MM]
```

### 10.3 MedicalRecordNumber Backfill

For existing medical receipts, attempt to extract `MedicalRecordNumber` from OCR raw text if not present:

```
For each Medical Receipt:
  IF receipt.MedicalRecordNumber is null AND receipt.RawText is not null:
    Use AI or regex to extract MedicalRecordNumber from RawText
    If found, save to receipt
```

### 10.4 ShoppingPriceIndex Backfill

```
For each Shopping Receipt:
  For each item in receipt.Items:
    Create ShoppingPriceIndex entry with:
      NormalizedItemName = normalize(item.name)
      MerchantName = receipt.MerchantName
      UnitPrice = item.unitPrice
      Timestamp = receipt.ReceiptDate
      ReceiptId = receipt.Id
```

---

## 11. Performance Considerations

### 11.1 Photo-by-Receipt-Date Queries

**Problem:** Naive approach requires joining PhotoAlbum with Receipts, which is expensive in MongoDB without a proper inverted index.

**Solution:** Use the `_photoReceiptDateIndex` embedded field in each PhotoAlbum document. Query MongoDB for photos where the `_photoReceiptDateIndex` contains any key in the requested date range.

**Performance target:** < 500ms for queries across 1000 photos.

### 11.2 Batch OCR Throughput

**Current:** Sequential processing (one photo at a time).

**Recommended for Phase 4:**
- Maintain sequential processing for correctness (one API call per photo).
- Add progress tracking so the UI shows per-photo status during batch extraction.
- Target: 10 photos in < 5 minutes (with Qwen VL at ~20-30 seconds per photo).

### 11.3 Price Index Query Performance

**Target:** < 200ms for price history queries on a user with 500+ shopping receipts.

**Strategy:** Compound index on `(NormalizedItemName, OwnerId, Timestamp)`.

---

## 12. Edge Cases & Error Handling

### 12.1 Photo Deleted After Receipt Extraction

**Scenario:** User deletes a photo that has extracted receipts.

**Behavior:**
- Receipts are NOT deleted when their source photo is deleted.
- The `SourcePhotoId` on receipts becomes a dangling reference.
- The receipt detail view shows a "Source photo unavailable" placeholder.
- On next OCR re-extraction (if supported), a new photo would be created.

### 12.2 Duplicate MedicalRecordNumber Across Visits

**Scenario:** A user has two separate visits at the same hospital with the same MedicalRecordNumber (possible if the hospital reuses numbers or if the user made a transcription error).

**Behavior:**
- Group all receipts with the same MedicalRecordNumber + HospitalName into one visit group.
- If receipts have dates that are significantly separated (> 30 days), show a warning: "Possible separate visits detected".
- Allow the user to manually split the group into separate visits.

### 12.3 OCR Returns Zero Receipts

**Scenario:** OCR processes a photo but the mapping step returns an empty array.

**Behavior:**
- Photo remains in the album with `ExtractedReceiptCount = 0`.
- "Extract Receipts" button remains enabled (user can retry).
- UI shows "No receipts detected" with a "Retry OCR" button.

### 12.4 Same Photo Re-OCR'd

**Scenario:** User re-runs OCR on a photo that already has extracted receipts.

**Behavior:**
- Show existing receipts as read-only preview.
- New OCR results are presented alongside existing ones with a "Keep" / "Replace" / "Merge" option for each.
- On confirm, replace only the selected receipts. Unselected existing receipts are preserved.

### 12.5 Shopping Item Normalization Ambiguity

**Scenario:** "Milk" vs "Full Cream Milk" vs "Milk 1L" — should these be the same item?

**Behavior:**
- Normalization removes quantity and unit suffixes (step 1 of `normalizeItemName` in existing code).
- Case-insensitive comparison.
- User can manually merge items in the shopping dashboard (future feature).
- For Phase 4, the existing `normalizeItemName` function is used as-is.

---

## 13. Acceptance Criteria

### 13.1 N:M Photo-Receipt Relationship

- [ ] A single photo can be linked to multiple receipts with different dates.
- [ ] Photo A containing Receipt #1 (Jan 1) and Receipt #2 (Feb 1) appears in BOTH the January and February views.
- [ ] Photo appears only once per month even if it has multiple receipts in the same month.
- [ ] Receipts reference their `SourcePhotoId` and are always traceable to the photo.

### 13.2 Medical Data

- [ ] Receipts with the same `MedicalRecordNumber` are grouped into a single MedicalVisit.
- [ ] MedicalRecordNumber search returns all visits for that record number.
- [ ] Cross-visit patient timeline shows all visits for a given patient, ordered chronologically.
- [ ] MedicalDashboard shows MedicalRecordCount statistics.

### 13.3 Shopping Data

- [ ] Shopping receipts contain item-level data with unit prices.
- [ ] ShoppingPriceIndex is populated for all shopping receipts.
- [ ] Price history endpoint returns chronological price data per item.
- [ ] ShoppingDashboard shows merchant summary and per-item price trends.

### 13.4 OCR Pipeline

- [ ] Batch OCR correctly extracts multiple receipts from a single photo.
- [ ] Each extracted receipt is properly linked to its source photo.
- [ ] Frontend confirmation UI allows confirming, editing, splitting, or deleting receipts.

### 13.5 Migration

- [ ] Existing receipts are backfilled with `SourcePhotoId`.
- [ ] Existing photos are indexed with `_photoReceiptDateIndex`.
- [ ] ShoppingPriceIndex is backfilled for all shopping receipts.

---

## 14. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| OCR accuracy on multi-receipt photos | High | Medium | Start with photos containing single receipts; add multi-receipt support iteratively. |
| MongoDB query performance on inverted index | Medium | Medium | Use embedded `_photoReceiptDateIndex` field; add compound indexes; monitor query times. |
| MedicalRecordNumber transcription errors | High | Medium | Show warnings for suspiciously separated dates within a record group; allow manual splitting. |
| Shopping item normalization collisions | Medium | Medium | Start with simple normalization; allow manual merge in future. |
| Frontend complexity with N:M overlay | High | Medium | Start with simple overlay cards; iterate on UX based on user feedback. |

---

## 15. Open Questions

1. **Should the photo's capture date still be displayed in receipt-date view?** Yes — show it as a secondary metadata point so users understand the photo's actual capture time versus the receipt dates.

2. **Should users be able to extract receipts from the same photo multiple times?** Yes, with a "diff and merge" workflow (see Edge Case 12.4).

3. **Should the MedicalRecordNumber be a required field for Medical receipts?** No — it's optional. Receipts without a MedicalRecordNumber are shown in their own ungrouped view.

4. **Should price history comparisons work across different merchants?** Yes — the `ShoppingPriceIndex` tracks merchant per entry, so users can compare prices for the same item at different merchants.

5. **Should the shopping dashboard support category-level aggregation?** Yes — the existing `ReceiptLineItem.Category` field is used for this. The shopping dashboard will aggregate spending by category.

---

## Appendix A: Existing Code Reference

- **Photo entity:** `server/Models/Entities/PhotoEntities.cs` — `PhotoAlbum`
- **Receipt entity:** `server/Models/Entities/ReceiptEntities.cs` — `Receipt`, `ReceiptVisit`, `ReceiptLineItem`, `MedicationItem`, `LabResultItem`
- **Photo DTOs:** `server/Models/DTOs/Photo/PhotoDtos.cs`
- **Receipt DTOs:** `server/Models/DTOs/Receipt/ReceiptDtos.cs`
- **Batch extract DTOs:** `server/Models/DTOs/Receipt/BatchExtractDtos.cs`
- **PhotoController:** `server/Controllers/PhotoController.cs`
- **VisitController:** `server/Controllers/VisitController.cs`
- **AutoAssociateService:** `server/Services/Implementations/AutoAssociateService.cs`
- **PhotoAlbumPage:** `client/src/components/Photos/PhotoAlbumPage.tsx`
- **PhotoReceiptGroupedView:** `client/src/components/Photos/PhotoReceiptGroupedView.tsx`
- **MedicalVisitTimeline:** `client/src/components/Receipts/MedicalVisitTimeline.tsx`
- **MedicalDashboard:** `client/src/components/Medical/MedicalDashboard.tsx`
- **ReceiptList:** `client/src/components/Receipts/ReceiptList.tsx`
- **BatchExtractDialog:** `client/src/components/Receipts/BatchExtractDialog.tsx`
- **Test plan:** `TEST_PLAN_PHOTO_OCR.md`

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| Photo | The primary artifact — a stored image file with metadata. Always immutable. |
| Receipt | Extracted metadata layer from a photo. Can be edited, split, or deleted independently. |
| MedicalVisit | A logical grouping of medical receipts from the same hospital visit. Linked by MedicalRecordNumber. |
| MedicalRecordNumber (病案号) | The Chinese hospital patient record number. Used to group multiple bills into a single visit. |
| ShoppingPriceIndex | A derived index tracking item prices across purchases. Used for price comparison. |
| OCR Pipeline | Two-step process: Step 1 (Qwen VL vision model for text extraction) -> Step 2 (schema mapping to structured JSON). |
| SourcePhotoId | The PhotoAlbum document ID that is the source of a receipt's extracted data. |
