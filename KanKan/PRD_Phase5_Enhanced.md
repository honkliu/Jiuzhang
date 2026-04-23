# PRD: Phase 5 - Photo-First Receipt & Medical Management (Enhanced)

**版本:** 2.0
**日期:** 2026-04-23
**状态:** Draft for Review
**项目:** KanKan (~/gitroot/Jiuzhang/KanKan)
**技术栈:** .NET 9 + MongoDB, React 18 + TypeScript + MUI
**上游文档:** PRD_Phase4.md, Architecture_Phase4.md, Director_Briefing_Phase5.md

---

## 1. Executive Summary

### 1.1 项目演进: Phase 4 -> Phase 5

Phase 4 奠定了 Photo-First 架构基础, Phase 5 在此基础上强化三个核心能力:

1. **场景感知的 OCR 增强**: 医疗/购物场景的差异化 prompt 策略, 多步提取流程
2. **Photo 分组视图完善**: 按 receipt 日期分组的完整体验
3. **医疗数据关联深化**: 病案号为核心的跨就诊历史管理
4. **购物数据分析边界定义**: 明确价格追踪功能的范围和优先级

### 1.2 核心目标

- 提升 OCR 提取准确率 (医疗单据场景下达到 85%+ 的关键字段准确率)
- 让用户能够按 receipt 日期 (而非上传日期) 浏览照片
- 实现病案号驱动的智能关联, 减少手动操作
- 定义清晰的购物数据分析功能边界 (Phase 5 只建数据基础设施, 不构建完整 dashboard)

---

## 2. Phase 5 新增/增强功能概览

| 功能模块 | Phase 4 状态 | Phase 5 增强 | 优先级 |
|----------|-------------|-------------|--------|
| OCR Step 1 prompt | 通用单句 prompt | 场景感知的多步 prompt | P0 |
| OCR Step 2 mapping | 基础 schema mapping | 完整结构化 JSON + 病案号提取 | P0 |
| OCR Step 3 | 无 | 病案号专项提取 (MedicalRecordNumber) | P1 |
| Photo 分组视图 | 按 capturedDate 分组 | 新增 receiptDate 分组 + 标题增强 | P0 |
| Receipt 确认对话框 | 基础编辑 | 医疗字段完整编辑 + 多 receipt 独立管理 | P0 |
| MedicalRecordNumber | ReceiptVisit 无此字段 | Receipt + ReceiptVisit 均有此字段 | P0 |
| MedicalRecordIndex | 无 | 新增实体 + 自动关联服务 | P0 |
| ShoppingPriceIndex | 无 | 新增实体 + 数据基础索引 | P1 |
| 购物数据分析 | 无 | 定义边界: 只建索引, 不建 Dashboard | P2 |
| AutoAssociate | 3级弱匹配 | 新增 Level 0: MedicalRecordNumber 精确匹配 | P1 |

---

## 3. OCR 能力增强 (Phase 5 核心)

### 3.1 现有流程回顾

当前 BatchExtract 使用两步流程:

Step 1 (Vision OCR):
  输入: 图片 + "请识别图像中的票据信息,输出Markdown格式内容和对应的JSON数据。"
  输出: 原始 OCR 文本

Step 2 (Schema Mapping):
  输入: Step 1 的输出 + Schema 说明
  输出: JSON 数组 (每张票据一个对象)

**问题:**
- Step 1 的 prompt 过于通用, 没有区分医疗/购物场景
- Step 2 的 prompt 虽然包含 schema, 但缺少场景特定的字段引导
- 没有独立的病案号提取步骤

### 3.2 Phase 5: 场景感知的多步 Prompt 策略

#### 3.2.1 Step 1: 场景感知 OCR

设计原则: 根据图片内容特征, 动态调整 Step 1 的 prompt 以获取更有针对性的原始 OCR 输出。

场景识别逻辑 (在后端执行):

```csharp
// 基于图片文件名或 EXIF 标签进行初步分类
// 文件名关键词: "挂号", "收费", "诊断", "化验", "处方", "出院"
// EXIF 中无直接线索, 主要依赖文件名和后续 Step 1 输出的内容判断
```

**医疗场景 prompt (当检测到医疗关键词或手动选择时):**

```
你是一个专业的医疗票据识别助手。请仔细识别这张图片中的所有医疗单据信息,
并以 Markdown 格式输出。

这张图片很可能包含以下类型的医疗单据之一或多种:
1. 挂号单 (Registration): 关注医院名称、科室、就诊号、挂号号、患者姓名、就诊日期、挂号费用
2. 收费单/发票 (Payment Receipt): 关注医院名称、病案号、就诊号、收费项目明细(名称/单价/数量/金额)、合计金额、医保统筹支付、个人自付、医保类型
3. 诊断报告 (Diagnosis): 关注患者姓名、诊断结论、检查项目、检查日期、报告医生
4. 化验单/检验报告 (Lab Result): 关注检验项目名称、检验结果值、参考范围、异常标记(高/低)
5. 处方单 (Prescription): 关注药品名称、剂量、用法、频次、天数、开药医生
6. 出院小结 (Discharge Note): 关注入院日期、出院日期、诊断、治疗方案、出院医嘱

特别重要: 如果图片中包含"病案号"、"住院号"、"出院记录号"等字段, 请准确提取并单独标出。
如果一张图片包含多张不同的票据, 请分别识别并标注每张票据的类型。

请按以下 Markdown 格式输出:

## 票据 1: [类型]
- 医院: [医院名称]
- 科室: [科室名称]
- 日期: [YYYY-MM-DD]
- 患者: [患者姓名]
- 病案号: [如果有的话, 没有则写"无"]
- 就诊号/门诊号: [如果有]
- [其他关键信息...]

## 票据 2: [类型]
...

## OCR 识别内容
[以下是 OCR 识别的完整文字内容]
```

**购物场景 prompt (默认场景):**

```
你是一个专业的购物小票识别助手。请仔细识别这张图片中的所有购物小票信息,
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
[以下是 OCR 识别的完整文字内容]
```

**混合/未知场景 prompt (默认 fallback):**

