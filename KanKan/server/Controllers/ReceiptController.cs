using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using KanKan.API.Models.DTOs.Receipt;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Repositories.Implementations;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/receipts")]
public class ReceiptController : ControllerBase
{
    private readonly IReceiptRepository _receiptRepo;
    private readonly IReceiptVisitRepository _visitRepo;
    private readonly IPhotoRepository _photoRepo;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;

    public ReceiptController(
        IReceiptRepository receiptRepo,
        IReceiptVisitRepository visitRepo,
        IPhotoRepository photoRepo,
        IWebHostEnvironment environment,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory)
    {
        _receiptRepo = receiptRepo;
        _visitRepo = visitRepo;
        _photoRepo = photoRepo;
        _environment = environment;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
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
            SourcePhotoId = req.SourcePhotoId ?? string.Empty,
            AdditionalPhotoIds = req.AdditionalPhotoIds ?? new(),
            RawText = req.RawText,
            MerchantName = req.MerchantName,
            HospitalName = req.HospitalName,
            Department = req.Department,
            DoctorName = req.DoctorName,
            PatientName = req.PatientName,
            TotalAmount = req.TotalAmount,
            TaxAmount = req.TaxAmount,
            Currency = req.Currency ?? "CNY",
            ReceiptDate = req.ReceiptDate,
            OutpatientNumber = req.OutpatientNumber,
            MedicalInsuranceNumber = req.MedicalInsuranceNumber,
            InsuranceType = req.InsuranceType,
            MedicalInsuranceFundPayment = req.MedicalInsuranceFundPayment,
            PersonalSelfPay = req.PersonalSelfPay,
            OtherPayments = req.OtherPayments,
            PersonalAccountPayment = req.PersonalAccountPayment,
            PersonalOutOfPocket = req.PersonalOutOfPocket,
            CashPayment = req.CashPayment,
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
        await SyncPhotoAssociationsAsync(GetUserId(), null, created);
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
        if (req.TaxAmount != null) receipt.TaxAmount = req.TaxAmount;
        if (req.Currency != null) receipt.Currency = req.Currency;
        if (req.ReceiptDate != null) receipt.ReceiptDate = req.ReceiptDate;
        if (req.OutpatientNumber != null) receipt.OutpatientNumber = req.OutpatientNumber;
        if (req.MedicalInsuranceNumber != null) receipt.MedicalInsuranceNumber = req.MedicalInsuranceNumber;
        if (req.InsuranceType != null) receipt.InsuranceType = req.InsuranceType;
        if (req.MedicalInsuranceFundPayment != null) receipt.MedicalInsuranceFundPayment = req.MedicalInsuranceFundPayment;
        if (req.PersonalSelfPay != null) receipt.PersonalSelfPay = req.PersonalSelfPay;
        if (req.OtherPayments != null) receipt.OtherPayments = req.OtherPayments;
        if (req.PersonalAccountPayment != null) receipt.PersonalAccountPayment = req.PersonalAccountPayment;
        if (req.PersonalOutOfPocket != null) receipt.PersonalOutOfPocket = req.PersonalOutOfPocket;
        if (req.CashPayment != null) receipt.CashPayment = req.CashPayment;
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

        var ownsIndependentImages = string.IsNullOrWhiteSpace(receipt.SourcePhotoId)
            && !(receipt.AdditionalPhotoIds?.Any() ?? false);

        // Only delete files owned by the receipt itself. Photo-backed receipts must not remove source photos.
        if (ownsIndependentImages)
        {
            DeleteImageFile(receipt.ImageUrl);
            foreach (var url in receipt.AdditionalImageUrls)
                DeleteImageFile(url);
        }

        await _receiptRepo.DeleteAsync(id);
        await SyncPhotoAssociationsAsync(GetUserId(), receipt, null);
        return NoContent();
    }

    private async Task SyncPhotoAssociationsAsync(string ownerId, Receipt? previousReceipt, Receipt? currentReceipt)
    {
        var affectedPhotoIds = new HashSet<string>(StringComparer.Ordinal);

        void CollectPhotoIds(Receipt? receipt)
        {
            if (receipt == null)
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(receipt.SourcePhotoId))
            {
                affectedPhotoIds.Add(receipt.SourcePhotoId);
            }

            foreach (var photoId in receipt.AdditionalPhotoIds ?? new List<string>())
            {
                if (!string.IsNullOrWhiteSpace(photoId))
                {
                    affectedPhotoIds.Add(photoId);
                }
            }
        }

