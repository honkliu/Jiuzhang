# Phase 5 — Photo-First Receipt & Medical Management: Director Briefing

**项目:** KanKan (`/home/bob/gitroot/Jiuzhang/KanKan`)
**技术栈:** .NET 9 + MongoDB, React 18 + TypeScript + MUI
**模型:** Qwen3.6-35B-A3B (http://52.171.138.19:8001/v1)
**参考文档:** `PRD_Phase4.md`, `Architecture_Phase4.md`
**用户要求:** 用户会手动 commit，Agent 绝不执行 git commit/push

---

## 0. 当前代码基线 (Codebase Baseline)

### 已有功能:
- Photo 上传 (单张 + 批量), 存储在 wwwroot/photos/ 或 MongoDB Base64
- OCR 两步流程: Vision OCR (extract text) → Map to Schema (JSON)
- Receipt CRUD (Shopping/Medical 类型)
- Receipt 包含 line items, medications, lab results
- ReceiptVisit 概念 (但无 MedicalRecordNumber 字段)
- AutoAssociateService (3级弱匹配: 挂号号/医院+姓名/医院名)
- PhotoAlbumPage 有 3 种 view: grid, grouped (by capturedDate), receiptGrouped
- BatchExtractDialog (但缺乏医疗字段编辑能力)

### 已有文件索引:
```
server/Models/Entities/
  - PhotoEntities.cs     (PhotoAlbum)
  - ReceiptEntities.cs   (Receipt, ReceiptLineItem, MedicationItem, LabResultItem, ReceiptVisit)

server/Controllers/
  - PhotoController.cs   (CRUD + batch upload + by-date-range)
  - ReceiptController.cs (Receipt CRUD)
  - VisitController.cs   (BatchExtract, SaveConfirmed, AutoAssociate, Relink, Stats)

server/Services/Implementations/
  - PhotoService.cs
  - AutoAssociateService.cs
  - VisitStatsService.cs
  - OpenAiAgentService.cs

server/Repositories/
  - PhotoRepository.cs
  - ReceiptRepositories.cs (IReceiptRepository, ReceiptRepository)
  - IReceiptRepositories.cs

client/src/components/Photos/
  - PhotoAlbumPage.tsx       (main album page)
  - PhotoCard.tsx
  - PhotoLightbox.tsx
  - PhotoReceiptGroupedView.tsx
  - PhotoUploader.tsx

client/src/components/Receipts/
  - BatchExtractDialog.tsx   (OCR result confirmation dialog)
  - MedicalVisitTimeline.tsx
  - ReceiptDetail.tsx
  - ReceiptList.tsx
  - ReceiptsPage.tsx

client/src/components/OCR/
  - OCRBatchJob.tsx

client/src/services/
  - photo.service.ts
  - receipt.service.ts
```

---

## 1. 产品总监 (Product Director) 任务

### 目标: 产出完整的产品需求文档 + 用户故事

**当前 PRD_Phase4.md 已有基础框架，需要补充:**

1. **增强后的 OCR 能力描述:**
   - Step 1 (Vision OCR) 需要区分场景的 prompt 策略:
     - 医疗场景: 识别挂号条、收费单、诊断书、化验单、处方、出院小结
     - 购物场景: 识别商品名、单价、数量、总价、商户名、日期
   - Step 2 (Schema Mapping) 需要输出完整的结构化 JSON
   - 新增 Step 3 (Medical Record Number Extraction): 专门从医疗单据中提取病案号

2. **Photo 分组视图规范:**
   - 按上传时间分组 (现有)
   - 按照片拍摄时间分组 (现有基础)
   - 按 Receipt 日期分组 (核心需求: 照片可出现在多个分组中)
   - 每个分组的标题应显示有意义的信息 (商户名/医院名/金额)

3. **医疗数据关联规范:**
   - 病案号 (MedicalRecordNumber) 是核心关联键
   - 同一病案号的所有单据自动归为一个 Visit
   - 跨就诊历史通过病案号索引查询
   - 挂号条中的个人信息 (姓名、就诊号) 用于辅助关联

4. **购物数据分析功能边界:**
   - 商品价格追踪 (同一商品在不同商户的价格对比)
   - 购买频率提醒
   - 预算统计

**交付物:** 更新 `PRD_Phase4.md`，包含完整的用户故事、验收标准、边界情况

---

## 2. 架构总监 (Architecture Director) 任务

### 目标: 完善实体设计 + API 设计 + 数据流

**需要补充/修正的内容:**

1. **实体定义:**
   - `Receipt` 新增: `SourcePhotoId` (string), `AdditionalPhotoIds` (List<string>), `MedicalRecordNumber` (string), `DiagnosisText` (string), `InsuranceType` (string)
   - `ReceiptVisit` 新增: `MedicalRecordNumber` (string), `PatientName` (已有), `InsuranceNumber` (string)
   - **新增 `MedicalRecordIndex`** 实体:
     ```csharp
     public class MedicalRecordIndex {
         public string Id { get; set; }
         public string OwnerId { get; set; }
         public string MedicalRecordNumber { get; set; }
         public List<string> VisitIds { get; set; } = new();
         public DateTime LastUpdated { get; set; }
     }
     ```
   - `PhotoAlbum` 新增: `ExtractedReceiptCount` (int), `LastOcrStatus` (string), `PhotoReceiptDateIndex` (Dictionary<string, List<string>>)

2. **API 端点:**
   - `POST /api/visits/batch-extract` — 已有，但需加强 prompt
   - `POST /api/visits/save-confirmed` — 已有，需增加 VisitId 和 MedicalRecordNumber 维护
   - `GET /api/photos/by-receipt-date?yearMonth=2026-04` — 新增: 按 receipt 日期查询照片
   - `GET /api/visits/medical-index?medicalRecordNumber=xxx` — 新增: 病案号查询
   - `POST /api/visits/update-visit` — 新增: 手动调整 Visit 归属

3. **数据流:**
   - Photo upload → Photo stored → OCR → Extracted receipts → User confirms → Save with Visit/MedicalRecord linkage → PhotoReceiptDateIndex updated

**交付物:** 更新 `Architecture_Phase4.md`，包含完整实体定义、API 契约、数据流图

---

## 3. 开发总监 (Development Director) 任务

### 目标: 完成所有后端和前端代码实现

**3.1 后端 (Server Side)**

### Task 3.1.1: 实体层增强
- 修改 `ReceiptEntities.cs`:
  - 给 `Receipt` 增加 `SourcePhotoId`, `AdditionalPhotoIds`, `MedicalRecordNumber`, `DiagnosisText`, `InsuranceType`
  - 给 `ReceiptVisit` 增加 `MedicalRecordNumber`, `InsuranceNumber`
  - 新增 `MedicalRecordIndex` 类
- 修改 `PhotoEntities.cs`:
  - 给 `PhotoAlbum` 增加 `ExtractedReceiptCount`, `LastOcrStatus`, `PhotoReceiptDateIndex`
- 更新 `Program.cs` 中的 MongoDB 索引注册 (如需要)

### Task 3.1.2: OCR Prompt 增强
- 修改 `VisitController.cs` 的 `BatchExtract` 方法:
  - Step 1 prompt 从原来的单句 "请识别图像中的票据信息，输出Markdown格式内容和对应的JSON数据。" 升级为场景感知的多步 prompt:
    1. 先分析图片内容类型 (医疗/购物/其他)
    2. 如果是医疗: 详细提取 hospital, department, date, 病案号, 就诊号, 收费项目, 诊断等
    3. 如果是购物: 详细提取 merchant, date, items (name/qty/price), total
    4. 识别多张票据时，按每张独立票据拆分成数组项
  - Step 2 mapping prompt 需要更详细的 schema 说明

### Task 3.1.3: SaveConfirmed 增强
- 修改 `VisitController.SaveConfirmed`:
  - 保存 `Receipt.SourcePhotoId` 和 `AdditionalPhotoIds`
  - 如果 receipt 是 Medical 类型且有 `MedicalRecordNumber`，写入 `Receipt.VisitId` (自动创建或关联已有 Visit)
  - 更新 `MedicalRecordIndex` 集合
  - 更新 `PhotoAlbum.ExtractedReceiptCount` 和 `PhotoReceiptDateIndex`

### Task 3.1.4: AutoAssociateService 增强
- 增加 Level 0: MedicalRecordNumber 精确匹配 (最高优先级)
- 增强现有 Level 2: 不仅匹配 hospital + patient，还匹配 receipt date 精确匹配
- 增加就诊历史上下文: 如果同一患者近期在同一医院有就诊记录，提高匹配权重

### Task 3.1.5: 新增 API 端点
- `GET /api/photos/by-receipt-date?yearMonth=2026-04`:
  - 查询所有 photos 的 PhotoReceiptDateIndex
  - 返回在指定月份有 receipt 的 photos
- `GET /api/visits/medical-index?medicalRecordNumber=xxx`:
  - 返回该病案号关联的所有 Visit
- `POST /api/visits/update-visit`:
  - 手动调整 receipt 的 Visit 归属

### Task 3.1.6: DTO 更新
- 更新 `BatchExtractDtos.cs` / `ReceiptDtos.cs` 中的 DTO，包含新增字段

### Task 3.1.7: 构建验证
- 运行 `dotnet build` 确保无编译错误

### 3.2 前端 (Client Side)

### Task 3.2.1: BatchExtractDialog 增强
- 在确认对话框中:
  - 显示提取的医疗字段 (医院、科室、病案号、就诊号等)
  - 允许用户编辑这些字段
  - 对于购物 receipt，突出显示商品列表和金额
  - 对于多 receipt 照片，支持逐个查看/编辑/确认/删除

### Task 3.2.2: PhotoAlbumPage 分组视图增强
- 按 receipt 日期分组的视图:
  - 后端 API 返回按 receipt date 分组的 photos
  - 前端显示时，每组标题显示有意义的信息 (如 "2026年4月 - 上海市第六人民医院" 或 "2026年4月 - 沃尔玛")
  - 照片可出现在多个分组中 (因为一张照片可能有多个 receipt)

### Task 3.2.3: photo.service.ts 更新
- 添加新的 API 调用方法:
  - `getByReceiptDate(yearMonth)`
  - `getMedicalIndex(medicalRecordNumber)`

### Task 3.2.4: PhotoReceiptGroupedView 标题增强
- 显示 receipt 级别的元数据 (商户名/医院名) 而非 receiptId
- 显示总金额

**交付物:** 所有代码文件修改，确保 `dotnet build` 通过

---

## 4. 测试总监 (Test Director) 任务

### 目标: 制定测试计划 + 自动化测试

### Task 4.1: 测试计划
- 覆盖以下场景:
  1. Photo 上传 → OCR → 确认流程 (购物 receipt)
  2. Photo 上传 → OCR → 确认流程 (医疗 receipt)
  3. 单张照片多 receipt 场景
  4. MedicalRecordNumber 关联: 同一病案号的多张单据自动归组
  5. 按 receipt 日期分组查询
  6. 编辑 receipt 字段后更新
  7. AutoAssociate 增强后的匹配准确率

### Task 4.2: 自动化测试 (server.Tests)
- 单元测试: Receipt entity 字段验证
- 集成测试: OCR mock, SaveConfirmed 流程
- 前端测试: BatchExtractDialog 交互

**交付物:** `TEST_PLAN_Phase5.md` 或更新现有 `TEST_PLAN_PHOTO_OCR.md`

---

## 约束与注意事项

1. **不修改现有功能:** 用户明确要求 "不需要修改现有实现，只需要增加功能"。所有改动必须是增量式的 (additive)，不破坏现有接口。
2. **MongoDB 集合名:** 已有集合名不能改名，只能新增字段。
3. **用户不 commit:** 所有修改的文件由 Agent 编写，用户手动 git commit。
4. **医疗数据专业性:** 开发总监需要了解中国医疗系统的常见单据类型和关键字段。
5. **OCR 模型限制:** 使用 Qwen3.6-35B-A3B，prompt 要简洁有效，避免超出 token 限制。