```
请识别这张图片中的票据/小票信息。如果不确定是医疗还是购物单据, 请同时输出
你认为可能的信息类型。

请按 Markdown 格式输出所有可识别的票据信息。

## OCR 识别内容
[以下是 OCR 识别的完整文字内容]
```

**实施策略:**

```csharp
// 在后端根据 Photo.FileName 中的关键词进行场景预判
private string GetScenarioPrompt(PhotoAlbum photo)
{
    var fileName = photo.FileName.ToLower();
    var tags = photo.Tags ?? new List<string>();

    var medicalKeywords = new[] { "挂号", "收费", "诊断", "化验", "处方", "出院", "检查", "门诊", "住院", "hospital", "medical", "doctor", "prescription" };
    var shoppingKeywords = new[] { "超市", "购物", "小票", "餐厅", "订单", "消费", "mall", "shop", "receipt", "supermarket" };

    var allText = fileName + " " + string.Join(" ", tags);

    if (medicalKeywords.Any(kw => allText.Contains(kw)))
        return MedicalPrompt;
    if (shoppingKeywords.Any(kw => allText.Contains(kw)))
        return ShoppingPrompt;

    return MixedPrompt;
}
```

#### 3.2.2 Step 2: 增强版 Schema Mapping

在现有的 Step 2 mapping 基础上, 增加以下增强:

**额外增强的字段映射 (现有 Schema 缺少的):**

- medicalRecordNumber: string (病案号 - 从医疗单据中专门提取)
- diagnosisText: string (诊断文本 - 从诊断单/出院小结中提取)
- insuranceType: string (医保类型 - 城镇职工/居民/新农合/自费)
- insuranceNumber: string (医保编号)
- photoId: string (关联的 PhotoAlbum.Id)
- sourcePhotoId: string (同上, 与 photoId 相同, 确保 backward compat)

**增强版 Step 2 prompt (医疗场景):**

```
根据以下 OCR 提取的医疗票据数据, 映射到结构化 JSON 格式。
每张独立票据为一个 JSON 对象, 放在数组中。

医疗票据分类和对应字段:

挂号单 (Registration):
  - hospitalName, department, patientName, outpatientNumber, receiptDate, totalAmount

收费单 (PaymentReceipt):
  - hospitalName, department, patientName, medicalRecordNumber (重要!), outpatientNumber
  - insuranceType, insuranceNumber
  - medicalInsuranceFundPayment, personalSelfPay, personalOutOfPocket, cashPayment
  - items: [{ name, unitPrice, totalPrice }] (收费项目明细)

诊断报告 (Diagnosis):
  - hospitalName, department, patientName, diagnosisText
  - labResults: [{ name, value, unit, referenceRange, status }]

处方 (Prescription):
  - hospitalName, department, doctorName, patientName
  - medications: [{ name, dosage, frequency, days, quantity, price }]

化验单 (LabResult):
  - hospitalName, department, patientName
  - labResults: [{ name, value, unit, referenceRange, status }]

出院小结 (DischargeNote):
  - hospitalName, patientName, diagnosisText
  - medications, notes (出院医嘱)

通用字段:
  - type: "Medical"
  - category: [上述类型之一]
  - hospitalName: string
  - department: string
  - doctorName: string
  - patientName: string
  - medicalRecordNumber: string (如果存在, 必填!)
  - receiptDate: string (YYYY-MM-DD)
  - totalAmount: number
  - currency: "CNY"
  - notes: string

请输出纯 JSON 数组, 不要包含代码块标记。
```

#### 3.2.3 Step 3: 病案号专项提取 (新增)

目的: 确保医疗票据的病案号 (MedicalRecordNumber) 被准确提取。这是 Phase 5 最重要的新增 OCR 能力。

触发条件: 当 Step 2 映射结果中 type == "Medical" 且 medicalRecordNumber 为空时, 自动触发 Step 3。

Step 3 Prompt:

```
以下是一张医疗票据的 OCR 原始文本, 请从中提取病案号(病案号/住院号/出院记录号)。

病案号的常见格式:
- B + 数字 (如 B2026001, B123456789)
- Z + 数字 (如 Z2026001)
- 住院号: 后面跟数字
- 病案号: 后面跟数字

以下是 OCR 文本:
{step1Content}

请只输出病案号, 如果找到多个, 以逗号分隔。
如果找不到, 输出 "NOT_FOUND"。
```

实施逻辑:

```csharp
// 在 BatchExtract 中, 当 Step 2 结果中 medicalRecordNumber 为空时:
if (parsedReceipt.Type == "Medical" && string.IsNullOrEmpty(parsedReceipt.MedicalRecordNumber))
{
    var medicalRecordNumber = await ExtractMedicalRecordNumberAsync(step1Content);
    parsedReceipt.MedicalRecordNumber = medicalRecordNumber == "NOT_FOUND" ? null : medicalRecordNumber;
}
```

常见病案号格式正则:

```csharp
// 中文医疗系统中的病案号常见格式
var medicalRecordPatterns = new[]
{
    @"[病住]案号[:：\s]*([A-Z]?[A-Z]?\d{6,})",      // 病案号: B2026001
    @"[病住]院号[:：\s]*([A-Z]?[A-Z]?\d{6,})",        // 住院号: Z2026001
    @"[出院]记录[号]?:[:：\s]*([A-Z]?[A-Z]?\d{6,})",  // 出院记录号
    @"编号[:：\s]*([A-Z]{2}\d{6,})",                   // 编号: AB2026001
};
```

### 3.3 用户故事: OCR 增强

**US-OCR-01: 用户上传医疗票据照片, OCR 自动识别并提取完整医疗信息**

- 前置条件: 用户上传一张医疗票据照片 (挂号单/收费单/诊断单等)
- 流程:
  1. 系统根据文件名/标签判断场景为"医疗"
  2. 使用医疗场景 prompt 执行 Step 1 OCR
  3. Step 2 映射到结构化 JSON, 自动提取 medicalRecordNumber
  4. 如果 medicalRecordNumber 为空, 触发 Step 3 专项提取
  5. 前端展示提取结果, 用户可编辑所有字段
