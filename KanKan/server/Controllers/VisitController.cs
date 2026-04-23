using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using KanKan.API.Models.DTOs.Receipt;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Repositories.Implementations;
using KanKan.API.Services.Interfaces;

namespace KanKan.API.Controllers;

[Authorize]
[ApiController]
[Route("api/visits")]
public class VisitController : ControllerBase
{
    private readonly IReceiptRepository _receiptRepo;
    private readonly IReceiptVisitRepository _visitRepo;
    private readonly IAutoAssociateService _autoAssociateService;
    private readonly IVisitStatsService _visitStatsService;
    private readonly IPhotoRepository _photoRepo;
    private readonly IMedicalRecordIndexRepository _medicalRecordIndexRepo;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;

    public VisitController(
        IReceiptRepository receiptRepo,
        IReceiptVisitRepository visitRepo,
        IAutoAssociateService autoAssociateService,
        IVisitStatsService visitStatsService,
        IPhotoRepository photoRepo,
        IMedicalRecordIndexRepository medicalRecordIndexRepo,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory)
    {
        _receiptRepo = receiptRepo;
        _visitRepo = visitRepo;
        _autoAssociateService = autoAssociateService;
        _visitStatsService = visitStatsService;
        _photoRepo = photoRepo;
        _medicalRecordIndexRepo = medicalRecordIndexRepo;
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats([FromQuery] DateTime? startDate = null, [FromQuery] DateTime? endDate = null)
    {
        var now = DateTime.UtcNow;
        var start = startDate ?? now.AddMonths(-12);
        var end = endDate ?? now;
        var stats = await _visitStatsService.GetVisitStatsAsync(GetUserId(), start, end);
        return Ok(stats);
    }

    [HttpPost("auto-associate")]
    public async Task<IActionResult> AutoAssociate()
    {
        var results = await _autoAssociateService.AutoAssociateAllAsync(GetUserId());
        return Ok(results);
    }

    [HttpPost("relink")]
    public async Task<IActionResult> Relink([FromBody] RelinkRequest request)
    {
        if (string.IsNullOrEmpty(request.SourceVisitId) || string.IsNullOrEmpty(request.TargetVisitId))
            return BadRequest("Both sourceVisitId and targetVisitId are required.");
        
        // Verify user owns both visits
        var sourceVisit = await _visitRepo.GetByIdAsync(request.SourceVisitId);
        var targetVisit = await _visitRepo.GetByIdAsync(request.TargetVisitId);
        
        if (sourceVisit == null || targetVisit == null || sourceVisit.OwnerId != GetUserId() || targetVisit.OwnerId != GetUserId())
            return NotFound();

        await _visitStatsService.RelinkReceiptsAsync(GetUserId(), request.SourceVisitId, request.TargetVisitId);
        return Ok(new { message = "Receipts relinked successfully." });
    }

    /// <summary>
    /// Batch extract receipt data from multiple photos.
    /// Processes each photo through the same OCR pipeline as single-image extract,
    /// then returns the extraction results synchronously so the frontend can show
    /// a confirmation dialog.
    /// </summary>
    [HttpPost("batch-extract")]
    public async Task<IActionResult> BatchExtract([FromBody] BatchExtractRequest request)
    {
        if (request.PhotoIds == null || request.PhotoIds.Count == 0)
            return BadRequest("At least one photo ID is required.");

        var userId = GetUserId();
        var baseUrl = _configuration["Agent:BaseUrl"] ?? string.Empty;
        var apiKey = _configuration["Agent:ApiKey"] ?? string.Empty;
        var model = _configuration["Agent:Model"] ?? string.Empty;

        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(apiKey))
            return StatusCode(500, "OCR agent not configured (Agent:BaseUrl / Agent:ApiKey).");

        var results = new List<BatchExtractResult>();

        var httpClient = _httpClientFactory.CreateClient();
        httpClient.Timeout = TimeSpan.FromSeconds(600);

        foreach (var photoId in request.PhotoIds)
        {
            var result = new BatchExtractResult { PhotoId = photoId, Status = "Pending" };

            var photo = await _photoRepo.GetByIdAsync(photoId);
            if (photo == null || photo.OwnerId != userId)
            {
                result.Status = "Failed";
                result.Error = "Photo not found or not owned.";
                results.Add(result);
                continue;
            }

            // Resolve image bytes
            byte[]? imageBytes = null;
            string? mimeType = "image/jpeg";

            if (!string.IsNullOrEmpty(photo.FilePath) && System.IO.File.Exists(photo.FilePath))
            {
                imageBytes = await System.IO.File.ReadAllBytesAsync(photo.FilePath);
                mimeType = photo.ContentType switch
                {
                    "image/png" => "image/png",
                    "image/webp" => "image/webp",
                    _ => "image/jpeg"
                };
            }
            else if (!string.IsNullOrEmpty(photo.Base64Data))
            {
                string b64 = photo.Base64Data;
                if (b64.Contains(',')) b64 = b64.Split(',')[1];
                try
                {
                    imageBytes = Convert.FromBase64String(b64);
                }
                catch
                {
                    result.Status = "Failed";
                    result.Error = "Invalid base64 data in photo.";
                    results.Add(result);
                    continue;
                }
            }

            if (imageBytes == null || imageBytes.Length == 0)
            {
                result.Status = "Failed";
                result.Error = "No image data found for photo.";
                results.Add(result);
                continue;
            }

            // Build data URI for vision model
            var base64 = Convert.ToBase64String(imageBytes);
            var dataUri = $"data:{mimeType};base64,{base64}";

            // Store photo URL for receipt.ImageUrl mapping
            // Photo files are stored in wwwroot/photos/, so URL = /photos/{fileName}
            result.PhotoImageUrl = $"/photos/{photo.FileName}";

            // Step 1: Vision OCR — extract text & structure from image (Phase 5: 场景感知多步 prompt)
            try
            {
                // Phase 5: 根据照片文件名和标签进行场景预判
                var scenarioPrompt = GetScenarioAwarePrompt(photo);

                var ocrPayload = new
                {
                    model,
                    messages = new object[]
                    {
                        new
                        {
                            role = "user",
                            content = new object[]
                            {
                                new { type = "text", text = scenarioPrompt },
                                new { type = "image_url", image_url = new { url = dataUri } }
                            }
                        }
                    },
                    temperature = 0.7,
                    top_p = 0.8,
                    top_k = 20,
                    min_p = 0.0,
                    presence_penalty = 1.5,
                    repetition_penalty = 1.0,
                    max_tokens = 131072,
                    chat_template_kwargs = new { enable_thinking = false }
                };

                var ocrRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
                ocrRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                ocrRequest.Content = new System.Net.Http.StringContent(
                    System.Text.Json.JsonSerializer.Serialize(ocrPayload),
                    System.Text.Encoding.UTF8, "application/json");

                using var ocrResponse = await httpClient.SendAsync(ocrRequest);
                var ocrBody = await ocrResponse.Content.ReadAsStringAsync();
                if (!ocrResponse.IsSuccessStatusCode)
                {
                    result.Status = "Failed";
                    result.Error = $"Step 1 OCR failed: {ocrBody}";
                    results.Add(result);
                    continue;
                }

                var ocrDoc = System.Text.Json.JsonDocument.Parse(ocrBody);
                var step1Content = ocrDoc.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString() ?? "";

                result.Step1RawOcr = step1Content;

                if (string.IsNullOrWhiteSpace(step1Content))
                {
                    result.Status = "Failed";
                    result.Error = "OCR returned empty result";
                    results.Add(result);
                    continue;
                }

                // Step 2: Map raw OCR data to our receipt schema (Phase 5: 增强版 schema mapping)
                var mapPrompt = @"根据以下OCR提取的票据数据，判断这是医疗票据还是购物票据还是其他类型，然后映射到我们的数据Schema，返回纯JSON数组，不要包含代码块标记。

如果一张照片里包含多张票据、多个日期、多个就诊记录、多个文档页块，必须按""每一张独立票据/每一个独立就诊日期""拆成数组里的多条记录，绝对不要把不同日期或不同票据内容合并到同一个对象里。

Schema字段说明（所有字段均为可选，只输出OCR能确认的字段）：
{
  type: ""Shopping"" | ""Medical"",
  category: string,  // Shopping时: Supermarket, Restaurant, OnlineShopping, Other; Medical时: Registration, Diagnosis, Prescription, LabResult, ImagingResult, PaymentReceipt, DischargeNote, Other
  merchantName: string, // 商户/超市/餐厅名称
  hospitalName: string, // 医院名称 (医疗票据)
  department: string, // 科室 (医疗票据)
  doctorName: string, // 医生姓名
  patientName: string, // 患者姓名
  medicalRecordNumber: string, // 病案号/住院号 (Phase 5 新增: 医疗票据中最重要的关联键!)
  diagnosisText: string, // 诊断文本 (Phase 5 新增: 从诊断单/出院小结提取)
  insuranceType: string, // 医保类型 (Phase 5 新增: 城镇职工/居民/新农合/自费)
  totalAmount: number,
  taxAmount: number,
  currency: string,  // 默认CNY
  receiptDate: string,  // YYYY-MM-DD
  outpatientNumber: string, // 挂号号/就诊号
  medicalInsuranceNumber: string, // 医保编号
  medicalInsuranceFundPayment: number, // 医保统筹支付
  personalSelfPay: number, // 个人自付
  otherPayments: number, // 其他支付
  personalAccountPayment: number, // 个人账户支付
  personalOutOfPocket: number, // 个人现金支付
  cashPayment: number,
  notes: string,
  items: [{ name, quantity, unit, unitPrice, totalPrice }],
  medications: [{ name, dosage, frequency, days, quantity, price }],
  labResults: [{ name, value, unit, referenceRange, status }]
}

Phase 5 增强提取指令:
1. 医疗票据: 必须仔细识别病案号 (常见格式: B+数字, Z+数字, ""病案号:"" 后的数字, ""住院号:"" 后的数字)
2. 诊断报告: 提取诊断结论到 diagnosisText
3. 处方: 完整提取药品名、剂量、用法、频次、天数
4. 收费单: 提取医保统筹支付、个人自付、个人账户支付等支付明细
5. 购物小票: 提取商品名、单价、数量、总价

请输出纯 JSON 数组, 不要包含代码块标记。";

                var mapMessages = new object[] { new { role = "user", content = mapPrompt + "\n\n以下是OCR提取的数据：\n" + step1Content } };

                var mapPayload = new
                {
                    model, messages = mapMessages, temperature = 0.7, top_p = 0.8, top_k = 20, min_p = 0.0,
                    presence_penalty = 1.5, repetition_penalty = 1.0,
                    chat_template_kwargs = new { enable_thinking = false }
                };

                var mapRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
                mapRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                mapRequest.Content = new System.Net.Http.StringContent(
                    System.Text.Json.JsonSerializer.Serialize(mapPayload),
                    System.Text.Encoding.UTF8, "application/json");

                using var mapResponse = await httpClient.SendAsync(mapRequest);
                var mapBody = await mapResponse.Content.ReadAsStringAsync();
                if (!mapResponse.IsSuccessStatusCode)
                {
                    result.Status = "Failed";
                    result.Error = $"Step 2 mapping failed: {mapBody}";
                    results.Add(result);
                    continue;
                }

                var mapDoc = System.Text.Json.JsonDocument.Parse(mapBody);
                var step2Content = mapDoc.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString() ?? "[]";

                result.Step2MappedJson = step2Content;

                // Parse the JSON array into ParsedExtractedReceipt objects
                try
                {
                    var stripped = step2Content.Trim();
                    if (stripped.StartsWith("```"))
                    {
                        var endIdx = stripped.IndexOf("```", 3);
                        if (endIdx > 3) stripped = stripped[3..endIdx].Trim();
                        else stripped = stripped[3..].Trim();
                    }
                    var arr = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(stripped);
                    if (arr.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        foreach (var el in arr.EnumerateArray())
                        {
                            var mapped = new ParsedExtractedReceipt();
                            TryGetString(el, "merchantName", out var v); mapped.MerchantName = v;
                            TryGetString(el, "hospitalName", out v); mapped.HospitalName = v;
                            TryGetString(el, "department", out v); mapped.Department = v;
                            TryGetString(el, "doctorName", out v); mapped.DoctorName = v;
                            TryGetString(el, "patientName", out v); mapped.PatientName = v;
                            mapped.TotalAmount = GetPropDecimal(el, "totalAmount");
                            TryGetString(el, "currency", out v); mapped.Currency = v ?? "CNY";
                            TryGetString(el, "receiptDate", out v); mapped.ReceiptDate = v;
                            TryGetString(el, "notes", out v); mapped.Notes = v;
                            TryGetString(el, "type", out v); mapped.Type = v ?? "Shopping";
                            TryGetString(el, "category", out v); mapped.Category = v ?? string.Empty;
                            // Phase 5 新增字段解析
                            TryGetString(el, "medicalRecordNumber", out v); mapped.MedicalRecordNumber = v;
                            TryGetString(el, "diagnosisText", out v); mapped.DiagnosisText = v;
                            TryGetString(el, "insuranceType", out v); mapped.InsuranceType = v;
                            // Parse items
                            if (el.TryGetProperty("items", out var itemsProp) && itemsProp.ValueKind == System.Text.Json.JsonValueKind.Array)
                                mapped.Items = itemsProp.EnumerateArray().Select(item => new ReceiptLineItemDto
                                {
                                    Name = GetPropString(item, "name") ?? "",
                                    Quantity = GetPropDecimal(item, "quantity"),
                                    Unit = GetPropString(item, "unit"),
                                    UnitPrice = GetPropDecimal(item, "unitPrice"),
                                    TotalPrice = GetPropDecimal(item, "totalPrice"),
                                }).ToList();

                            // Parse medications
                            if (el.TryGetProperty("medications", out var medsProp) && medsProp.ValueKind == System.Text.Json.JsonValueKind.Array)
                                mapped.Medications = medsProp.EnumerateArray().Select(med => new MedicationItemDto
                                {
                                    Name = GetPropString(med, "name") ?? "",
                                    Dosage = GetPropString(med, "dosage"),
                                    Frequency = GetPropString(med, "frequency"),
                                    Days = GetPropInt(med, "days"),
                                    Quantity = GetPropDecimal(med, "quantity"),
                                    Price = GetPropDecimal(med, "price"),
                                }).ToList();

                            // Parse labResults
                            if (el.TryGetProperty("labResults", out var labsProp) && labsProp.ValueKind == System.Text.Json.JsonValueKind.Array)
                                mapped.LabResults = labsProp.EnumerateArray().Select(lab => new LabResultItemDto
                                {
                                    Name = GetPropString(lab, "name") ?? "",
                                    Value = GetPropString(lab, "value"),
                                    Unit = GetPropString(lab, "unit"),
                                    ReferenceRange = GetPropString(lab, "referenceRange"),
                                    Status = GetPropString(lab, "status"),
                                }).ToList();

                            result.ParsedReceipts.Add(mapped);
                        }
                    }
                }
                catch (Exception parseEx)
                {
                    // Keep raw JSON even if parsing fails — frontend can try to parse
                    result.Error = $"Parsed receipt parsing error: {parseEx.Message}";
                }

                result.Status = result.ParsedReceipts.Count > 0 ? "Completed" : "Completed";

            }
            catch (Exception ex)
            {
                result.Status = "Failed";
                result.Error = ex.Message;
            }

            results.Add(result);
        }

        return Ok(new BatchExtractResponse { Results = results });
    }

