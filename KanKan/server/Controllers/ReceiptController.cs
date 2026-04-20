using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using KanKan.API.Models.DTOs.Receipt;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/receipts")]
public class ReceiptController : ControllerBase
{
    private readonly IReceiptRepository _receiptRepo;
    private readonly IReceiptVisitRepository _visitRepo;
    private readonly IWebHostEnvironment _environment;

    public ReceiptController(
        IReceiptRepository receiptRepo,
        IReceiptVisitRepository visitRepo,
        IWebHostEnvironment environment)
    {
        _receiptRepo = receiptRepo;
        _visitRepo = visitRepo;
        _environment = environment;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

    // ── Receipts CRUD ───────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetReceipts([FromQuery] string? type, [FromQuery] string? category)
    {
        var receipts = await _receiptRepo.GetByOwnerIdAsync(GetUserId(), type, category);
        return Ok(receipts.Select(MapToResponse));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetReceipt(string id)
    {
        var receipt = await _receiptRepo.GetByIdAsync(id);
        if (receipt == null || receipt.OwnerId != GetUserId()) return NotFound();
        return Ok(MapToResponse(receipt));
    }

    [HttpPost]
    public async Task<IActionResult> CreateReceipt([FromBody] CreateReceiptRequest req)
    {
        var fhirType = MapFhirResourceType(req.Type, req.Category);
        var receipt = new Receipt
        {
            Id = $"rcpt_{Guid.NewGuid():N}",
            OwnerId = GetUserId(),
            Type = req.Type,
            Category = req.Category,
            ImageUrl = req.ImageUrl,
            AdditionalImageUrls = req.AdditionalImageUrls ?? new(),
            RawText = req.RawText,
            MerchantName = req.MerchantName,
            HospitalName = req.HospitalName,
            Department = req.Department,
            DoctorName = req.DoctorName,
            PatientName = req.PatientName,
            TotalAmount = req.TotalAmount,
            Currency = req.Currency ?? "CNY",
            ReceiptDate = req.ReceiptDate,
            Notes = req.Notes,
            Tags = req.Tags ?? new(),
            VisitId = req.VisitId,
            DiagnosisText = req.DiagnosisText,
            ImagingFindings = req.ImagingFindings,
            Items = req.Items?.Select(i => new ReceiptLineItem
            {
                Name = i.Name, Quantity = i.Quantity, Unit = i.Unit,
                UnitPrice = i.UnitPrice, TotalPrice = i.TotalPrice, Category = i.Category
            }).ToList() ?? new(),
            Medications = req.Medications?.Select(m => new MedicationItem
            {
                Name = m.Name, Dosage = m.Dosage, Frequency = m.Frequency,
                Days = m.Days, Quantity = m.Quantity, Price = m.Price
            }).ToList() ?? new(),
            LabResults = req.LabResults?.Select(l => new LabResultItem
            {
                Name = l.Name, Value = l.Value, Unit = l.Unit,
                ReferenceRange = l.ReferenceRange, Status = l.Status
            }).ToList() ?? new(),
            FhirResourceType = fhirType,
        };

        var created = await _receiptRepo.CreateAsync(receipt);
        return CreatedAtAction(nameof(GetReceipt), new { id = created.Id }, MapToResponse(created));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateReceipt(string id, [FromBody] UpdateReceiptRequest req)
    {
        var receipt = await _receiptRepo.GetByIdAsync(id);
        if (receipt == null || receipt.OwnerId != GetUserId()) return NotFound();

        if (req.Category != null) receipt.Category = req.Category;
        if (req.MerchantName != null) receipt.MerchantName = req.MerchantName;
        if (req.HospitalName != null) receipt.HospitalName = req.HospitalName;
        if (req.Department != null) receipt.Department = req.Department;
        if (req.DoctorName != null) receipt.DoctorName = req.DoctorName;
        if (req.PatientName != null) receipt.PatientName = req.PatientName;
        if (req.TotalAmount != null) receipt.TotalAmount = req.TotalAmount;
        if (req.Currency != null) receipt.Currency = req.Currency;
        if (req.ReceiptDate != null) receipt.ReceiptDate = req.ReceiptDate;
        if (req.Notes != null) receipt.Notes = req.Notes;
        if (req.Tags != null) receipt.Tags = req.Tags;
        if (req.VisitId != null) receipt.VisitId = req.VisitId;
        if (req.DiagnosisText != null) receipt.DiagnosisText = req.DiagnosisText;
        if (req.ImagingFindings != null) receipt.ImagingFindings = req.ImagingFindings;
        if (req.AdditionalImageUrls != null) receipt.AdditionalImageUrls = req.AdditionalImageUrls;
        if (req.Items != null)
            receipt.Items = req.Items.Select(i => new ReceiptLineItem
            {
                Name = i.Name, Quantity = i.Quantity, Unit = i.Unit,
                UnitPrice = i.UnitPrice, TotalPrice = i.TotalPrice, Category = i.Category
            }).ToList();
        if (req.Medications != null)
            receipt.Medications = req.Medications.Select(m => new MedicationItem
            {
                Name = m.Name, Dosage = m.Dosage, Frequency = m.Frequency,
                Days = m.Days, Quantity = m.Quantity, Price = m.Price
            }).ToList();
        if (req.LabResults != null)
            receipt.LabResults = req.LabResults.Select(l => new LabResultItem
            {
                Name = l.Name, Value = l.Value, Unit = l.Unit,
                ReferenceRange = l.ReferenceRange, Status = l.Status
            }).ToList();

        receipt.FhirResourceType = MapFhirResourceType(receipt.Type, receipt.Category);
        var updated = await _receiptRepo.UpdateAsync(receipt);
        return Ok(MapToResponse(updated));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteReceipt(string id)
    {
        var receipt = await _receiptRepo.GetByIdAsync(id);
        if (receipt == null || receipt.OwnerId != GetUserId()) return NotFound();

        // Delete associated image files
        DeleteImageFile(receipt.ImageUrl);
        foreach (var url in receipt.AdditionalImageUrls)
            DeleteImageFile(url);

        await _receiptRepo.DeleteAsync(id);
        return NoContent();
    }

    // ── Visits CRUD ─────────────────────────────────────────────────────────

    [HttpGet("visits")]
    public async Task<IActionResult> GetVisits()
    {
        var visits = await _visitRepo.GetByOwnerIdAsync(GetUserId());
        var result = new List<ReceiptVisitResponse>();
        foreach (var v in visits)
        {
            var receipts = await _receiptRepo.GetByVisitIdAsync(v.Id);
            result.Add(MapToVisitResponse(v, receipts));
        }
        return Ok(result);
    }

    [HttpGet("visits/{id}")]
    public async Task<IActionResult> GetVisit(string id)
    {
        var visit = await _visitRepo.GetByIdAsync(id);
        if (visit == null || visit.OwnerId != GetUserId()) return NotFound();
        var receipts = await _receiptRepo.GetByVisitIdAsync(id);
        return Ok(MapToVisitResponse(visit, receipts));
    }

    [HttpPost("visits")]
    public async Task<IActionResult> CreateVisit([FromBody] CreateReceiptVisitRequest req)
    {
        var visit = new ReceiptVisit
        {
            Id = $"rvis_{Guid.NewGuid():N}",
            OwnerId = GetUserId(),
            HospitalName = req.HospitalName,
            Department = req.Department,
            VisitDate = req.VisitDate,
            PatientName = req.PatientName,
            DoctorName = req.DoctorName,
            Notes = req.Notes,
            Tags = req.Tags ?? new(),
        };
        var created = await _visitRepo.CreateAsync(visit);
        return CreatedAtAction(nameof(GetVisit), new { id = created.Id }, MapToVisitResponse(created, new()));
    }

    [HttpPut("visits/{id}")]
    public async Task<IActionResult> UpdateVisit(string id, [FromBody] UpdateReceiptVisitRequest req)
    {
        var visit = await _visitRepo.GetByIdAsync(id);
        if (visit == null || visit.OwnerId != GetUserId()) return NotFound();

        if (req.HospitalName != null) visit.HospitalName = req.HospitalName;
        if (req.Department != null) visit.Department = req.Department;
        if (req.VisitDate != null) visit.VisitDate = req.VisitDate;
        if (req.PatientName != null) visit.PatientName = req.PatientName;
        if (req.DoctorName != null) visit.DoctorName = req.DoctorName;
        if (req.Notes != null) visit.Notes = req.Notes;
        if (req.Tags != null) visit.Tags = req.Tags;

        var updated = await _visitRepo.UpdateAsync(visit);
        var receipts = await _receiptRepo.GetByVisitIdAsync(id);
        return Ok(MapToVisitResponse(updated, receipts));
    }

    [HttpDelete("visits/{id}")]
    public async Task<IActionResult> DeleteVisit(string id)
    {
        var visit = await _visitRepo.GetByIdAsync(id);
        if (visit == null || visit.OwnerId != GetUserId()) return NotFound();

        // Delete all receipts in this visit (and their images)
        var receipts = await _receiptRepo.GetByVisitIdAsync(id);
        foreach (var r in receipts)
        {
            DeleteImageFile(r.ImageUrl);
            foreach (var url in r.AdditionalImageUrls)
                DeleteImageFile(url);
        }
        await _receiptRepo.DeleteByVisitIdAsync(id);
        await _visitRepo.DeleteAsync(id);
        return NoContent();
    }

    // ── Stats ───────────────────────────────────────────────────────────────

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats([FromQuery] string? type)
    {
        var receipts = await _receiptRepo.GetByOwnerIdAsync(GetUserId(), type);
        var stats = new ReceiptStatsResponse
        {
            TotalSpending = receipts.Where(r => r.TotalAmount.HasValue).Sum(r => r.TotalAmount!.Value),
            TotalCount = receipts.Count,
        };
        foreach (var g in receipts.GroupBy(r => r.Category))
        {
            stats.SpendingByCategory[g.Key] = g.Where(r => r.TotalAmount.HasValue).Sum(r => r.TotalAmount!.Value);
            stats.CountByCategory[g.Key] = g.Count();
        }
        return Ok(stats);
    }

    // ── Helpers ──────────────────────────────────────────────────��───────────

    private void DeleteImageFile(string? imageUrl)
    {
        if (string.IsNullOrEmpty(imageUrl)) return;
        var filePath = Path.Combine(_environment.WebRootPath ?? "wwwroot", imageUrl.TrimStart('/'));
        if (System.IO.File.Exists(filePath))
            System.IO.File.Delete(filePath);
    }

    private static string? MapFhirResourceType(string type, string category)
    {
        if (type != ReceiptType.Medical) return null;
        return category switch
        {
            MedicalCategory.Registration => "Encounter",
            MedicalCategory.Diagnosis => "DiagnosticReport",
            MedicalCategory.Prescription => "MedicationRequest",
            MedicalCategory.LabResult => "Observation",
            MedicalCategory.ImagingResult => "ImagingStudy",
            MedicalCategory.PaymentReceipt => "Claim",
            MedicalCategory.DischargeNote => "Encounter",
            _ => null,
        };
    }

    private static ReceiptResponse MapToResponse(Receipt r) => new()
    {
        Id = r.Id,
        OwnerId = r.OwnerId,
        Type = r.Type,
        Category = r.Category,
        ImageUrl = r.ImageUrl,
        AdditionalImageUrls = r.AdditionalImageUrls,
        RawText = r.RawText,
        MerchantName = r.MerchantName,
        HospitalName = r.HospitalName,
        Department = r.Department,
        DoctorName = r.DoctorName,
        PatientName = r.PatientName,
        TotalAmount = r.TotalAmount,
        Currency = r.Currency,
        ReceiptDate = r.ReceiptDate,
        Notes = r.Notes,
        Tags = r.Tags,
        VisitId = r.VisitId,
        DiagnosisText = r.DiagnosisText,
        ImagingFindings = r.ImagingFindings,
        FhirResourceType = r.FhirResourceType,
        Items = r.Items.Select(i => new ReceiptLineItemDto
        {
            Name = i.Name, Quantity = i.Quantity, Unit = i.Unit,
            UnitPrice = i.UnitPrice, TotalPrice = i.TotalPrice, Category = i.Category
        }).ToList(),
        Medications = r.Medications.Select(m => new MedicationItemDto
        {
            Name = m.Name, Dosage = m.Dosage, Frequency = m.Frequency,
            Days = m.Days, Quantity = m.Quantity, Price = m.Price
        }).ToList(),
        LabResults = r.LabResults.Select(l => new LabResultItemDto
        {
            Name = l.Name, Value = l.Value, Unit = l.Unit,
            ReferenceRange = l.ReferenceRange, Status = l.Status
        }).ToList(),
        CreatedAt = r.CreatedAt,
        UpdatedAt = r.UpdatedAt,
    };

    private static ReceiptVisitResponse MapToVisitResponse(ReceiptVisit v, List<Receipt> receipts) => new()
    {
        Id = v.Id,
        OwnerId = v.OwnerId,
        HospitalName = v.HospitalName,
        Department = v.Department,
        VisitDate = v.VisitDate,
        PatientName = v.PatientName,
        DoctorName = v.DoctorName,
        Notes = v.Notes,
        Tags = v.Tags,
        Receipts = receipts.Select(MapToResponse).ToList(),
        CreatedAt = v.CreatedAt,
        UpdatedAt = v.UpdatedAt,
    };
}