- 验收标准:
  - [ ] 医疗票据的 hospitalName 准确率 >= 90%
  - [ ] 医疗票据的 medicalRecordNumber 准确率 >= 80%
  - [ ] 医疗票据的 receiptDate 准确率 >= 85%
  - [ ] 收费单的收费项目明细 (items) 完整提取率 >= 75%
  - [ ] 药品明细 (medications) 完整提取率 >= 80%

**US-OCR-02: 用户上传购物小票照片, OCR 自动识别商品列表和金额**

- 前置条件: 用户上传一张购物小票照片
- 验收标准:
  - [ ] 商户名称 (merchantName) 提取准确率 >= 85%
  - [ ] 商品名 (item name) 提取准确率 >= 80%
  - [ ] 单价 (unitPrice) 提取准确率 >= 75%
  - [ ] 总金额 (totalAmount) 提取准确率 >= 90%

**US-OCR-03: 用户上传包含多张票据的混合照片**

- 前置条件: 用户上传一张包含 2+ 张独立票据的照片 (如一张纸上贴了多张小票)
- 验收标准:
  - [ ] OCR 能正确将不同票据识别为数组中的不同元素
  - [ ] 不同日期的票据不会合并到同一个对象
  - [ ] 不同商户的票据不会合并到同一个对象
  - [ ] 前端以 Tab 方式按 Photo 分组展示提取结果

---

## 4. Photo 分组视图规范

### 4.1 现有视图

| 视图模式 | 分组依据 | 状态 |
|----------|---------|------|
| Grid (网格) | 平铺, 无分组 | 已有 |
| Grouped (分组) | 按 capturedDate (月) 分组 | 已有 |
| ReceiptGrouped (票据) | 按 receiptId 分组 | 已有, 功能基础 |

### 4.2 Phase 5: 新增 Receipt-Date Grouped View

核心需求: 照片可以按照其关联的 receipt 日期分组显示。同一张照片可能出现在多个分组中 (因为一张照片可能包含多张不同日期的票据)。

#### 4.2.1 分组逻辑

```
1. 用户选择按月查看
2. 查询 ReceiptReceiptDateIndex 中包含该月份键的 Photos
3. 对每个匹配的照片:
   a. 加载该 Photo 的所有 receipts
   b. 筛选出 receiptDate 在目标月份的 receipts
   c. 为每个匹配的 receipt 生成分组标题 (见下方)
4. 每个照片在每个分组中只出现一次 (去重)
```

#### 4.2.2 分组标题规范

每个分组的标题应显示有意义的信息, 而非单纯显示日期:

格式: [日期] [商户名/医院名] - [金额汇总]

示例:
- 2026年4月 - 上海市第六人民医院 (收费) - ¥340.00
- 2026年4月 - 沃尔玛 (超市) - ¥156.50
- 2026年4月 - 多张票据合计 - ¥596.50

标题生成规则:

```csharp
string GenerateGroupTitle(IEnumerable<Receipt> receipts)
{
    var dateStr = $"{receipts.First().ReceiptDate.Value.Year}年{receipts.First().ReceiptDate.Value.Month}月";

    var hospitals = receipts.Where(r => r.Type == "Medical").Select(r => r.HospitalName).Distinct().ToList();
    var merchants = receipts.Where(r => r.Type == "Shopping").Select(r => r.MerchantName).Distinct().ToList();

    if (hospitals.Count == 1 && merchants.Count == 0)
        return $"{dateStr} - {hospitals[0]} ({receipts.First().Category}) - ¥{receipts.Sum(r => r.TotalAmount ?? 0):F2}";
    if (merchants.Count == 1 && hospitals.Count == 0)
        return $"{dateStr} - {merchants[0]} ({receipts.First().Category}) - ¥{receipts.Sum(r => r.TotalAmount ?? 0):F2}";
    if (hospitals.Count > 1 || merchants.Count > 1)
        return $"{dateStr} - 多种票据 - {receipts.Count}张";

    return $"{dateStr} - 未分类票据 - ¥{receipts.Sum(r => r.TotalAmount ?? 0):F2}";
}
```

#### 4.2.3 视图组件设计

```
PhotoReceiptDateGroupedView (NEW)
  |-- MonthHeader (显示月份标题和总金额)
  |     |-- GroupTitle (商户名/医院名)
  |     |-- PhotoThumbnailGrid (该分组内的照片缩略图)
  |         |-- PhotoThumbnailCard
  |              |-- Image (缩略图)
  |              |-- ReceiptBadge (票据数量)
  |              |-- ExpandIcon (展开查看 receipt 详情)
  |-- FilterBar
  |     |-- DateRangeSelector (YYYY-MM)
  |     |-- TypeFilter (All/Shopping/Medical)
  |-- NoPhotosMessage
```

### 4.3 用户故事: Photo 分组视图

**US-PHOTO-01: 用户按 receipt 日期浏览照片, 一张照片出现在多个日期分组中**

- 前置条件: 用户上传了一张包含两张票据的照片 (1月购物 + 2月医疗)
- 验收标准:
  - [ ] 照片在 1月 分组中出现, 显示购物票据信息
  - [ ] 照片在 2月 分组中出现, 显示医疗票据信息
  - [ ] 每组内的照片只出现一次 (不重复)
  - [ ] 点击照片可查看完整影像和所有关联票据

**US-PHOTO-02: 用户在 Photo 分组视图看到有意义的分组标题**

- 验收标准:
  - [ ] 单医院票据分组显示: "2026年4月 - 上海市第六人民医院 - ¥340.00"
  - [ ] 单商户票据分组显示: "2026年4月 - 沃尔玛 - ¥156.50"
  - [ ] 多票据分组显示: "2026年4月 - 多种票据 - 3张"
  - [ ] 无票据照片单独分组, 显示 "未关联票据"

---

## 5. 医疗数据关联规范

### 5.1 核心概念: MedicalRecordNumber (病案号)

病案号是中国医疗系统中的核心识别符, 用于关联同一患者在同一医院的所有就诊记录。