    private static void TryGetString(System.Text.Json.JsonElement el, string prop, out string? value)
    {
        value = null;
        if (el.TryGetProperty(prop, out var p) && p.ValueKind == System.Text.Json.JsonValueKind.String)
            value = p.GetString();
    }

    private static decimal? GetPropDecimal(System.Text.Json.JsonElement el, string prop)
    {
        if (el.TryGetProperty(prop, out var p))
        {
            if (p.ValueKind == System.Text.Json.JsonValueKind.Number)
                return p.GetDecimal();
            if (p.ValueKind == System.Text.Json.JsonValueKind.String && decimal.TryParse(p.GetString(), out var d))
                return d;
        }
        return null;
    }

    private static int? GetPropInt(System.Text.Json.JsonElement el, string prop)
    {
        if (el.TryGetProperty(prop, out var p))
        {
            if (p.ValueKind == System.Text.Json.JsonValueKind.Number)
                return p.GetInt32();
            if (p.ValueKind == System.Text.Json.JsonValueKind.String && int.TryParse(p.GetString(), out var i))
                return i;
        }
        return null;
    }

    private static string? GetPropString(System.Text.Json.JsonElement el, string prop)
    {
        if (el.TryGetProperty(prop, out var p) && p.ValueKind == System.Text.Json.JsonValueKind.String)
            return p.GetString();
        return null;
    }

