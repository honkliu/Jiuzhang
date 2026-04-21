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

        // Step 1: OCR — extract raw text from image
        var ocrMessages = new object[]
        {
            new
            {
                role = "user",
                content = new object[]
                {
                    new { type = "image_url", image_url = new { url = dataUri } },
                    new { type = "text", text = "识别图像中的文字、公式或抽取票据、证件、表单中的信息，支持格式化输出文本" }
                }
            }
        };

        var ocrPayload = new
        {
            model,
            messages = ocrMessages,
            temperature = 0.1,
            max_tokens = 4096,
            chat_template_kwargs = new { enable_thinking = false }
        };

        var httpClient = _httpClientFactory.CreateClient();
        httpClient.Timeout = TimeSpan.FromSeconds(120);

        var ocrRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
        ocrRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        ocrRequest.Content = new StringContent(JsonSerializer.Serialize(ocrPayload), Encoding.UTF8, "application/json");

        string ocrText;
        try
        {
            using var ocrResponse = await httpClient.SendAsync(ocrRequest);
            var ocrBody = await ocrResponse.Content.ReadAsStringAsync();
            if (!ocrResponse.IsSuccessStatusCode)
                return StatusCode(502, $"OCR failed ({ocrResponse.StatusCode}): {ocrBody}");

            using var ocrDoc = JsonDocument.Parse(ocrBody);
            ocrText = ocrDoc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "";
        }
        catch (Exception ex)
        {
            return StatusCode(502, $"OCR call failed: {ex.Message}");
        }

        if (string.IsNullOrWhiteSpace(ocrText))
            return StatusCode(502, "OCR returned empty result");

        // Step 2: Map OCR text to structured JSON
        var mapPrompt = @"将以下OCR识别的票据文本转换为JSON格式。

映射规则：
- 购物类：type=Shopping。超市/便利店→category=Supermarket，餐饮→Restaurant，网购→OnlineShopping，其他→Other
  - 商品明细→items数组，每项含name、quantity、unit、unitPrice、totalPrice
  - 商家/店铺名→merchantName
- 医疗类：type=Medical
  - 检验报告（血常规、生化、尿常规等）→category=LabResult
    - 每个检验项目→labResults数组，含name、value（纯数值去掉↑↓）、unit、referenceRange、status（↑=High，↓=Low，无=Normal）
    - 报告类型名称（如血常规+CRP）→notes
  - 处方→category=Prescription，药品→medications数组
  - 挂号→Registration，诊断→Diagnosis，影像→ImagingResult，收费→PaymentReceipt，出院→DischargeNote
  - 医院名→hospitalName，科室→department，医生→doctorName，患者→patientName
  - 诊断→diagnosisText
- 日期→receiptDate（YYYY-MM-DD），金额→totalAmount（数字），币种→currency（默认CNY）
- 一份文本可能包含多张票据，每张单独一个JSON对象

返回纯JSON数组，不要```代码块：
[{""type"":""Medical"",""category"":""LabResult"",""hospitalName"":""XX医院"",""department"":""检验科"",""receiptDate"":""2023-08-28"",""notes"":""血常规"",""labResults"":[{""name"":""白细胞"",""value"":""20.3"",""unit"":""10^9/L"",""referenceRange"":""4.0-10.0"",""status"":""High""}]}]

以下是OCR识别的文本：
" + ocrText;

        var mapMessages = new object[]
        {
            new { role = "user", content = mapPrompt }
        };

        var mapPayload = new
        {
            model,
            messages = mapMessages,
            temperature = 0.1,
            max_tokens = 4096,
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

            // Parse the response — extract content from choices[0].message.content
            using var doc = JsonDocument.Parse(responseBody);
            var content = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "[]";

            // Strip markdown code block markers if present
            content = content.Trim();
            if (content.StartsWith("```json", StringComparison.OrdinalIgnoreCase))
                content = content["```json".Length..];
            if (content.StartsWith("```"))
                content = content[3..];
            if (content.EndsWith("```"))
                content = content[..^3];
            content = content.Trim();

            // Parse as JSON array
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var extracted = JsonSerializer.Deserialize<List<ReceiptExtractionResult>>(content, options)
                ?? new List<ReceiptExtractionResult>();

            return Ok(new { ocrText, receipts = extracted });
        }
        catch (Exception ex)
        {
            return StatusCode(502, $"Vision model call failed: {ex.Message}");
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
            model, messages, temperature = 0.0, max_tokens = 50,
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