关键理解:
- 病案号 = MedicalRecordNumber = 病案号/住院号
- 一个病案号对应一个患者在一家医院的一次完整就诊周期
- 同一病案号下的票据包括: 挂号单、收费单、诊断报告、处方、化验单、出院小结
- 挂号条上通常同时有 "就诊号/门诊号" (当次就诊) 和 "病案号" (长期)

**中国医疗系统票据类型详解:**

| 票据类型 | 中文名称 | 关键信息 |
|----------|---------|---------|
| Registration | 挂号单 | 医院、科室、挂号号、就诊号、患者姓名、就诊日期 |
| PaymentReceipt | 收费收据/发票 | 医院、病案号、就诊号、收费项目明细、合计、医保支付明细 |
| Diagnosis | 诊断报告 | 医院、科室、患者、诊断结论、检查项目 |
| LabResult | 检验报告 | 检验项目名、结果值、参考范围、异常标记 |
| Prescription | 处方 | 药品名、剂量、频次、天数、开药医生 |
| ImagingResult | 影像报告 | 检查类型、检查所见、诊断意见 |
| DischargeNote | 出院小结 | 入院日期、出院日期、诊断、治疗方案、出院医嘱 |

### 5.2 MedicalRecordIndex 实体设计

```csharp
[BsonIgnoreExtraElements]
public class MedicalRecordIndex
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;

    // 核心关联键
    public string MedicalRecordNumber { get; set; } = string.Empty;  // 病案号
    public string HospitalName { get; set; } = string.Empty;          // 医院名称

    // 聚合的患者数据 (从首个遇到的 receipt 提取)
    public string PatientName { get; set; } = string.Empty;
    public string? InsuranceType { get; set; }

    // 所有关联的就诊 ID
    public List<string> VisitIds { get; set; } = new();

    // 所有关联的 Receipt IDs (直接引用, 不依赖 Visit)
    public List<string> ReceiptIds { get; set; } = new();

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

MongoDB 索引:
  Compound unique index on (MedicalRecordNumber, OwnerId)

### 5.3 自动关联逻辑 (Enhanced AutoAssociateService)

优先级顺序:

Level 0: MedicalRecordNumber 精确匹配 (最高优先级)
  IF receipt.MedicalRecordNumber is not null
    Find MedicalRecordIndex WHERE MedicalRecordNumber = receipt.MedicalRecordNumber AND OwnerId = current
    IF found: Associate receipt to existing visit(s) for this record number
    ELSE: Create new MedicalRecordIndex entry + new visit group

Level 1: OutpatientNumber 精确匹配 (已有, 调整优先级)
  IF receipt.OutpatientNumber is not null
    Search Photo.Tags for outpatientNumber substring
    IF match found: Associate

Level 2: Hospital + Patient + Date (已有, 增强)
  IF receipt.HospitalName and receipt.PatientName both not null
    Search for photos within +/-3 days where LocationName contains hospital name
    AND patient name match
    IF match: Associate with higher weight

Level 3: Hospital name match within +/-7 days (已有, 降低优先级)
  IF receipt.HospitalName is not null
    Search for photos within +/-7 days where LocationName contains hospital name
    IF match: Associate with lower weight

### 5.4 用户故事: 医疗数据关联

**US-MED-01: 用户上传挂号单, 系统自动提取病案号并创建医疗索引**

- 前置条件: 用户上传一张挂号单照片
- 流程:
  1. OCR 识别挂号单信息, 提取病案号 (如 B2026001)
  2. 检查 MedicalRecordIndex 中是否存在该病案号
  3. 如果不存在, 创建新的 MedicalRecordIndex 条目
  4. 关联挂号单到该索引条目
- 验收标准:
  - [ ] 挂号单的病案号被正确提取并存储
  - [ ] MedicalRecordIndex 条目被创建
  - [ ] 患者姓名、医院名称被正确记录

**US-MED-02: 用户上传收费单, 系统自动关联到已有病案号的就诊记录**

- 前置条件: 用户已有挂号单 (病案号 B2026001), 现在上传同一次就诊的收费单
- 验收标准:
  - [ ] 收费单的病案号被正确提取
  - [ ] 系统自动将收费单关联到已有的 MedicalRecordIndex 条目
  - [ ] 收费单出现在该病案号对应的就诊记录中
  - [ ] 用户的 "就诊历史" 视图中, 这次就诊同时显示挂号单和收费单

**US-MED-03: 用户按病案号搜索就诊历史**

- 前置条件: 用户已有多条带有病案号的医疗记录
- 验收标准:
  - [ ] 用户可以在 Medical Dashboard 中输入病案号进行搜索
  - [ ] 搜索结果展示该病案号关联的所有就诊记录
  - [ ] 每次就诊展示: 就诊日期、医院、科室、总费用、票据数量
  - [ ] 点击就诊记录可查看该次就诊的所有票据 (挂号、收费、诊断、处方等)

**US-MED-04: 用户查看患者跨就诊用药历史**

- 前置条件: 用户同一病案号下有多次就诊记录, 部分记录有药品信息
- 验收标准:
  - [ ] 在就诊记录详情中, 可以查看该患者所有就诊的用药汇总
  - [ ] 每种药品显示: 名称、用药记录次数、历史最低价
  - [ ] 点击药品名称可展开查看每次用药的详细信息 (剂量、频次、天数)

**US-MED-05: 用户手动调整票据归属 (Re-link)**

- 前置条件: 用户的 OCR 识别有误, 导致票据归到了错误的就诊记录
- 验收标准:
  - [ ] 用户可以在 Receipt 详情页将票据从一个 Visit 转移到另一个 Visit
  - [ ] 转移后, MedicalRecordIndex 和 ReceiptVisit 同步更新
  - [ ] 操作后, 所有相关视图自动刷新

---

## 6. 购物数据分析功能边界

### 6.1 Phase 5 范围 (数据基础设施建设)

Phase 5 不构建购物数据 Dashboard, 而是只建立数据索引和 API 基础设施。具体包括:

**已包含的功能:**

1. ShoppingPriceIndex 实体
   - 每笔购物 receipt 的每个 line item 在 save 时自动生成一条 ShoppingPriceIndex 记录
   - 包含字段: NormalizedItemName, MerchantName, UnitPrice, Timestamp, ReceiptId

2. 价格追踪 API
   - GET /api/shopping/price-history?itemName=milk - 获取某商品的历史价格
   - GET /api/shopping/merchant-summary - 获取某商户的消费统计

3. 数据归一化
   - 商品名标准化: 去除数量后缀 (如 "500ml"、"袋"、"瓶")
   - 大小写统一: 全部转为小写
   - 空白统一: 去除首尾空格

**不包含的功能 (Phase 6+):**

1. 购物 Dashboard 页面
2. 商品价格趋势图表
3. 购买频率提醒
4. "最便宜" 价格比较
5. 购物预算统计

### 6.2 用户故事: 购物数据基础设施

**US-SHOP-01: 保存购物 receipt 时自动建立价格索引**

- 前置条件: 用户确认保存一张购物小票 receipt
- 验收标准:
  - [ ] 每个 line item 自动创建一条 ShoppingPriceIndex 记录
  - [ ] 商品名经过标准化处理 (去除数量/单位后缀)
  - [ ] 价格为 0 或 null 的 item 不创建索引

**US-SHOP-02: 通过 API 查询商品价格历史**

- 前置条件: 数据库中已有若干条 ShoppingPriceIndex 记录
- 验收标准:
  - [ ] GET /api/shopping/price-history 返回指定商品的价格历史
  - [ ] 结果按时间排序 (最新在前)
  - [ ] 包含价格趋势摘要 (最低价、最高价、均价)

### 6.3 数据归一化规范

```csharp
public static string NormalizeItemName(string itemName)
{
    if (string.IsNullOrEmpty(itemName)) return itemName;

    // Step 1: 去除常见的数量和单位后缀
    var normalized = Regex.Replace(itemName, @"(\d+(\.\d+)?)\s*(个|包|袋|瓶|盒|箱|桶|斤|公斤|kg|g|ml|L|支|条|卷|双|对)", "", RegexOptions.IgnoreCase);

    // Step 2: 去除数字开头的前缀 (如 "3支装" -> "")
    normalized = Regex.Replace(normalized, @"^\d+(\.\d+)?\s*支?\s*装", "", RegexOptions.IgnoreCase);

    // Step 3: 去除多余空白, 转为小写
    normalized = normalized.Trim().ToLower();

    return normalized;
}
```

---

## 7. BatchExtractDialog 增强

### 7.1 现有问题

当前 BatchExtractDialog 的确认界面存在以下不足:

1. 医疗字段缺失: 没有病案号、诊断文本、医保类型等医疗专属字段的编辑入口
2. receipt 列表扁平: 所有 receipt 排成一列, 对于多照片批量处理难以区分
3. 缺少 receipt 详情预览: 无法在确认前查看 receipt 的完整信息
4. 没有 receipt 删除功能: 误识别的 receipt 无法从确认列表移除

### 7.2 Phase 5 增强设计

#### 7.2.1 字段编辑增强

**医疗 receipt 编辑面板新增字段:**

| 字段 | 类型 | 说明 |
|------|------|------|
| MedicalRecordNumber | Text field | 病案号 - 允许手动编辑 |
| InsuranceType | Dropdown | 医保类型: 城镇职工 / 城镇居民 / 新农合 / 自费 |
| InsuranceNumber | Text field | 医保编号 |
| DiagnosisText | Textarea | 诊断文本 |
| Department | Text field | 科室 |
| DoctorName | Text field | 开药医生 |
| PatientName | Text field | 患者姓名 |
| OutpatientNumber | Text field | 门诊号/就诊号 |
| MedicalInsuranceFundPayment | Number | 医保统筹支付金额 |
| PersonalSelfPay | Number | 个人自付金额 |
| PersonalOutOfPocket | Number | 个人自费金额 |

**购物 receipt 编辑面板新增字段:**

| 字段 | 类型 | 说明 |
|------|------|------|
| Category | Dropdown | 类型: Supermarket / Restaurant / OnlineShopping / Other |

#### 7.2.2 多 receipt 管理增强

BatchExtractDialog (Enhanced)
  Step 0: Preview (现有)
  Step 1: Extracting (现有)
  Step 2: Confirm (增强)
    PhotoTabs (按照片分组, 现有)
    ReceiptList (增强版)
      ReceiptCard (每个 receipt 一个卡片)
        ReceiptHeader (类型 + 商户/医院 + 金额)
        ReceiptPreview (收起态: 关键信息摘要)
        ReceiptEditForm (展开态: 完整编辑表单)
        ReceiptActions (保存 / 编辑 / 丢弃 / 拆分)
    BatchActions
      ConfirmAllButton
      RetakeAllButton
      FilterByType (All / Shopping / Medical)
  Step 3: Done (现有)

#### 7.2.3 ReceiptCard 组件设计

```tsx
interface ReceiptCardProps {
  receipt: ConfirmReceipt;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (field: string, value: any) => void;
  onDiscard: () => void;
  onSplit: () => void;
  photoName: string;
  photoImageUrl?: string;
  photoId: string;
}