    [HttpPost("save-confirmed")]
    public async Task<IActionResult> SaveConfirmed([FromBody] SaveConfirmedRequest request)
    {
        var results = new List<ConfirmedReceiptResponse>();
        var userId = GetUserId();

        foreach (var r in request.Receipts)
        {
            try
            {
                Receipt? existingReceipt = null;
                if (!string.IsNullOrEmpty(r.ReceiptId))
                {
                    existingReceipt = await _receiptRepo.GetByIdAsync(r.ReceiptId);
                    if (existingReceipt == null || existingReceipt.OwnerId != userId)
                        continue;
                }

                var dt = string.IsNullOrEmpty(r.ReceiptDate) ? (DateTime?)null : DateTime.TryParse(r.ReceiptDate, out var d) ? d : null;

                // Phase 5: 确定 SourcePhotoId (优先使用 DTO 中的 SourcePhotoId, 否则回退到 PhotoId)
                var sourcePhotoId = !string.IsNullOrEmpty(r.SourcePhotoId) ? r.SourcePhotoId : r.PhotoId;

                var receipt = new Receipt
                {
                    Id = existingReceipt?.Id ?? $"rcpt_{Guid.NewGuid():N}",
                    OwnerId = userId,
                    Type = r.Type,
                    Category = r.Category,
                    ImageUrl = r.PhotoImageUrl ?? (existingReceipt?.ImageUrl ?? "/photos/placeholder"),
                    // Phase 5: 保存主照片ID和额外照片ID
                    SourcePhotoId = sourcePhotoId,
                    AdditionalPhotoIds = r.AdditionalPhotoIds ?? (existingReceipt?.AdditionalPhotoIds ?? new()),
                    RawText = r.RawText,
                    MerchantName = r.MerchantName,
                    HospitalName = r.HospitalName,
                    Department = r.Department,
                    DoctorName = r.DoctorName,
                    PatientName = r.PatientName,
                    // Phase 5: 保存医疗字段
                    MedicalRecordNumber = r.MedicalRecordNumber,
                    DiagnosisText = r.DiagnosisText,
                    InsuranceType = r.InsuranceType,
                    OutpatientNumber = r.OutpatientNumber,
                    TotalAmount = r.TotalAmount,
                    Currency = r.Currency ?? "CNY",
                    ReceiptDate = dt,
                    Notes = r.Notes,
                    Items = r.Items?.Select(i => new ReceiptLineItem
                    {
                        Name = i.Name, Quantity = i.Quantity, Unit = i.Unit,
                        UnitPrice = i.UnitPrice, TotalPrice = i.TotalPrice, Category = i.Category
                    }).ToList() ?? new(),
                    Medications = r.Medications?.Select(m => new MedicationItem
                    {
                        Name = m.Name, Dosage = m.Dosage, Frequency = m.Frequency,
                        Days = m.Days, Quantity = m.Quantity, Price = m.Price
                    }).ToList() ?? new(),
                    LabResults = r.LabResults?.Select(l => new LabResultItem
                    {
                        Name = l.Name, Value = l.Value, Unit = l.Unit,
                        ReferenceRange = l.ReferenceRange, Status = l.Status
                    }).ToList() ?? new(),
                    CreatedAt = existingReceipt?.CreatedAt ?? DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                };

                Receipt saved;
                if (existingReceipt != null)
                    saved = await _receiptRepo.UpdateAsync(receipt);
                else
                    saved = await _receiptRepo.CreateAsync(receipt);

                // Associate the photo with this receipt
                var photo = await _photoRepo.GetByIdAsync(r.PhotoId);
                if (photo != null && !photo.AssociatedReceiptIds.Contains(saved.Id))
                {
                    photo.AssociatedReceiptIds.Add(saved.Id);

                    // Phase 5: 更新 PhotoAlbum 派生字段
                    photo.ExtractedReceiptCount = photo.AssociatedReceiptIds.Count;
                    photo.LastOcrStatus = "Completed";
                    photo.UpdatedAt = DateTime.UtcNow;
                    await _photoRepo.UpdateAsync(photo);
                }

                // Phase 5: 医疗类型 receipt 且有病案号时, 自动创建/关联 ReceiptVisit 和 MedicalRecordIndex
                if (r.Type == ReceiptType.Medical && !string.IsNullOrEmpty(r.MedicalRecordNumber))
                {
                    await UpdateMedicalRecordIndexAsync(saved, userId);
                }

                results.Add(new ConfirmedReceiptResponse
                {
                    ReceiptId = saved.Id,
                    PhotoId = r.PhotoId,
                    Success = true,
                });
            }
            catch (Exception ex)
            {
                results.Add(new ConfirmedReceiptResponse
                {
                    ReceiptId = null,
                    PhotoId = r.PhotoId,
                    Success = false,
                    Error = ex.Message,
                });
            }
        }

        return Ok(results);
    }