        CollectPhotoIds(previousReceipt);
        CollectPhotoIds(currentReceipt);

        if (affectedPhotoIds.Count == 0)
        {
            return;
        }

        var allReceipts = await _receiptRepo.GetByOwnerIdAsync(ownerId);

        foreach (var photoId in affectedPhotoIds)
        {
            var photo = await _photoRepo.GetByIdAsync(photoId);
            if (photo == null || photo.OwnerId != ownerId)
            {
                continue;
            }

            var associatedReceiptIds = allReceipts
                .Where(receipt => receipt.SourcePhotoId == photoId || (receipt.AdditionalPhotoIds?.Contains(photoId) ?? false))
                .Select(receipt => receipt.Id)
                .Distinct(StringComparer.Ordinal)
                .ToList();

            photo.AssociatedReceiptIds = associatedReceiptIds;
            photo.ExtractedReceiptCount = associatedReceiptIds.Count;
            photo.LastOcrStatus = associatedReceiptIds.Count > 0 ? "Completed" : "Pending";
            photo.UpdatedAt = DateTime.UtcNow;

            await _photoRepo.UpdateAsync(photo);
        }
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

    // ── Receipt Image Extraction ───────────────────────────────────────────

    [HttpPost("extract")]
    public async Task<IActionResult> ExtractFromImage([FromBody] ExtractReceiptRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.ImageUrl))
            return BadRequest("imageUrl is required.");
        if (string.IsNullOrWhiteSpace(req.OcrPrompt))
            return BadRequest("ocrPrompt is required.");
        if (string.IsNullOrWhiteSpace(req.MapPrompt))
            return BadRequest("mapPrompt is required.");

        // Read image file and convert to base64
        var imagePath = Path.Combine(_environment.WebRootPath, req.ImageUrl.TrimStart('/'));
        if (!System.IO.File.Exists(imagePath))
            return BadRequest("Image file not found.");

        var imageBytes = await System.IO.File.ReadAllBytesAsync(imagePath);
        var mimeType = req.ImageUrl.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ? "image/png" : "image/jpeg";
        var base64 = Convert.ToBase64String(imageBytes);
        var dataUri = $"data:{mimeType};base64,{base64}";

        // Call Qwen VL for extraction
        var baseUrl = _configuration["Agent:BaseUrl"];
        var apiKey = _configuration["Agent:ApiKey"] ?? string.Empty;
        var model = _configuration["Agent:Model"] ?? string.Empty;

        if (string.IsNullOrWhiteSpace(baseUrl))
            return StatusCode(500, "Agent base URL not configured.");

        // Step 1: Vision — the client owns the OCR prompt.
        var ocrPrompt = req.OcrPrompt;

        var ocrMessages = new object[]
        {
            new
            {
                role = "user",
                content = new object[]
                {
                    new { type = "text", text = ocrPrompt },
                    new { type = "image_url", image_url = new { url = dataUri } }
                }
            }
        };

        var ocrPayload = new
        {
            model,
            messages = ocrMessages,
            temperature = 0.4,
            top_p = 0.2,
            top_k = 20,
            min_p = 0.0,
            presence_penalty = 0.0,
            repetition_penalty = 1.0,
            max_tokens = 131072,
            chat_template_kwargs = new { enable_thinking = false }
        };

        var httpClient = _httpClientFactory.CreateClient();
        httpClient.Timeout = TimeSpan.FromSeconds(300);

        var ocrRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
        ocrRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        ocrRequest.Content = new StringContent(JsonSerializer.Serialize(ocrPayload), Encoding.UTF8, "application/json");

        string fullContent = "";
        string step1ApiRaw = "";
        try
        {
            using var ocrResponse = await httpClient.SendAsync(ocrRequest);
            var ocrBody = await ocrResponse.Content.ReadAsStringAsync();
            if (!ocrResponse.IsSuccessStatusCode)
                return StatusCode(502, $"OCR failed ({ocrResponse.StatusCode}): {ocrBody}");

            // Store entire raw API response
            step1ApiRaw = ocrBody;

            using var ocrDoc = JsonDocument.Parse(ocrBody);
            fullContent = ocrDoc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";
        }
        catch (Exception ex)
        {
            return StatusCode(502, $"Step 1 OCR call failed: {ex.Message}");
        }

        if (string.IsNullOrWhiteSpace(fullContent))
            return StatusCode(502, "OCR returned empty result");

        // Step 2: Map raw data to our schema (text-only, no vision).
        // The client fully owns the mapping prompt.
        var mapPrompt = req.MapPrompt
                + "\n\n以下是OCR提取的数据：\n"
                + fullContent;

        var mapMessages = new object[]
        {
            new { role = "user", content = mapPrompt }
        };

        var mapPayload = new
        {
            model,
            messages = mapMessages,
            temperature = 0.4,
            top_p = 0.2,
            top_k = 20,
            min_p = 0.0,
            presence_penalty = 0.0,
            repetition_penalty = 1.0,
            max_tokens = 131072,
            chat_template_kwargs = new { enable_thinking = false }
        };

        var mapRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
        mapRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        mapRequest.Content = new StringContent(JsonSerializer.Serialize(mapPayload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await httpClient.SendAsync(mapRequest);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                return StatusCode(502, $"Mapping failed ({response.StatusCode}): {responseBody}");

            using var doc = JsonDocument.Parse(responseBody);
            var step2Content = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";

            return Ok(new { step1Raw = step1ApiRaw, step2Raw = step2Content });
        }
        catch (Exception ex)
        {
            return StatusCode(502, $"Step 2 mapping failed: {ex.Message}");
        }
    }

    [HttpPost("check-duplicate")]
    public async Task<IActionResult> CheckDuplicate([FromBody] CheckDuplicateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewOcrText)
            || req.ExistingOcrTexts == null
            || req.ExistingOcrTexts.Count == 0
            || string.IsNullOrWhiteSpace(req.DedupPrompt))
        {
            return Ok(new { isDuplicate = false, rawResponse = string.Empty, parsedResponse = string.Empty });
        }

        var baseUrl = _configuration["Agent:BaseUrl"];
        var apiKey = _configuration["Agent:ApiKey"] ?? string.Empty;
        var model = _configuration["Agent:Model"] ?? string.Empty;

        if (string.IsNullOrWhiteSpace(baseUrl))
            return Ok(new { isDuplicate = false, rawResponse = string.Empty, parsedResponse = string.Empty });

        var prompt = req.DedupPrompt;

        var messages = new object[] { new { role = "user", content = prompt } };
        var payload = new
        {
            model, messages, temperature = 0.7, top_p = 0.8, top_k = 20, min_p = 0.0,
            presence_penalty = 1.5, repetition_penalty = 1.0,
            chat_template_kwargs = new { enable_thinking = false }
        };

        try
        {
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using var response = await httpClient.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
                return Ok(new { isDuplicate = false, rawResponse = body, parsedResponse = string.Empty });

            using var doc = JsonDocument.Parse(body);
            var content = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
            content = content.Trim();
            if (content.StartsWith("```")) content = content.Split('\n', 2).Length > 1 ? content.Split('\n', 2)[1] : content[3..];
            if (content.EndsWith("```")) content = content[..^3];
            content = content.Trim();

            var result = JsonSerializer.Deserialize<JsonElement>(content);
            var isDuplicate = result.TryGetProperty("isDuplicate", out var val) && val.GetBoolean();
            return Ok(new { isDuplicate, rawResponse = body, parsedResponse = content });
        }
        catch
        {
            return Ok(new { isDuplicate = false, rawResponse = string.Empty, parsedResponse = string.Empty });
        }
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
        TaxAmount = r.TaxAmount,
        Currency = r.Currency,
        ReceiptDate = r.ReceiptDate,
        OutpatientNumber = r.OutpatientNumber,
        MedicalInsuranceNumber = r.MedicalInsuranceNumber,
        InsuranceNumber = r.InsuranceNumber,
        InsuranceType = r.InsuranceType,
        MedicalInsuranceFundPayment = r.MedicalInsuranceFundPayment,
        PersonalSelfPay = r.PersonalSelfPay,
        OtherPayments = r.OtherPayments,
        PersonalAccountPayment = r.PersonalAccountPayment,
        PersonalOutOfPocket = r.PersonalOutOfPocket,
        CashPayment = r.CashPayment,
        Notes = r.Notes,
        Tags = r.Tags,
        VisitId = r.VisitId,
        DiagnosisText = r.DiagnosisText,
        ImagingFindings = r.ImagingFindings,
        SourcePhotoId = r.SourcePhotoId,
        AdditionalPhotoIds = r.AdditionalPhotoIds,
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