// 关键交互:
// 1. 默认收起态: 显示关键信息摘要 + 照片缩略图
// 2. 点击展开: 显示完整编辑表单
// 3. 收起态操作按钮: 编辑、丢弃、拆分
// 4. 展开态操作按钮: 完成编辑、丢弃、拆分
```

### 7.3 用户故事: BatchExtractDialog 增强

**US-DIALOG-01: 用户在确认阶段能看到并编辑所有医疗字段**

- 前置条件: OCR 完成, 进入确认界面
- 验收标准:
  - [ ] 医疗 receipt 的编辑表单包含所有医疗专属字段
  - [ ] 病案号字段支持手动编辑和纠错
  - [ ] 医保类型支持从下拉菜单选择
  - [ ] 诊断文本支持多行输入

**US-DIALOG-02: 用户可以丢弃误识别的 receipt**

- 验收标准:
  - [ ] 每个 receipt 卡片有"丢弃"按钮
  - [ ] 丢弃后, receipt 从确认列表中移除
  - [ ] 丢弃操作不影响同一照片中的其他 receipt

**US-DIALOG-03: 用户可以拆分一个 receipt (如果 OCR 将两张票据合并)**

- 验收标准:
  - [ ] 每个 receipt 卡片有"拆分"按钮
  - [ ] 拆分后, 原 receipt 被拆分为两个独立 receipt
  - [ ] 两个 receipt 共享同一 SourcePhotoId

---

## 8. API 变更汇总

### 8.1 新增 API 端点

| 方法 | 路径 | 说明 | 控制器 |
|------|------|------|--------|
| POST | /api/photos/{id}/extract | 对单张照片执行 OCR 提取 | PhotoController |
| GET | /api/photos/grouped | 按日期分组查询照片 (支持 receiptDate 分组) | PhotoController |
| GET | /api/receipts/by-source-photo/{photoId} | 获取指定照片的所有 receipt | ReceiptController |
| POST | /api/receipts/save-confirmed | 确认保存 receipt, 建立 Photo-Receipt 关联 | ReceiptController |
| GET | /api/visits/by-medical-record?medicalRecordNumber=xxx | 按病案号查询就诊记录 | VisitController |
| GET | /api/medical/record-index | 获取用户的所有 MedicalRecordIndex 条目 | MedicalController |
| GET | /api/medical/patient-history?medicalRecordNumber=xxx | 获取患者跨就诊历史 | MedicalController |
| POST | /api/visits/relink | 手动调整 receipt 的 Visit 归属 | VisitController (已有) |
| GET | /api/shopping/price-history | 获取商品价格历史 (Phase 5 仅 API) | ShoppingController |
| GET | /api/shopping/merchant-summary | 获取商户消费统计 (Phase 5 仅 API) | ShoppingController |

### 8.2 修改的 API 端点

| 方法 | 路径 | 变更 |
|------|------|------|
| POST | /api/visits/batch-extract | 使用场景感知 prompt; 返回 medicalRecordNumber |
| POST | /api/visits/save-confirmed | 设置 SourcePhotoId; 更新 MedicalRecordIndex |

### 8.3 API 变更原则

- 所有变更都是增量式的 (additive)
- 不修改现有端点的请求参数 (保持 backward compat)
- 现有端点的响应字段只增加, 不删除
- ImageUrl 字段标记为 deprecated, 但保留以兼容旧客户端

---

## 9. 数据模型变更汇总

### 9.1 Receipt 实体新增字段

```csharp
public string? SourcePhotoId { get; set; }              // 新增: 关联 PhotoAlbum.Id
public List<string> AdditionalPhotoIds { get; set; }    // 新增: 多页照片
public string? MedicalRecordNumber { get; set; }        // 新增: 病案号
public string? DiagnosisText { get; set; }              // 新增: 诊断文本 (增强)
public string? InsuranceType { get; set; }              // 新增: 医保类型 (已有部分)
```

### 9.2 ReceiptVisit 实体新增字段

```csharp
public string? MedicalRecordNumber { get; set; }        // 新增: 病案号
public string? InsuranceNumber { get; set; }            // 新增: 医保编号
```

### 9.3 PhotoAlbum 实体新增字段

```csharp
public int ExtractedReceiptCount { get; set; }          // 新增: 提取的票据数量
public string LastOcrStatus { get; set; } = "Pending";  // 新增: OCR 状态
public Dictionary<string, List<string>>? PhotoReceiptDateIndex { get; set; } // 新增: 日期索引
```

### 9.4 新增实体

MedicalRecordIndex - 病案号索引

```csharp
[BsonIgnoreExtraElements]
public class MedicalRecordIndex
{
    public string Id { get; set; }
    public string OwnerId { get; set; }
    public string MedicalRecordNumber { get; set; }
    public string HospitalName { get; set; }
    public string PatientName { get; set; }
    public string? InsuranceType { get; set; }
    public List<string> VisitIds { get; set; } = new();
    public List<string> ReceiptIds { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

ShoppingPriceIndex - 价格索引 (Phase 5 只建, 前端暂不展示)

```csharp
[BsonIgnoreExtraElements]
public class ShoppingPriceIndex
{
    public string Id { get; set; }
    public string OwnerId { get; set; }
    public string NormalizedItemName { get; set; }
    public string MerchantName { get; set; }
    public decimal UnitPrice { get; set; }
    public string Currency { get; set; } = "CNY";
    public DateTime Timestamp { get; set; }
    public string ReceiptId { get; set; }
}
```

---

## 10. 前端组件变更汇总

### 10.1 新增/增强组件

| 组件 | 变更类型 | 说明 |
|------|---------|------|
| BatchExtractDialog | 增强 | 医疗字段编辑 + 多 receipt 管理 + 拆分功能 |
| PhotoReceiptGroupedView | 增强 | 标题显示商户名/医院名 + 金额汇总 |
| MedicalVisitTimeline | 增强 | 按 MedicalRecordNumber 分组 + 跨就诊用药历史 |
| ReceiptEditForm | 新增 | 医疗 receipt 专用编辑表单 |
| MedicalRecordSearch | 新增 | 病案号搜索组件 |
| ShoppingDashboard | 新增 | Phase 5 仅占位, 无实际内容 |

### 10.2 前端服务新增方法

| 服务 | 新增方法 | 说明 |
|------|---------|------|
| photo.service.ts | getGrouped(params) | 按日期分组查询照片 |
| photo.service.ts | extractById(photoId) | 单照片 OCR |
| receipt.service.ts | getBySourcePhoto(photoId) | 按 photoId 查询 receipt |
| receipt.service.ts | saveConfirmed(receipts) | 确认保存 receipt |
| medical.service.ts (NEW) | getByMedicalRecordNumber(n) | 按病案号查询 |
| medical.service.ts (NEW) | getPatientHistory(n) | 患者跨就诊历史 |
| medical.service.ts (NEW) | getAllRecordIndexes() | 获取所有病案号索引 |
| shopping.service.ts (NEW) | getPriceHistory(itemName) | 价格历史 |
| shopping.service.ts (NEW) | getMerchantSummary(merchant) | 商户统计 |

### 10.3 TypeScript 类型新增

```typescript
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

interface PatientHistoryResponse {
  medicalRecordNumber: string;
  patientName: string;
  hospitalName: string;
  totalVisits: number;
  totalSpending: number;
  visits: MedicalVisitSummary[];
  medicationHistory: MedHistoryEntry[];
}

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
```

---

## 11. MongoDB 索引策略

| 集合 | 字段 | 类型 | 用途 |
|------|------|------|------|
| receipts | OwnerId + MedicalRecordNumber | Compound (sparse) | 快速按病案号查询 |
| receipts | OwnerId + SourcePhotoId | Compound | 按照片反向查询 receipt |
| receipts | OwnerId + ReceiptDate | Compound | 按日期范围查询 |
| medical_record_index | MedicalRecordNumber + OwnerId | Compound (unique) | 病案号唯一性约束 |
| shopping_price_index | NormalizedItemName + OwnerId + Timestamp | Compound | 价格历史查询 |
| photo_albums | OwnerId + PhotoReceiptDateIndex | Document-level | 按 receipt 日期查询照片 |

---

## 12. 迁移策略

### 12.1 Startup Migration (Phase 5 启动时执行)

Step 1: 为现有 Receipt 填充 SourcePhotoId

```csharp
foreach (var receipt in allReceipts)
{
    if (string.IsNullOrEmpty(receipt.SourcePhotoId) && !string.IsNullOrEmpty(receipt.ImageUrl))
    {
        var fileName = Path.GetFileName(receipt.ImageUrl.TrimStart('/'));
        var photo = await photoRepo.FindOneAsync(p => p.FileName == fileName && p.OwnerId == receipt.OwnerId);
        if (photo != null)
        {
            receipt.SourcePhotoId = photo.Id;
            await receiptRepo.UpdateAsync(receipt);
        }
    }
}
```

Step 2: 为现有 PhotoAlbum 填充 PhotoReceiptDateIndex

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
        await photoRepo.UpdateAsync(photo);
    }
}
```

Step 3: 为现有 Medical Receipt 提取 MedicalRecordNumber

```csharp
foreach (var receipt in medicalReceipts
    .Where(r => string.IsNullOrEmpty(r.MedicalRecordNumber) && !string.IsNullOrEmpty(r.RawText)))
{
    foreach (var pattern in medicalRecordPatterns)
    {
        var match = Regex.Match(receipt.RawText!, pattern);
        if (match.Success)
        {
            receipt.MedicalRecordNumber = match.Groups[1].Value;
            await receiptRepo.UpdateAsync(receipt);
            break;
        }
    }
}
```

Step 4: 构建 MedicalRecordIndex

```csharp
var medicalReceipts = await receiptRepo.GetByOwnerIdAsync(userId, ReceiptType.Medical);
var indexMap = new Dictionary<string, MedicalRecordIndex>();