    public class RelinkRequest
    {
        public string SourceVisitId { get; set; } = string.Empty;
        public string TargetVisitId { get; set; } = string.Empty;
    }

    // ── Phase 5 新增: 场景感知 prompt 方法 ─────────────────────────────────────

    /// <summary>
    /// 根据照片文件名和标签判断 OCR 场景 (医疗/购物/混合), 返回对应的 prompt.
    /// </summary>
    private string GetScenarioAwarePrompt(PhotoAlbum photo)
    {
        var fileName = photo.FileName.ToLower();
        var tags = photo.Tags ?? new List<string>();
        var allText = fileName + " " + string.Join(" ", tags);

        // 医疗关键词列表
        var medicalKeywords = new[]
        {
            "挂号", "收费", "诊断", "化验", "处方", "出院", "检查", "门诊", "住院",
            "hospital", "medical", "doctor", "prescription", "clinic", "surgery"
        };

        // 购物关键词列表
        var shoppingKeywords = new[]
        {
            "超市", "购物", "小票", "餐厅", "订单", "消费", "mall", "shop",
            "supermarket", "receipt", "invoice", "bill"
        };

        bool isMedical = medicalKeywords.Any(kw => allText.Contains(kw, StringComparison.OrdinalIgnoreCase));
        bool isShopping = shoppingKeywords.Any(kw => allText.Contains(kw, StringComparison.OrdinalIgnoreCase));

        if (isMedical && !isShopping)
            return GetMedicalPrompt();
        if (isShopping && !isMedical)
            return GetShoppingPrompt();
        return GetMixedPrompt();
    }

