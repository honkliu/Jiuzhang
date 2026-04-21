using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
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
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;

    public ReceiptController(
        IReceiptRepository receiptRepo,
        IReceiptVisitRepository visitRepo,
        IWebHostEnvironment environment,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory)
    {
        _receiptRepo = receiptRepo;
        _visitRepo = visitRepo;
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

    // ── Receipt Image Extraction ───────────────────────────────────────────

    [HttpPost("extract")]
    public async Task<IActionResult> ExtractFromImage([FromBody] ExtractReceiptRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.ImageUrl))
            return BadRequest("imageUrl is required.");

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

        // Step 1: Vision — extract both markdown and JSON from image
        var ocrPrompt = !string.IsNullOrWhiteSpace(req.OcrPrompt) ? req.OcrPrompt
            : "识别图像中的文字、公式或抽取票据、证件、表单中的信息。请输出两部分，用===JSON===分隔：第一部分：Markdown格式的票据内容，用于展示,格式尊重图像中的文字格式。第二部分：JSON格式的原始提取数据，忠实反映图像中识别到的所有字段和数据，不要遗漏任何信息。";

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
            temperature = 0.7,
            top_p = 0.8,
            top_k = 20,
            min_p = 0.0,
            presence_penalty = 1.5,
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

        // Step 2: Map raw data to our schema (text-only, no vision)
        // Send the entire Step 1 raw output to Step 2
        var defaultMapPrompt = @"根据以下OCR提取的票据数据，判断这是医疗票据还是购物票据还是其他类型，然后映射到我们的数据Schema，返回纯JSON数组，不要包含代码块标记。

Schema字段说明：
{
  type: ""Shopping"" | ""Medical"",
  category: string,
  merchantName: string,
  hospitalName: string,
  department: string,
  doctorName: string,
  patientName: string,
  totalAmount: number,
  currency: string,
  receiptDate: string,
  notes: string,
  diagnosisText: string,
  items: [{ name, quantity, unit, unitPrice, totalPrice }],
  medications: [{ name, dosage, frequency, days, quantity, price }],
  labResults: [{ name, value, unit, referenceRange, status }]
}

以下是OCR提取的数据：
";
        var mapPrompt = (!string.IsNullOrWhiteSpace(req.MapPrompt) ? req.MapPrompt + "\n\n以下是OCR提取的数据：\n" : defaultMapPrompt) + fullContent;

        var mapMessages = new object[]
        {
            new { role = "user", content = mapPrompt }
        };

        var mapPayload = new
        {
            model,
            messages = mapMessages,
            temperature = 0.7,
            top_p = 0.8,
            top_k = 20,
            min_p = 0.0,
            presence_penalty = 1.5,
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
        if (string.IsNullOrWhiteSpace(req.NewOcrText) || req.ExistingOcrTexts == null || req.ExistingOcrTexts.Count == 0)
            return Ok(new { isDuplicate = false });

        var baseUrl = _configuration["Agent:BaseUrl"];
        var apiKey = _configuration["Agent:ApiKey"] ?? string.Empty;
        var model = _configuration["Agent:Model"] ?? string.Empty;

        if (string.IsNullOrWhiteSpace(baseUrl))
            return Ok(new { isDuplicate = false });

        var prompt = $@"判断以下新票据是否与已有票据中的任何一张是同一张票据（即重复录入）。
只需要回答一个JSON：{{""isDuplicate"": true}} 或 {{""isDuplicate"": false}}
不要解释，只返回JSON。

新票据OCR文本：
{req.NewOcrText}

已有票据OCR文本：
{string.Join("\n---\n", req.ExistingOcrTexts)}";

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
                return Ok(new { isDuplicate = false });

            using var doc = JsonDocument.Parse(body);
            var content = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
            content = content.Trim();
            if (content.StartsWith("```")) content = content.Split('\n', 2).Length > 1 ? content.Split('\n', 2)[1] : content[3..];
            if (content.EndsWith("```")) content = content[..^3];
            content = content.Trim();

            var result = JsonSerializer.Deserialize<JsonElement>(content);
            var isDuplicate = result.TryGetProperty("isDuplicate", out var val) && val.GetBoolean();
            return Ok(new { isDuplicate });
        }
        catch
        {
            return Ok(new { isDuplicate = false });
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