foreach (var receipt in medicalReceipts.Where(r => !string.IsNullOrEmpty(r.MedicalRecordNumber)))
{
    var key = $"{receipt.MedicalRecordNumber}_{receipt.HospitalName ?? "unknown"}";
    if (!indexMap.ContainsKey(key))
    {
        indexMap[key] = new MedicalRecordIndex
        {
            MedicalRecordNumber = receipt.MedicalRecordNumber!,
            HospitalName = receipt.HospitalName ?? "",
            PatientName = receipt.PatientName ?? "",
            ReceiptIds = new List<string> { receipt.Id }
        };
    }
    else if (!indexMap[key].ReceiptIds.Contains(receipt.Id))
    {
        indexMap[key].ReceiptIds.Add(receipt.Id);
    }
}

foreach (var entry in indexMap.Values)
{
    await medicalRecordIndexRepo.CreateAsync(entry);
}
```

Step 5: 构建 ShoppingPriceIndex (Backfill)

```csharp
foreach (var receipt in shoppingReceipts)
{
    foreach (var item in receipt.Items)
    {
        var normalizedName = NormalizeItemName(item.Name);
        if (item.UnitPrice.HasValue && item.UnitPrice.Value > 0)
        {
            await shoppingPriceIndexRepo.CreateAsync(new ShoppingPriceIndex
            {
                OwnerId = receipt.OwnerId,
                NormalizedItemName = normalizedName,
                MerchantName = receipt.MerchantName ?? "",
                UnitPrice = item.UnitPrice.Value,
                Timestamp = receipt.ReceiptDate ?? DateTime.UtcNow,
                ReceiptId = receipt.Id
            });
        }
    }
}
```

---

## 13. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| OCR 对复杂医疗单据识别不准 | 高 | 中 | Step 3 专项提取作为安全网; 前端允许手动编辑 |
| 病案号提取错误导致错误关联 | 高 | 中 | 自动关联时提示用户确认; 提供手动调整功能 |
| 多 receipt 照片的 OCR 结果混乱 | 中 | 中 | 前端提供拆分功能; 用户可手动分割 receipt |
| PhotoReceiptDateIndex 性能 | 中 | 低 | MongoDB 嵌入式字典查询效率较高; 有索引支持 |
| 迁移脚本在大数据量下运行慢 | 低 | 低 | 分批处理; 在后台执行不阻塞主流程 |

---

## 14. 完整用户故事汇总

### OCR 能力增强 (3 个)
- US-OCR-01: 医疗票据 OCR 提取
- US-OCR-02: 购物小票 OCR 提取
- US-OCR-03: 混合多票据 OCR 提取

### Photo 分组视图 (2 个)
- US-PHOTO-01: 按 receipt 日期浏览照片
- US-PHOTO-02: 有意义的分组标题

### 医疗数据关联 (5 个)
- US-MED-01: 挂号单病案号自动提取
- US-MED-02: 收费单自动关联到已有就诊
- US-MED-03: 按病案号搜索
- US-MED-04: 跨就诊用药历史
- US-MED-05: 手动调整票据归属

### 购物数据分析 (2 个)
- US-SHOP-01: 自动建立价格索引
- US-SHOP-02: 价格历史 API

### UI/交互 (3 个)
- US-DIALOG-01: 医疗字段编辑
- US-DIALOG-02: 丢弃误识别 receipt
- US-DIALOG-03: 拆分合并的 receipt

### 迁移与运维 (2 个)
- US-MIG-01: 自动填充 SourcePhotoId
- US-MIG-02: 自动构建病案号索引

**总计: 17 个用户故事**

---

## 15. 验收标准汇总

### 15.1 OCR 能力
- [ ] 医疗票据 hospitalName 准确率 >= 90%
- [ ] 医疗票据 medicalRecordNumber 准确率 >= 80%
- [ ] 医疗票据 receiptDate 准确率 >= 85%
- [ ] 购物小票 merchantName 准确率 >= 85%
- [ ] 购物小票 totalAmount 准确率 >= 90%
- [ ] 多票据照片能正确拆分为数组

### 15.2 Photo 分组视图
- [ ] 照片可按 receipt 日期分组显示
- [ ] 多日期票据的照片出现在多个分组中
- [ ] 每组内照片不重复
- [ ] 分组标题显示有意义的信息 (商户/医院/金额)

### 15.3 医疗数据关联
- [ ] MedicalRecordNumber 被正确提取并存储
- [ ] MedicalRecordIndex 被正确创建和维护
- [ ] 同一病案号的票据自动归组
- [ ] 按病案号搜索返回正确结果
- [ ] 手动 re-link 功能正常工作

### 15.4 购物数据
- [ ] ShoppingPriceIndex 被正确创建
- [ ] 商品名归一化逻辑正确
- [ ] 价格历史 API 返回正确数据

### 15.5 BatchExtractDialog
- [ ] 医疗字段完整可编辑
- [ ] 可丢弃误识别的 receipt
- [ ] 可拆分合并的 receipt
- [ ] 多 receipt 以卡片形式展示

### 15.6 迁移
- [ ] 现有 receipt 的 SourcePhotoId 被正确回填
- [ ] 现有 photo 的 PhotoReceiptDateIndex 被正确回填
- [ ] 现有 medical receipt 的 MedicalRecordNumber 被正确回填

---

## 16. 附录

### 16.1 中国医疗系统术语表

| 英文术语 | 中文术语 | 说明 |
|----------|---------|------|
| MedicalRecordNumber | 病案号 | 患者在医院的主要识别号码 |
| OutpatientNumber | 门诊号/就诊号 | 当次就诊的号码 |
| Registration | 挂号单 | 患者挂号的记录 |
| PaymentReceipt | 收费收据/发票 | 医院开具的费用清单 |
| Diagnosis | 诊断报告 | 医生给出的诊断结果 |
| LabResult | 检验报告 | 化验/检查的结果 |
| Prescription | 处方 | 医生开具的用药处方 |
| DischargeNote | 出院小结 | 患者出院时的总结报告 |
| MedicalInsuranceFundPayment | 医保统筹支付 | 医保基金支付的部分 |
| PersonalSelfPay | 个人自付 | 个人需要支付但医保部分报销的部分 |
| PersonalOutOfPocket | 个人自费 | 完全由个人承担的费用 |
| InsuranceType | 医保类型 | 城镇职工 / 城镇居民 / 新农合 / 自费 |

### 16.2 代码参考

- Photo 实体: server/Models/Entities/PhotoEntities.cs
- Receipt 实体: server/Models/Entities/ReceiptEntities.cs
- Photo Controller: server/Controllers/PhotoController.cs
- Visit Controller: server/Controllers/VisitController.cs
- AutoAssociateService: server/Services/Implementations/AutoAssociateService.cs
- BatchExtractDTOs: server/Models/DTOs/Receipt/BatchExtractDtos.cs
- PhotoAlbumPage: client/src/components/Photos/PhotoAlbumPage.tsx
- BatchExtractDialog: client/src/components/Receipts/BatchExtractDialog.tsx
- PhotoReceiptGroupedView: client/src/components/Photos/PhotoReceiptGroupedView.tsx
- MedicalVisitTimeline: client/src/components/Receipts/MedicalVisitTimeline.tsx
- Photo Service: client/src/services/photo.service.ts
- Receipt Service: client/src/services/receipt.service.ts

### 16.3 变更影响分析

Phase 5 变更影响范围:

| 文件 | 变更类型 | 影响 |
|------|---------|------|
| PhotoEntities.cs | 新增字段 | 无破坏性 |
| ReceiptEntities.cs | 新增字段 | 无破坏性 |
| ReceiptEntities.cs | ReceiptVisit 新增字段 | 无破坏性 |
| Program.cs | 新增索引 | 无破坏性 |
| VisitController.cs | 修改 BatchExtract | 增量式增强 |
| PhotoController.cs | 新增端点 | 新增, 无破坏性 |
| ReceiptController.cs | 新增端点 | 新增, 无破坏性 |
| MedicalController.cs | 新增 | 全新文件 |
| ShoppingController.cs | 新增 | 全新文件 |
| AutoAssociateService.cs | 增强匹配逻辑 | 增量式增强 |
| BatchExtractDtos.cs | 新增字段 | 无破坏性 |
| PhotoDtos.cs | 新增字段 | 无破坏性 |
| ReceiptDtos.cs | 新增字段 | 无破坏性 |
| BatchExtractDialog.tsx | 增强 | 无破坏性 |
| PhotoAlbumPage.tsx | 新增视图模式 | 新增, 无破坏性 |
| PhotoReceiptGroupedView.tsx | 增强标题 | 无破坏性 |
| MedicalVisitTimeline.tsx | 增强分组 | 无破坏性 |
| photo.service.ts | 新增方法 | 新增, 无破坏性 |
| receipt.service.ts | 新增方法 | 新增, 无破坏性 |
| medical.service.ts | 新增 | 全新文件 |
| shopping.service.ts | 新增 | 全新文件 |

**破坏性变更: 无。所有变更都是增量式的 (additive)。**