    /// <summary>医疗场景 prompt: 详细提取医院、科室、病案号、就诊号、收费项目、诊断等</summary>
    private string GetMedicalPrompt()
    {
        return @"你是一个专业的医疗票据识别助手。请仔细识别这张图片中的所有医疗单据信息,
并以 Markdown 格式输出。

这张图片很可能包含以下类型的医疗单据之一或多种:
1. 挂号单 (Registration): 关注医院名称、科室、就诊号、挂号号、患者姓名、就诊日期、挂号费用
2. 收费单/发票 (Payment Receipt): 关注医院名称、病案号、就诊号、收费项目明细(名称/单价/数量/金额)、合计金额、医保统筹支付、个人自付、医保类型
3. 诊断报告 (Diagnosis): 关注患者姓名、诊断结论、检查项目、检查日期、报告医生
4. 化验单/检验报告 (Lab Result): 关注检验项目名称、检验结果值、参考范围、异常标记(高/低)
5. 处方单 (Prescription): 关注药品名称、剂量、用法、频次、天数、开药医生
6. 出院小结 (Discharge Note): 关注入院日期、出院日期、诊断、治疗方案、出院医嘱

特别重要: 如果图片中包含""病案号""、""住院号""、""出院记录号""等字段, 请准确提取并单独标出。
如果一张图片包含多张不同的票据, 请分别识别并标注每张票据的类型。

请按以下 Markdown 格式输出:

## 票据 1: [类型]
- 医院: [医院名称]
- 科室: [科室名称]
- 日期: [YYYY-MM-DD]
- 患者: [患者姓名]
- 病案号: [如果有的话, 没有则写""无""]
- 就诊号/门诊号: [如果有]
- [其他关键信息...]

## 票据 2: [类型]
...

## OCR 识别内容
[以下是 OCR 识别的完整文字内容]";
    }

    /// <summary>购物场景 prompt: 详细提取商户、商品、单价、数量、总价</summary>
    private string GetShoppingPrompt()
    {
        return @"你是一个专业的购物小票识别助手。请仔细识别这张图片中的所有购物小票信息,
并以 Markdown 格式输出。

这张图片很可能包含以下类型的单据:
1. 超市小票: 关注商场/超市名称、商品名称、单价、数量、总价、购物日期
2. 餐厅账单: 关注餐厅名称、菜品名称、单价、数量、合计金额、日期、服务费
3. 电商订单截图: 关注平台名称、订单号、商品名称、单价、数量、总价、下单日期、收货地址

特别重要: 如果一张图片包含多张不同日期或不同商户的单据, 请分别列出。
如果商品有名称、单价、数量, 请一一列出。

请按以下 Markdown 格式输出:

## 小票 1: [商户名称]
- 日期: [YYYY-MM-DD]
- 商品列表:
  1. [商品名] x[数量] @¥[单价] = ¥[总价]
  2. ...
- 合计: ¥[总金额]

## OCR 识别内容
[以下是 OCR 识别的完整文字内容]";
    }

    /// <summary>混合/未知场景 prompt: 通用 fallback</summary>
    private string GetMixedPrompt()
    {
        return @"请识别这张图片中的票据/小票信息。如果不确定是医疗还是购物单据, 请同时输出
你认为可能的信息类型。

请按 Markdown 格式输出所有可识别的票据信息。

## OCR 识别内容
[以下是 OCR 识别的完整文字内容]";
    }

    // ── Phase 5 新增: MedicalRecordIndex 更新方法 ───────────────────────────

    /// <summary>
    /// 当医疗票据确认保存后, 自动更新 MedicalRecordIndex.
    /// 如果病案号不存在则创建新的索引记录, 如果已存在则追加 receiptId 和 visitId.
    /// </summary>
    private async Task UpdateMedicalRecordIndexAsync(Receipt receipt, string userId)
    {
        try
        {
            var index = await _medicalRecordIndexRepo.GetByOwnerIdAndNumberAsync(userId, receipt.MedicalRecordNumber!);

            if (index == null)
            {
                // 创建新的 MedicalRecordIndex 记录
                index = new MedicalRecordIndex
                {
                    Id = $"mri_{receipt.MedicalRecordNumber}_{receipt.HospitalName?.Replace(" ", "_")?.Replace("/", "_") ?? "unknown"}",
                    OwnerId = userId,
                    MedicalRecordNumber = receipt.MedicalRecordNumber!,
                    HospitalName = receipt.HospitalName ?? string.Empty,
                    PatientName = receipt.PatientName ?? string.Empty,
                    InsuranceType = receipt.InsuranceType,
                    VisitIds = new List<string>(),
                    ReceiptIds = new List<string> { receipt.Id },
                };
                await _medicalRecordIndexRepo.CreateAsync(index);
            }
            else
            {
                // 更新已有记录
                if (!index.ReceiptIds.Contains(receipt.Id))
                    index.ReceiptIds.Add(receipt.Id);
                // 同步医院名称和患者信息
                if (!string.IsNullOrEmpty(receipt.HospitalName))
                    index.HospitalName = receipt.HospitalName;
                if (!string.IsNullOrEmpty(receipt.PatientName))
                    index.PatientName = receipt.PatientName;
                if (!string.IsNullOrEmpty(receipt.InsuranceType))
                    index.InsuranceType = receipt.InsuranceType;

                // 如果该 receipt 有 VisitId, 也添加到 VisitIds 中
                if (!string.IsNullOrEmpty(receipt.VisitId) && !index.VisitIds.Contains(receipt.VisitId!))
                    index.VisitIds.Add(receipt.VisitId!);

                await _medicalRecordIndexRepo.UpdateAsync(index);
            }

            // Phase 5: 如果 ReceiptVisit 存在且无 MedicalRecordNumber, 更新之
            if (!string.IsNullOrEmpty(receipt.VisitId))
            {
                var visit = await _visitRepo.GetByIdAsync(receipt.VisitId);
                if (visit != null && string.IsNullOrEmpty(visit.MedicalRecordNumber))
                {
                    visit.MedicalRecordNumber = receipt.MedicalRecordNumber;
                    if (!string.IsNullOrEmpty(receipt.InsuranceNumber))
                        visit.InsuranceNumber = receipt.InsuranceNumber;
                    visit.UpdatedAt = DateTime.UtcNow;
                    await _visitRepo.UpdateAsync(visit);
                }
            }
        }
        catch (Exception ex)
        {
            // MedicalRecordIndex 更新失败不影响主流程, 仅记录日志
            System.Diagnostics.Debug.WriteLine($"Failed to update MedicalRecordIndex: {ex.Message}");
        }
    }

    // ── Phase 5 新增: 病案号正则提取辅助 ─────────────────────────────────────

    /// <summary>
    /// 从 OCR 原始文本中提取病案号 (Phase 5 Step 3: 病案号专项提取).
    /// 使用正则表达式匹配常见病案号格式.
    /// </summary>
    private string ExtractMedicalRecordNumberFromText(string ocrText)
    {
        // 病案号/住院号常见格式正则
        var patterns = new[]
        {
            @"[病住]案号[:：\s]*(\w[\w\d]*)",         // 病案号: B2026001
            @"[病住]院号[:：\s]*(\w[\w\d]*)",           // 住院号: Z2026001
            @"[出院]记录[号]?[:：\s]*(\w[\w\d]*)",      // 出院记录号
            @"编号[:：\s]*(\w[\w\d]{6,})",               // 编号: AB2026001
            @"(?\b[A-Z]{2}\d{6,}\b)",                    // 两位字母+6位数字
        };

        foreach (var pattern in patterns)
        {
            var match = System.Text.RegularExpressions.Regex.Match(ocrText, pattern);
            if (match.Success && match.Groups.Count > 1)
            {
                var num = match.Groups[1].Value.Trim();
                if (num.Length >= 6) // 病案号至少6位
                    return num;
            }
        }
        return "NOT_FOUND";
    }

    // ── Phase 5 新增 API 端点 ───────────────────────────────────────────────

    /// <summary>
    /// GET /api/visits/medical-index/{medicalRecordNumber} — 查询病案号索引 (Phase 5 新增)
    /// </summary>
    [HttpGet("medical-index/{medicalRecordNumber}")]
    public async Task<IActionResult> GetMedicalIndex(string medicalRecordNumber)
    {
        var userId = GetUserId();
        var index = await _medicalRecordIndexRepo.GetByOwnerIdAndNumberAsync(userId, medicalRecordNumber);
        if (index == null) return NotFound($"No medical record index found for {medicalRecordNumber}");

        return Ok(new MedicalRecordIndexResponse
        {
            Id = index.Id,
            OwnerId = index.OwnerId,
            MedicalRecordNumber = index.MedicalRecordNumber,
            HospitalName = index.HospitalName,
            PatientName = index.PatientName,
            InsuranceType = index.InsuranceType,
            VisitIds = index.VisitIds,
            ReceiptIds = index.ReceiptIds,
            CreatedAt = index.CreatedAt,
            UpdatedAt = index.UpdatedAt,
        });
    }

    /// <summary>
    /// POST /api/visits/update-visit — 手动更新 Visit 归属 (Phase 5 新增)
    /// </summary>
    [HttpPost("update-visit")]
    public async Task<IActionResult> UpdateVisit([FromBody] UpdateVisitRequest request)
    {
        var userId = GetUserId();

        if (string.IsNullOrEmpty(request.ReceiptId))
            return BadRequest("receiptId is required.");

        var receipt = await _receiptRepo.GetByIdAsync(request.ReceiptId);
        if (receipt == null || receipt.OwnerId != userId)
            return NotFound();

        // 更新 VisitId 关联
        if (request.VisitId != receipt.VisitId)
        {
            receipt.VisitId = request.VisitId;

            // 更新 SourcePhotoId 和 AdditionalPhotoIds
            if (!string.IsNullOrEmpty(request.SourcePhotoId))
                receipt.SourcePhotoId = request.SourcePhotoId;
            if (request.AdditionalPhotoIds != null)
                receipt.AdditionalPhotoIds = request.AdditionalPhotoIds;

            // 更新病案号
            if (!string.IsNullOrEmpty(request.MedicalRecordNumber) && request.MedicalRecordNumber != receipt.MedicalRecordNumber)
            {
                receipt.MedicalRecordNumber = request.MedicalRecordNumber;
                // 如果病案号改变, 重新更新 MedicalRecordIndex
                await UpdateMedicalRecordIndexAsync(receipt, userId);
            }

            receipt.UpdatedAt = DateTime.UtcNow;
            await _receiptRepo.UpdateAsync(receipt);

            // 同时更新 PhotoAlbum 的 PhotoReceiptDateIndex
            await UpdatePhotoReceiptDateIndexAsync(receipt);
        }

        return Ok(new { message = "Visit updated successfully.", receiptId = receipt.Id });
    }

    // ── Phase 5 新增: PhotoReceiptDateIndex 更新方法 ─────────────────────────

    /// <summary>
    /// 当 receipt 更新后, 更新关联 Photo 的 PhotoReceiptDateIndex.
    /// 这使 Photo 能按 receipt 日期分组展示.
    /// </summary>
    private async Task UpdatePhotoReceiptDateIndexAsync(Receipt receipt)
    {
        try
        {
            if (string.IsNullOrEmpty(receipt.SourcePhotoId)) return;

            var photo = await _photoRepo.GetByIdAsync(receipt.SourcePhotoId);
            if (photo == null || string.IsNullOrEmpty(receipt.ReceiptDate?.ToString("yyyy-MM"))) return;

            var yearMonth = receipt.ReceiptDate.Value.ToString("yyyy-MM");

            if (photo.PhotoReceiptDateIndex == null)
                photo.PhotoReceiptDateIndex = new Dictionary<string, List<string>>();

            if (!photo.PhotoReceiptDateIndex.ContainsKey(yearMonth))
                photo.PhotoReceiptDateIndex[yearMonth] = new List<string>();

            if (!photo.PhotoReceiptDateIndex[yearMonth].Contains(receipt.Id))
                photo.PhotoReceiptDateIndex[yearMonth].Add(receipt.Id);

            photo.UpdatedAt = DateTime.UtcNow;
            await _photoRepo.UpdateAsync(photo);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to update PhotoReceiptDateIndex: {ex.Message}");
        }
    }

    public class ConfirmedReceiptResponse
    {
        public string? ReceiptId { get; set; }
        public string PhotoId { get; set; } = string.Empty;
        public bool Success { get; set; }
        public string? Error { get; set; }
    }
}
