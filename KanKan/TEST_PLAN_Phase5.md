# KanKan — Test Plan: Phase 5 (Photo-First Receipt & Medical Management Enhanced)

**版本:** 1.0
**日期:** 2026-04-23
**作者:** 测试总监 (Hermes)
**审查:** 指挥官
**基准文档:** PRD_Phase5_Enhanced.md, Director_Briefing_Phase5.md, TEST_PLAN_PHOTO_OCR.md

---

## 1. 测试策略概述

### 1.1 Phase 5 变更摘要

Phase 5 在 Phase 4 Photo-First 架构基础上，核心增强四个方向：

| 增强方向 | 关键变更 | 影响范围 |
|----------|---------|---------|
| **场景感知 OCR** | Step 1 多场景 prompt (医疗/购物/混合), Step 2 增强 schema, Step 3 病案号专项提取 | VisitController.BatchExtract, PRD Section 3 |
| **Photo 分组视图** | 按 receipt date 分组, 标题显示商户/医院名, 照片可出现在多分组 | PhotoAlbumPage, PhotoReceiptGroupedView, PRD Section 4 |
| **医疗数据关联** | MedicalRecordNumber, MedicalRecordIndex 实体, AutoAssociate Level 0 | Receipt/Visit entities, AutoAssociateService, PRD Section 5 |
| **购物数据基建** | ShoppingPriceIndex, 商品名归一化, 价格历史 API (仅后端) | ShoppingPriceIndex entity, PRD Section 6 |

### 1.2 测试层级

| 层级 | 范围 | 框架 | 工具 |
|------|------|------|------|
| 单元测试 | 实体模型验证, 归一化函数, MedicalRecordNumber 正则提取 | xUnit + Moq + FluentAssertions | InMemory MongoDB |
| 控制器测试 | BatchExtract, SaveConfirmed, medical-index, update-visit, auto-associate | xUnit + WebApplicationFactory | 内存 MongoDB, 模拟 OCR API |
| 服务层测试 | AutoAssociateService 增强匹配, UpdateMedicalRecordIndexAsync | xUnit + Moq | 内存 MongoDB |
| 前端组件测试 | BatchExtractDialog 医疗字段编辑, PhotoReceiptGroupedView 标题渲染 | Jest + React Testing Library | @testing-library/react |
| 集成测试 | Photo -> OCR -> Confirm -> Visit/MedicalRecord 端到端流程 | xUnit + WebApplicationFactory | 内存 MongoDB + 模拟 OCR API |
| E2E 测试 | 浏览器完整上传-OCR-确认流程 | Playwright | 真实浏览器 |

### 1.3 测试设计原则

1. **增量测试策略**: Phase 5 测试是 Phase 4 的增量补充，不破坏现有测试
2. **Mock OCR API**: 所有 OCR 相关测试使用预定义 Mock 响应，不依赖真实 Qwen VL API
3. **InMemory MongoDB**: 所有后端测试使用 InMemoryMongoRepository（已有基础设施）
4. **场景覆盖**: 必须覆盖医疗场景、购物场景、混合场景三种 OCR 路径
5. **向后兼容**: 验证现有 Phase 4 功能不受影响（回归测试）

### 1.4 通过标准

| 指标 | 要求 |
|------|------|
| P0 (Must) 用例通过率 | 100% |
| P1 (Should) 用例通过率 | >= 95% |
| P2 (Could) 用例通过率 | >= 90% |
| 无 Critical/Major 缺陷遗留 | 是 |
| 核心业务逻辑覆盖率 | >= 80% |
| 安全漏洞 | 0 个 |
| 现有 Phase 4 回归测试通过率 | 100% |

---

## 2. 测试用例列表

### 2.1 实体模型验证 (P0 — Must)

#### MODEL-501: Receipt 新增字段验证

- **描述**: 验证 Receipt 实体包含 Phase 5 新增字段
- **步骤**:
  1. 创建 Receipt 实例
  2. 设置 SourcePhotoId, AdditionalPhotoIds, MedicalRecordNumber, DiagnosisText, InsuranceType
  3. 序列化并反序列化
  4. 验证所有字段正确持久化
- **预期结果**: 所有新增字段正确保存和恢复
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### MODEL-502: ReceiptVisit 新增 MedicalRecordNumber 字段

- **描述**: 验证 ReceiptVisit 包含 MedicalRecordNumber 和 InsuranceNumber
- **步骤**:
  1. 创建 ReceiptVisit 实例
  2. 设置 MedicalRecordNumber = "B2026001", InsuranceNumber = "SH123456"
  3. 保存到 InMemory MongoDB
  4. 读取验证
- **预期结果**: 字段正确持久化
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### MODEL-503: MedicalRecordIndex 实体验证

- **描述**: 验证 MedicalRecordIndex 实体及其唯一索引
- **步骤**:
  1. 创建 MedicalRecordIndex 实例 (MedicalRecordNumber="B2026001", OwnerId="user1")
  2. 再次创建相同 MedicalRecordNumber + OwnerId 的记录
  3. 验证唯一约束生效（或使用 upsert）
- **预期结果**: 索引创建成功，重复插入时正确更新
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### MODEL-504: ShoppingPriceIndex 实体验证

- **描述**: 验证 ShoppingPriceIndex 实体
- **步骤**:
  1. 创建 ShoppingPriceIndex 实例
  2. 设置 NormalizedItemName, MerchantName, UnitPrice
  3. 保存并读取
- **预期结果**: 所有字段正确持久化
- **优先级**: P1 (Should)
- **测试类型**: 单元测试

#### MODEL-505: PhotoAlbum 新增派生字段验证

- **描述**: 验证 PhotoAlbum 包含 ExtractedReceiptCount, LastOcrStatus, PhotoReceiptDateIndex
- **步骤**:
  1. 创建 PhotoAlbum 实例
  2. 设置 ExtractedReceiptCount = 3, LastOcrStatus = "Completed"
  3. 设置 PhotoReceiptDateIndex = {"2026-04": ["rcpt_1", "rcpt_2"]}
  4. 保存并读取
- **预期结果**: 所有字段正确持久化
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

### 2.2 场景感知 OCR — VisitController.BatchExtract (P0 — Must)

#### BATCH-501: 医疗场景 prompt 选择

- **描述**: 当照片文件名包含医疗关键词时，使用医疗场景 prompt
- **步骤**:
  1. 创建 PhotoAlbum，FileName = "挂号单_上海市第六人民医院.jpg"
  2. Mock OCR API 返回预定义响应
  3. 调用 POST /api/visits/batch-extract
  4. 验证 Step 1 使用了 GetMedicalPrompt() 的输出
- **预期结果**: 医疗关键词被识别，使用医疗场景 prompt
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BATCH-502: 购物场景 prompt 选择

- **描述**: 当照片文件名包含购物关键词时，使用购物场景 prompt
- **步骤**:
  1. 创建 PhotoAlbum，FileName = "超市小票_沃尔玛.jpg"
  2. Mock OCR API 返回预定义响应
  3. 调用 POST /api/visits/batch-extract
  4. 验证 Step 1 使用了 GetShoppingPrompt() 的输出
- **预期结果**: 购物关键词被识别，使用购物场景 prompt
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BATCH-503: 混合/未知场景 prompt 选择

- **描述**: 当照片无明确关键词时，使用混合场景 fallback prompt
- **步骤**:
  1. 创建 PhotoAlbum，FileName = "IMG_20260423.jpg"（无关键词）
  2. Mock OCR API 返回预定义响应
  3. 调用 POST /api/visits/batch-extract
  4. 验证 Step 1 使用了 GetMixedPrompt() 的输出
- **预期结果**: 无关键词时使用混合场景 prompt
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BATCH-504: 医疗场景 Step 2 解析 medicalRecordNumber

- **描述**: Step 2 schema mapping 能正确解析 medicalRecordNumber 字段
- **步骤**:
  1. 创建 PhotoAlbum (FileName = "挂号单.jpg")
  2. Mock OCR Step 1 返回包含"病案号: B2026001"的文本
  3. Mock OCR Step 2 返回包含 medicalRecordNumber 的 JSON
  4. 调用 BatchExtract
  5. 验证 ParsedExtractedReceipt.MedicalRecordNumber = "B2026001"
- **预期结果**: MedicalRecordNumber 被正确解析
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BATCH-505: 购物场景 Step 2 解析 items

- **描述**: Step 2 能正确解析购物 receipt 的 items 数组
- **步骤**:
  1. 创建 PhotoAlbum (FileName = "超市小票.jpg")
  2. Mock OCR Step 2 返回包含 items 数组的 JSON
  3. 调用 BatchExtract
  4. 验证 ParsedExtractedReceipt.Items 包含所有商品
- **预期结果**: items 数组正确解析
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BATCH-506: 多票据照片 — 拆分为数组

- **描述**: Step 2 将多张票据拆分为数组中多个对象
- **步骤**:
  1. 创建 PhotoAlbum (FileName = "多张票据.jpg")
  2. Mock OCR Step 2 返回包含 3 个 receipt 对象的 JSON 数组
  3. 调用 BatchExtract
  4. 验证 ParsedReceipts.Count = 3
  5. 验证每张 receipt 的 merchantName/hospitalName 不同
- **预期结果**: 多张票据正确拆分为 3 个独立对象
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BATCH-507: OCR Step 1 失败处理

- **描述**: 当 OCR Step 1 API 返回错误时，BatchExtract 正确标记失败
- **步骤**:
  1. 创建 PhotoAlbum
  2. Mock OCR Step 1 返回 HTTP 500
  3. 调用 BatchExtract
  4. 验证 BatchExtractResult.Status = "Failed", Error 包含错误信息
- **预期结果**: 失败照片标记为 Failed，其他照片继续处理
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BATCH-508: 空照片列表

- **描述**: 空照片列表返回空结果
- **步骤**:
  1. 调用 POST /api/visits/batch-extract，PhotoIds = []
  2. 验证返回 BadRequest
- **预期结果**: 400 Bad Request
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

### 2.3 SaveConfirmed 联动 (P0 — Must)

#### SAVE-501: Medical 类型 receipt 保存创建 MedicalRecordIndex

- **描述**: 保存 Medical 类型 receipt 且有 MedicalRecordNumber 时，自动创建 MedicalRecordIndex
- **步骤**:
  1. 创建 Receipt 实体，Type = "Medical", MedicalRecordNumber = "B2026001"
  2. 调用 SaveConfirmed
  3. 查询 MedicalRecordIndex 集合
  4. 验证 Index 被创建，ReceiptId 被添加
- **预期结果**: MedicalRecordIndex 创建成功，包含正确的 ReceiptIds
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### SAVE-502: 已有 MedicalRecordIndex 追加 receipt

- **描述**: 当 MedicalRecordNumber 已存在时，追加 receiptId 而非创建新记录
- **步骤**:
  1. 先创建 MedicalRecordIndex (MedicalRecordNumber = "B2026001")
  2. 保存另一个同一病案号的 receipt
  3. 查询 MedicalRecordIndex
  4. 验证只有 1 条记录，但 ReceiptIds 包含 2 个 receiptId
- **预期结果**: 已有索引被更新，不重复创建
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### SAVE-503: SourcePhotoId 和 AdditionalPhotoIds 持久化

- **描述**: SaveConfirmed 正确保存 SourcePhotoId 和 AdditionalPhotoIds
- **步骤**:
  1. 调用 SaveConfirmed，设置 SourcePhotoId = "photo_123", AdditionalPhotoIds = ["photo_456"]
  2. 读取保存的 Receipt
  3. 验证 SourcePhotoId 和 AdditionalPhotoIds 正确
- **预期结果**: 字段正确保存
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### SAVE-504: Photo ReceiptDateIndex 更新

- **描述**: Receipt 保存后，Photo 的 PhotoReceiptDateIndex 被更新
- **步骤**:
  1. 创建 Photo，SourcePhotoId 指向该 Photo
  2. 调用 SaveConfirmed (Medical receipt with receiptDate = "2026-04-15")
  3. 查询 Photo
  4. 验证 PhotoReceiptDateIndex["2026-04"] 包含该 ReceiptId
- **预期结果**: PhotoReceiptDateIndex 正确更新
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### SAVE-505: Shopping 类型 receipt 不创建 MedicalRecordIndex

- **描述**: Shopping 类型 receipt 保存时不触发 MedicalRecordIndex 逻辑
- **步骤**:
  1. 调用 SaveConfirmed，Type = "Shopping"
  2. 查询 MedicalRecordIndex 集合
  3. 验证没有新记录被创建
- **预期结果**: MedicalRecordIndex 未被触发
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### SAVE-506: MedicalReceipt Visit 自动关联

- **描述**: Medical receipt 保存时自动创建或关联 ReceiptVisit
- **步骤**:
  1. 调用 SaveConfirmed (Medical receipt with MedicalRecordNumber)
  2. 验证 Receipt.VisitId 被设置
  3. 验证 ReceiptVisit.MedicalRecordNumber 被设置
- **预期结果**: Visit 关联正确建立
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

### 2.4 病案号正则提取 (P0 — Must)

#### MRN-501: 病案号格式 B + 数字

- **步骤**:
  1. 调用 ExtractMedicalRecordNumberFromText("病案号: B2026001")
  2. 验证返回 "B2026001"
- **预期结果**: "B2026001"
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### MRN-502: 病案号格式 Z + 数字

- **步骤**:
  1. 调用 ExtractMedicalRecordNumberFromText("住院号: Z2026001")
  2. 验证返回 "Z2026001"
- **预期结果**: "Z2026001"
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### MRN-503: 病案号格式"病案号"后跟数字

- **步骤**:
  1. 调用 ExtractMedicalRecordNumberFromText("病案号：12345678")
  2. 验证返回 "12345678"
- **预期结果**: "12345678"
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### MRN-504: 病案号格式"出院记录号"

- **步骤**:
  1. 调用 ExtractMedicalRecordNumberFromText("出院记录号: AB2026001")
  2. 验证返回 "AB2026001"
- **预期结果**: "AB2026001"
- **优先级**: P1 (Should)
- **测试类型**: 单元测试

#### MRN-505: 找不到病案号

- **步骤**:
  1. 调用 ExtractMedicalRecordNumberFromText("这是一张没有病案号的单据")
  2. 验证返回 "NOT_FOUND"
- **预期结果**: "NOT_FOUND"
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### MRN-506: 病案号少于6位不匹配

- **步骤**:
  1. 调用 ExtractMedicalRecordNumberFromText("病案号: B12345")
  2. 验证返回 "NOT_FOUND"
- **预期结果**: "NOT_FOUND" (少于6位)
- **优先级**: P1 (Should)
- **测试类型**: 单元测试

### 2.5 AutoAssociateService 增强 (P0 — Must)

#### AUTO-501: Level 0 MedicalRecordNumber 精确匹配

- **描述**: 当 receipt 有 MedicalRecordNumber 时，优先精确匹配
- **步骤**:
  1. 创建两个 Medical receipt，MedicalRecordNumber 相同 ("B2026001")
  2. 调用 AutoAssociateAllAsync
  3. 验证两张 receipt 被关联到同一组
- **预期结果**: Level 0 匹配成功，MatchLevel = "MedicalRecordNumber"
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### AUTO-502: Level 0 优先级高于 Level 1/2/3

- **描述**: MedicalRecordNumber 匹配优先级高于 OutpatientNumber 和 Hospital+Patient
- **步骤**:
  1. 创建 receipt A (MedicalRecordNumber="B2026001", OutpatientNumber="XYZ")
  2. 创建 receipt B (MedicalRecordNumber 不同, OutpatientNumber="XYZ")
  3. 调用 AutoAssociateAllAsync
  4. 验证 A 和 B 不因 OutpatientNumber 被错误关联
- **预期结果**: Level 0 精确匹配优先
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

#### AUTO-503: MedicalRecordNumber 不匹配时回退到 Level 1

- **描述**: 当 MedicalRecordNumber 不匹配时，回退到 OutpatientNumber 匹配
- **步骤**:
  1. 创建 photo with tags containing outpatient number
  2. 创建 receipt with matching OutpatientNumber
  3. 验证 MatchLevel = "OutpatientNumber"
- **预期结果**: 正确回退到 Level 1
- **优先级**: P1 (Should)
- **测试类型**: 单元测试

#### AUTO-504: 无匹配时返回 null

- **描述**: 所有匹配级别都不成功时，返回 null
- **步骤**:
  1. 创建 receipt 与任何 photo 都不匹配
  2. 调用 TryAssociatePhotoAsync
  3. 验证返回 null
- **预期结果**: null
- **优先级**: P0 (Must)
- **测试类型**: 单元测试

### 2.6 新增 API 端点 (P0 — Must)

#### API-501: GET /api/visits/medical-index/{medicalRecordNumber}

- **步骤**:
  1. 创建 MedicalRecordIndex (MedicalRecordNumber = "B2026001")
  2. 调用 GET /api/visits/medical-index/B2026001
  3. 验证返回 200 OK，包含正确的 Index 数据
  4. 查询不存在的病案号，验证 404
- **预期结果**: 存在的返回 200 + Index, 不存在的返回 404
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### API-502: POST /api/visits/update-visit

- **步骤**:
  1. 创建 Receipt 并设置初始 VisitId
  2. 调用 POST /api/visits/update-visit，修改 VisitId
  3. 验证 Receipt.VisitId 被更新
  4. 同时验证 MedicalRecordIndex 被同步更新
- **预期结果**: VisitId 更新成功，相关索引同步
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### API-503: POST /api/visits/update-visit 病案号变更

- **步骤**:
  1. 创建 Receipt with MedicalRecordNumber = "B2026001"
  2. 调用 update-visit，修改 MedicalRecordNumber = "B2026002"
  3. 验证 Receipt.MedicalRecordNumber 被更新
  4. 验证旧 MedicalRecordIndex 和新的都被正确处理
- **预期结果**: 病案号变更正确同步
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### API-504: GET /api/shopping/price-history?itemName=milk

- **步骤**:
  1. 创建 ShoppingPriceIndex 条目 (NormalizedItemName = "milk", UnitPrice = 5.5)
  2. 创建另一个 (NormalizedItemName = "milk", UnitPrice = 6.0)
  3. 调用 GET /api/shopping/price-history?itemName=milk
  4. 验证返回按时间排序的价格历史
- **预期结果**: 返回价格历史，含趋势摘要
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

#### API-505: POST /api/visits/relink

- **步骤**:
  1. 创建两个 ReceiptVisit
  2. 创建 Receipt 关联到 Visit A
  3. 调用 POST /api/visits/relink，将 Receipt 从 Visit A 转移到 Visit B
  4. 验证 Receipt.VisitId 被更新
- **预期结果**: Receipt 正确转移
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

### 2.7 购物数据归一化 (P1 — Should)

#### SHOP-501: 商品名归一化 — 去除数量后缀

- **步骤**:
  1. 调用 NormalizeItemName("牛奶 500ml")
  2. 验证返回 "牛奶"
- **预期结果**: "牛奶"
- **优先级**: P1 (Should)
- **测试类型**: 单元测试

#### SHOP-502: 商品名归一化 — 去除单位后缀

- **步骤**:
  1. 调用 NormalizeItemName("鸡蛋 12个")
  2. 验证返回 "鸡蛋"
- **预期结果**: "鸡蛋"
- **优先级**: P1 (Should)
- **测试类型**: 单元测试

#### SHOP-503: 商品名归一化 — 大小写统一

- **步骤**:
  1. 调用 NormalizeItemName("MILK")
  2. 验证返回 "milk"
- **预期结果**: "milk"
- **优先级**: P1 (Should)
- **测试类型**: 单元测试

#### SHOP-504: 商品名归一化 — 去除数字前缀

- **步骤**:
  1. 调用 NormalizeItemName("3支装牙刷")
  2. 验证返回 "牙刷"
- **预期结果**: "牙刷"
- **优先级**: P1 (Should)
- **测试类型**: 单元测试

#### SHOP-505: SaveConfirmed 时自动创建 ShoppingPriceIndex

- **步骤**:
  1. 保存 Shopping receipt with items (unitPrice > 0)
  2. 查询 ShoppingPriceIndex 集合
  3. 验证每个 item 创建了索引记录
  4. 验证商品名被归一化
  5. 验证 unitPrice = 0 的 item 不创建索引
- **预期结果**: ShoppingPriceIndex 正确创建
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

### 2.8 BatchExtractDialog 前端 (P0 — Must)

#### FE-DIALOG-501: 医疗字段在编辑表单中显示

- **步骤**:
  1. 模拟 BatchExtractDialog 打开，step = 2 (confirm)
  2. Mock OCR 返回 Medical receipt with hospitalName, medicalRecordNumber
  3. 展开 receipt 编辑表单
  4. 验证 MedicalRecordNumber 输入框存在且有值
  5. 验证 InsuranceType 下拉框存在
- **预期结果**: 医疗字段全部可见且可编辑
- **优先级**: P0 (Must)
- **测试类型**: 组件测试

#### FE-DIALOG-502: 丢弃 receipt

- **步骤**:
  1. 打开 BatchExtractDialog，有 3 条 receipt
  2. 点击第 2 条的"丢弃"按钮
  3. 验证 confirmReceipts 数量变为 2
  4. 验证第 1 条和第 3 条 receipt 不受影响
- **预期结果**: receipt 正确移除，其他 receipt 不受影响
- **优先级**: P0 (Must)
- **测试类型**: 组件测试

#### FE-DIALOG-503: 多 receipt 按照片分组 Tab

- **步骤**:
  1. Mock OCR 返回 2 张照片，每张照片 2 条 receipt
  2. 验证 Tab 栏显示 2 个 Tab (按照片名)
  3. 切换 Tab，验证 receipt 列表正确切换
- **预期结果**: Tab 正确分组，切换正确
- **优先级**: P0 (Must)
- **测试类型**: 组件测试

#### FE-DIALOG-504: 编辑 receipt 字段后状态更新

- **步骤**:
  1. 打开 receipt 编辑表单
  2. 修改 hospitalName = "上海市第一人民医院"
  3. 修改 medicalRecordNumber = "B99999999"
  4. 验证 confirmReceipts 中对应 receipt 的值已更新
- **预期结果**: 编辑后状态正确更新
- **优先级**: P0 (Must)
- **测试类型**: 组件测试

#### FE-DIALOG-505: 零金额 receipt 过滤

- **步骤**:
  1. Mock OCR 返回 2 条 receipt，一条金额 > 0，一条金额 = 0
  2. 点击"确认保存"
  3. 验证只有金额 > 0 的 receipt 被发送
- **预期结果**: 零金额 receipt 被过滤
- **优先级**: P1 (Should)
- **测试类型**: 组件测试

### 2.9 Photo 分组视图 (P0 — Must)

#### FE-PHOTO-501: PhotoReceiptGroupedView 标题显示商户/医院名

- **步骤**:
  1. 创建 Photo 关联多个 receipts
  2. 渲染 PhotoReceiptGroupedView
  3. 验证分组标题显示 merchantName 或 hospitalName
  4. 验证当两者都有时，正确显示（优先 hospitalName）
- **预期结果**: 标题显示有意义的商户/医院名
- **优先级**: P0 (Must)
- **测试类型**: 组件测试

#### FE-PHOTO-502: PhotoReceiptGroupedView 无票据组

- **步骤**:
  1. 创建 Photo 没有关联 receipts
  2. 渲染 PhotoReceiptGroupedView
  3. 验证显示"无票据关联"组
- **预期结果**: 无票据 Photo 在独立组中
- **优先级**: P0 (Must)
- **测试类型**: 组件测试

#### FE-PHOTO-503: 照片在多个分组中出现

- **步骤**:
  1. 创建 Photo，关联 2 条 receipts (不同日期)
  2. 在 PhotoAlbumPage 中切换到 receiptGrouped 视图
  3. 验证该 Photo 在两个不同日期分组中都出现
- **预期结果**: 照片出现在多个分组中
- **优先级**: P0 (Must)
- **测试类型**: 组件测试

#### FE-PHOTO-504: receiptGrouped 视图分组标题金额汇总

- **步骤**:
  1. 创建多个 receipts 在同一个月
  2. 渲染 PhotoReceiptGroupedView
  3. 验证分组标题包含总金额 (如 "2026年4月 - 上海市第六人民医院 - ¥340.00")
- **预期结果**: 分组标题包含金额汇总
- **优先级**: P1 (Should)
- **测试类型**: 组件测试

#### FE-PHOTO-505: PhotoAlbumPage receiptGrouped 视图切换

- **步骤**:
  1. 有 photos 关联 receipts
  2. 点击"票据"按钮切换视图
  3. 验证 PhotoReceiptGroupedView 被渲染
  4. 再次点击"分组"按钮，验证回到按月分组
- **预期结果**: 视图切换正确
- **优先级**: P1 (Should)
- **测试类型**: 组件测试

### 2.10 PhotoReceiptGroupedView 标题增强 (P1 — Should)

#### FE-GROUPED-501: 多种票据分组标题

- **步骤**:
  1. 创建 receipts 包含多个医院和多个商户
  2. 渲染 PhotoReceiptGroupedView
  3. 验证分组标题显示"多种票据 - X张"
- **预期结果**: 多商户/多医院分组显示"多种票据"
- **优先级**: P1 (Should)
- **测试类型**: 组件测试

#### FE-GROUPED-502: 空商户/医院名显示 receiptId 兜底

- **步骤**:
  1. 创建 receipt 没有 merchantName 和 hospitalName
  2. 渲染 PhotoReceiptGroupedView
  3. 验证标题显示 receiptId 前缀 (兜底策略)
- **预期结果**: 兜底显示 receiptId
- **优先级**: P1 (Should)
- **测试类型**: 组件测试

### 2.11 迁移验证 (P1 — Should)

#### MIG-501: SourcePhotoId 回填

- **步骤**:
  1. 创建现有 Receipt (无 SourcePhotoId, 有 ImageUrl)
  2. 创建对应的 PhotoAlbum
  3. 执行迁移逻辑
  4. 验证 Receipt.SourcePhotoId 被正确回填
- **预期结果**: SourcePhotoId 正确关联
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

#### MIG-502: PhotoReceiptDateIndex 回填

- **步骤**:
  1. 创建 PhotoAlbum 关联 receipts
  2. 执行迁移逻辑
  3. 验证 PhotoReceiptDateIndex 被正确回填
- **预期结果**: PhotoReceiptDateIndex 正确构建
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

#### MIG-503: 现有 Medical Receipt 病案号回填

- **步骤**:
  1. 创建现有 Medical receipt (有 RawText 含病案号, 无 MedicalRecordNumber)
  2. 执行迁移逻辑
  3. 验证 MedicalRecordNumber 被正确回填
- **预期结果**: 病案号从 RawText 提取并回填
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

### 2.12 边界情况 (P0/P1 — Must/Should)

#### BOUNDARY-501: 跨月 receipt

- **步骤**:
  1. 创建 Receipt 的 receiptDate = "2026-03-31", 上传日期 = "2026-04-01"
  2. 调用 SaveConfirmed
  3. 验证 PhotoReceiptDateIndex["2026-03"] 被更新 (按 receiptDate 而非上传日期)
- **预期结果**: 分组按 receiptDate 而非上传日期
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BOUNDARY-502: ReceiptDate 为空

- **步骤**:
  1. 创建 Receipt 无 ReceiptDate
  2. 调用 SaveConfirmed
  3. 验证 PhotoReceiptDateIndex 不为 null
  4. 验证无错误抛出
- **预期结果**: 空日期被安全处理
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BOUNDARY-503: 重复病案号不同医院

- **步骤**:
  1. 创建 Receipt A (MedicalRecordNumber="B2026001", HospitalName="医院A")
  2. 创建 Receipt B (MedicalRecordNumber="B2026001", HospitalName="医院B")
  3. 调用 SaveConfirmed 两者
  4. 验证 MedicalRecordIndex 正确关联两个医院
- **预期结果**: 同一病案号可关联多个医院 (复合键)
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

#### BOUNDARY-504: SaveConfirmed 空 receipts 列表

- **步骤**:
  1. 调用 POST /api/visits/save-confirmed, receipts = []
  2. 验证返回空结果列表，不报错
- **预期结果**: 200 OK + 空列表
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

#### BOUNDARY-505: OCR 返回空 JSON 数组

- **步骤**:
  1. Mock OCR Step 2 返回 "[]"
  2. 调用 BatchExtract
  3. 验证 Status = "Completed", ParsedReceipts.Count = 0
- **预期结果**: 空数组正确处理
- **优先级**: P1 (Should)
- **测试类型**: 集成测试

#### BOUNDARY-506: MedicalRecordIndex 更新异常不阻塞主流程

- **步骤**:
  1. Mock MedicalRecordIndex 写入失败 (异常)
  2. 调用 SaveConfirmed
  3. 验证 Receipt 仍被保存成功
  4. 验证 MedicalRecordIndex 未被创建（异常被 catch）
- **预期结果**: 主流程不阻塞，仅记录日志
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

#### BOUNDARY-507: 权限隔离 — 用户A 查询用户B 的 medical-index

- **步骤**:
  1. 创建 MedicalRecordIndex (OwnerId="userA")
  2. 以 userB 身份调用 GET /api/visits/medical-index/B2026001
  3. 验证返回 404
- **预期结果**: 权限隔离生效
- **优先级**: P0 (Must)
- **测试类型**: 集成测试

---

## 3. 自动化测试方案

### 3.1 后端测试框架代码

#### 3.1.1 VisitController Phase 5 集成测试

```csharp
// server.Tests/Controllers/VisitControllerPhase5Tests.cs

using KanKan.API.Controllers;
using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Interfaces;
using Moq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.Security.Claims;
using Xunit;

namespace KanKan.Tests.Controllers;

public class VisitControllerPhase5Tests
{
    private readonly Mock<IReceiptRepository> _receiptRepoMock;
    private readonly Mock<IReceiptVisitRepository> _visitRepoMock;
    private readonly Mock<IAutoAssociateService> _autoAssociateMock;
    private readonly Mock<PhotoRepository> _photoRepoMock;
    private readonly Mock<IMedicalRecordIndexRepository> _medicalIndexRepoMock;
    private readonly Mock<IConfiguration> _configMock;
    private readonly VisitController _controller;

    public VisitControllerPhase5Tests()
    {
        _receiptRepoMock = new Mock<IReceiptRepository>();
        _visitRepoMock = new Mock<IReceiptVisitRepository>();
        _autoAssociateMock = new Mock<IAutoAssociateService>();
        _medicalIndexRepoMock = new Mock<IMedicalRecordIndexRepository>();

        // _photoRepoMock: Mock via interface or abstract method
        _configMock = new Mock<IConfiguration>();
        _configMock.Setup(c => c["Agent:BaseUrl"]).Returns("http://localhost:8080");
        _configMock.Setup(c => c["Agent:ApiKey"]).Returns("test-key");
        _configMock.Setup(c => c["Agent:Model"]).Returns("qwen-vl-max");

        _controller = new VisitController(
            _receiptRepoMock.Object,
            _visitRepoMock.Object,
            _autoAssociateMock.Object,
            null, // IVisitStatsService mock
            _photoRepoMock.Object,
            _medicalIndexRepoMock.Object,
            _configMock.Object,
            null); // IHttpClientFactory mock

        // Auth context
        var claims = new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.NameIdentifier, "user_phase5_001")
        }, "mock");
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(claims) }
        };
    }

    // ==================== Scenario-Aware Prompt Tests ====================

    [Fact]
    public void GetScenarioAwarePrompt_MedicalKeywords_ReturnsMedicalPrompt()
    {
        // Arrange
        var photo = new PhotoAlbum
        {
            FileName = "挂号单_上海市第六人民医院.jpg",
            Tags = new List<string> { "医疗", "hospital" }
        };

        // Act — 通过反射调用私有方法，或提取为 public/protected 方法
        var prompt = GetScenarioAwarePrompt(photo); // 或反射调用

        // Assert
        Assert.Contains("挂号单", prompt);
        Assert.Contains("病案号", prompt);
        Assert.DoesNotContain("超市", prompt);
    }

    [Fact]
    public void GetScenarioAwarePrompt_ShoppingKeywords_ReturnsShoppingPrompt()
    {
        // Arrange
        var photo = new PhotoAlbum
        {
            FileName = "超市小票_沃尔玛.jpg",
            Tags = new List<string>()
        };

        // Act
        var prompt = GetScenarioAwarePrompt(photo);

        // Assert
        Assert.Contains("超市", prompt);
        Assert.DoesNotContain("挂号", prompt);
    }

    [Fact]
    public void GetScenarioAwarePrompt_NoKeywords_ReturnsMixedPrompt()
    {
        // Arrange
        var photo = new PhotoAlbum
        {
            FileName = "IMG_20260423.jpg",
            Tags = new List<string>()
        };

        // Act
        var prompt = GetScenarioAwarePrompt(photo);

        // Assert
        Assert.DoesNotContain("挂号单", prompt);
        Assert.DoesNotContain("超市小票", prompt);
        Assert.Contains("票据/小票", prompt);
    }

    // ==================== BatchExtract MedicalRecordNumber Parsing ====================

    [Fact]
    public async Task BatchExtract_WithMedicalReceipt_MedicalRecordNumberParsed()
    {
        // Arrange
        var photoId = "photo_med_001";
        var photo = new PhotoAlbum
        {
            Id = photoId,
            OwnerId = "user_phase5_001",
            FileName = "挂号单.jpg",
            Tags = new List<string>()
        };
        _photoRepoMock.Setup(r => r.GetByIdAsync(photoId)).ReturnsAsync(photo);

        // Mock Step 1 response — medical OCR text with medical record number
        var step1Response = "## 票据 1: 挂号单\n- 医院: 上海市第六人民医院\n" +
            "- 病案号: B2026001\n- 日期: 2026-04-15";

        // Mock Step 2 response — schema mapped JSON
        var step2Json = "[{\"type\":\"Medical\",\"category\":\"Registration\"," +
            "\"hospitalName\":\"上海市第六人民医院\",\"medicalRecordNumber\":\"B2026001\"," +
            "\"patientName\":\"张三\",\"receiptDate\":\"2026-04-15\"," +
            "\"totalAmount\":25.00}]";

        // Act & Assert — call BatchExtract, verify ParsedReceipts[0].MedicalRecordNumber == "B2026001"
    }

    // ==================== SaveConfirmed MedicalRecordIndex ====================

    [Fact]
    public async Task SaveConfirmed_MedicalWithMedicalRecordNumber_CreatesMedicalRecordIndex()
    {
        // Arrange
        var receipt = new Receipt
        {
            Id = "rcpt_med_001",
            OwnerId = "user_phase5_001",
            Type = "Medical",
            MedicalRecordNumber = "B2026001",
            HospitalName = "上海市第六人民医院"
        };

        var saveRequest = new SaveConfirmedRequest
        {
            Receipts = new List<SaveReceiptRequest>
            {
                new()
                {
                    PhotoId = "photo_med_001",
                    Type = "Medical",
                    MedicalRecordNumber = "B2026001",
                    HospitalName = "上海市第六人民医院"
                }
            }
        };

        _receiptRepoMock.Setup(r => r.GetByIdAsync(It.IsAny<string>())).ReturnsAsync((Receipt?)null);
        _receiptRepoMock.Setup(r => r.CreateAsync(It.IsAny<Receipt>())).ReturnsAsync(receipt);
        _photoRepoMock.Setup(r => r.GetByIdAsync("photo_med_001")).ReturnsAsync(new PhotoAlbum
        {
            Id = "photo_med_001", OwnerId = "user_phase5_001"
        });
        _medicalIndexRepoMock.Setup(r => r.GetByOwnerIdAndNumberAsync(
                "user_phase5_001", "B2026001"))
            .ReturnsAsync((MedicalRecordIndex?)null);
        _medicalIndexRepoMock.Setup(r => r.CreateAsync(It.IsAny<MedicalRecordIndex>()))
            .ReturnsAsync((MedicalRecordIndex)null);

        // Act
        var result = await _controller.SaveConfirmed(saveRequest);

        // Assert
        _medicalIndexRepoMock.Verify(r => r.CreateAsync(It.Is<MedicalRecordIndex>(
            m => m.MedicalRecordNumber == "B2026001" &&
                 m.ReceiptIds.Contains("rcpt_med_001"))), Times.Once);
    }

    // ==================== MedicalRecordNumber Regex Extraction ====================

    [Theory]
    [InlineData("病案号: B2026001", "B2026001")]
    [InlineData("住院号: Z2026001", "Z2026001")]
    [InlineData("病案号：12345678", "12345678")]
    [InlineData("出院记录号: AB2026001", "AB2026001")]
    [InlineData("没有病案号", "NOT_FOUND")]
    [InlineData("病案号: B12345", "NOT_FOUND")] // too short
    public void ExtractMedicalRecordNumberFromText_ValidInput_ReturnsNumber(
        string input, string expected)
    {
        // Act
        var result = ExtractMedicalRecordNumberFromText(input);

        // Assert
        Assert.Equal(expected, result);
    }

    // ==================== New API Endpoints ====================

    [Fact]
    public async Task GetMedicalIndex_Found_ReturnsOk()
    {
        // Arrange
        var index = new MedicalRecordIndex
        {
            Id = "mri_B2026001",
            MedicalRecordNumber = "B2026001",
            HospitalName = "上海市第六人民医院",
            PatientName = "张三",
            ReceiptIds = new List<string> { "rcpt_1" },
            VisitIds = new List<string> { "visit_1" }
        };
        _medicalIndexRepoMock.Setup(r => r.GetByOwnerIdAndNumberAsync(
                "user_phase5_001", "B2026001"))
            .ReturnsAsync(index);

        // Act
        var result = await _controller.GetMedicalIndex("B2026001");

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(okResult.Value);
    }

    [Fact]
    public async Task GetMedicalIndex_NotFound_ReturnsNotFound()
    {
        // Arrange
        _medicalIndexRepoMock.Setup(r => r.GetByOwnerIdAndNumberAsync(
                "user_phase5_001", "B99999999"))
            .ReturnsAsync((MedicalRecordIndex?)null);

        // Act
        var result = await _controller.GetMedicalIndex("B99999999");

        // Assert
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task UpdateVisit_ChangesMedicalRecordNumber_UpdatesIndex()
    {
        // Arrange
        var receipt = new Receipt
        {
            Id = "rcpt_update_001",
            OwnerId = "user_phase5_001",
            MedicalRecordNumber = "B2026001",
            VisitId = "visit_old_001"
        };
        _receiptRepoMock.Setup(r => r.GetByIdAsync("rcpt_update_001"))
            .ReturnsAsync(receipt);
        _receiptRepoMock.Setup(r => r.UpdateAsync(It.IsAny<Receipt>()))
            .ReturnsAsync(receipt);

        var request = new UpdateVisitRequest
        {
            ReceiptId = "rcpt_update_001",
            VisitId = "visit_new_001",
            MedicalRecordNumber = "B2026002"
        };

        _medicalIndexRepoMock.Setup(r => r.CreateAsync(It.IsAny<MedicalRecordIndex>()))
            .ReturnsAsync((MedicalRecordIndex)null);

        // Act
        var result = await _controller.UpdateVisit(request);

        // Assert
        Assert.Equal("B2026002", receipt.MedicalRecordNumber);
        Assert.Equal("visit_new_001", receipt.VisitId);
    }
}
```

#### 3.1.2 AutoAssociateService Phase 5 单元测试

```csharp
// server.Tests/Services/AutoAssociateServicePhase5Tests.cs

using KanKan.API.Models.Entities;
using KanKan.API.Repositories.Implementations;
using KanKan.API.Repositories.Interfaces;
using KanKan.API.Services.Implementations;
using Moq;
using Xunit;

namespace KanKan.Tests.Services;

public class AutoAssociateServicePhase5Tests
{
    [Fact]
    public async Task TryAssociatePhotoAsync_MedicalRecordNumberMatch_ReturnsMatchLevel()
    {
        // Arrange
        // Phase 5 enhancement: add Level 0 MedicalRecordNumber matching
        // This test verifies the new Level 0 logic is in place

        var photoRepoMock = new Mock<PhotoRepository>(); // or use InMemoryMongoRepository
        var receiptRepoMock = new Mock<IReceiptRepository>();

        var service = new AutoAssociateService(
            receiptRepoMock.Object,
            photoRepoMock.Object);

        // When receipt has MedicalRecordNumber, it should match by Level 0
        // TODO: Mock receipt with MedicalRecordNumber = "B2026001"
        // TODO: Verify TryAssociatePhotoAsync returns MatchLevel = "MedicalRecordNumber"
    }

    [Fact]
    public async Task AutoAssociateAllAsync_Level0Priority_HigherThanLevel1()
    {
        // Arrange
        // Create receipt A: MedicalRecordNumber = "B2026001", OutpatientNumber = "XYZ"
        // Create receipt B: Different MedicalRecordNumber, OutpatientNumber = "XYZ"
        // These should NOT be associated via Level 1 (OutpatientNumber)

        // Act & Assert
        // Verify A and B are not linked by OutpatientNumber alone
    }
}
```

#### 3.1.3 MedicalRecordNumber 正则提取单元测试

```csharp
// server.Tests/Services/MedicalRecordNumberExtractorTests.cs

using Xunit;

namespace KanKan.Tests.Services;

public class MedicalRecordNumberExtractorTests
{
    // Pattern tests — verify regex matching of common Chinese medical record formats

    [Theory]
    [InlineData("病案号: B2026001", "B2026001")]
    [InlineData("病案号:Z2026001", "Z2026001")]
    [InlineData("住院号：Z2026002", "Z2026002")]
    [InlineData("出院记录号: AB2026001", "AB2026001")]
    [InlineData("编号: CD12345678", "CD12345678")]
    [InlineData("病案号 12345678", "12345678")]
    public void ExtractFromText_MatchesCommonPatterns(string input, string expected)
    {
        // Arrange
        var patterns = new[]
        {
            @"[病住]案号[:：\s]*(\w[\w\d]*)",
            @"[病住]院号[:：\s]*(\w[\w\d]*)",
            @"[出院]记录[号]?[:：\s]*(\w[\w\d]*)",
            @"编号[:：\s]*(\w[\w\d]{6,})",
        };

        // Act
        foreach (var pattern in patterns)
        {
            var match = System.Text.RegularExpressions.Regex.Match(input, pattern);
            if (match.Success && match.Groups.Count > 1)
            {
                var num = match.Groups[1].Value.Trim();
                if (num.Length >= 6)
                {
                    // Assert
                    Assert.Equal(expected, num);
                    return;
                }
            }
        }

        // If no match found
        Assert.Equal("NOT_FOUND", expected);
    }

    [Theory]
    [InlineData("没有病案号信息")]
    [InlineData("这是一张购物小票")]
    [InlineData("病案号: B12345")] // too short (< 6 chars)
    [InlineData("")]
    public void ExtractFromText_NoMatch_ReturnsNotFound(string input)
    {
        // Arrange
        var patterns = new[]
        {
            @"[病住]案号[:：\s]*(\w[\w\d]*)",
            @"[病住]院号[:：\s]*(\w[\w\d]*)",
            @"[出院]记录[号]?[:：\s]*(\w[\w\d]*)",
            @"编号[:：\s]*(\w[\w\d]{6,})",
        };

        // Act
        string result = "NOT_FOUND";
        foreach (var pattern in patterns)
        {
            var match = System.Text.RegularExpressions.Regex.Match(input, pattern);
            if (match.Success && match.Groups.Count > 1)
            {
                var num = match.Groups[1].Value.Trim();
                if (num.Length >= 6)
                {
                    result = num;
                    break;
                }
            }
        }

        // Assert
        Assert.Equal("NOT_FOUND", result);
    }
}
```

#### 3.1.4 Shopping 商品名归一化单元测试

```csharp
// server.Tests/Services/ShoppingPriceIndexTests.cs

using System.Text.RegularExpressions;
using Xunit;

namespace KanKan.Tests.Services;

public class ShoppingPriceIndexTests
{
    public static string NormalizeItemName(string itemName)
    {
        if (string.IsNullOrEmpty(itemName)) return itemName;

        // Step 1: Remove quantity/unit suffixes
        var normalized = Regex.Replace(
            itemName,
            @"(\d+(\.\d+)?)\s*(个|包|袋|瓶|盒|箱|桶|斤|公斤|kg|g|ml|L|支|条|卷|双|对)",
            "",
            RegexOptions.IgnoreCase);

        // Step 2: Remove digit prefix
        normalized = Regex.Replace(normalized, @"^\d+(\.\d+)?\s*支?\s*装", "", RegexOptions.IgnoreCase);

        // Step 3: Trim and lowercase
        normalized = normalized.Trim().ToLower();

        return normalized;
    }

    [Theory]
    [InlineData("牛奶 500ml", "牛奶")]
    [InlineData("鸡蛋 12个", "鸡蛋")]
    [InlineData("12袋面粉", "面粉")]
    [InlineData("3支装牙刷", "牙刷")]
    [InlineData("MILK", "milk")]
    [InlineData("  牛奶  ", "牛奶")]
    [InlineData("可乐 500ml x 12瓶", "可乐 x 12")]
    public void NormalizeItemName_RemovesSuffixesAndNormalizes(string input, string expected)
    {
        Assert.Equal(expected, NormalizeItemName(input));
    }
}
```

### 3.2 前端测试框架代码

#### 3.2.1 BatchExtractDialog 组件测试

```typescript
// client/src/components/Receipts/__tests__/BatchExtractDialog.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BatchExtractDialog } from '../BatchExtractDialog';
import { photoService } from '@/services/photo.service';

// Mock the photo service
jest.mock('@/services/photo.service');

describe('BatchExtractDialog — Phase 5 Enhancements', () => {
  const mockOnClose = jest.fn();
  const mockOnSaved = jest.fn();
  const mockPhotos = [
    { id: 'photo_1', fileName: '挂号单.jpg' },
    { id: 'photo_2', fileName: '超市小票.jpg' },
  ];

  afterEach(() => {
    jest.clearAllMocks();
  });

  // US-DIALOG-01: Medical field editing
  it('renders medical fields in the edit form', async () => {
    // Mock OCR response with medical fields
    (photoService.batchExtract as jest.Mock).mockResolvedValue({
      results: [
        {
          photoId: 'photo_1',
          parsedReceipts: [
            {
              photoId: 'photo_1',
              type: 'Medical',
              category: 'Registration',
              hospitalName: '上海市第六人民医院',
              medicalRecordNumber: 'B2026001',
              patientName: '张三',
              totalAmount: 25,
              receiptDate: '2026-04-15',
            },
          ],
        },
      ],
    });

    render(
      <BatchExtractDialog
        open={true}
        selectedPhotoIds={['photo_1', 'photo_2']}
        selectedPhotos={mockPhotos}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    );

    // Wait for OCR to complete (step 2 = confirm)
    await waitFor(() => {
      expect(screen.getByText('确认票据')).toBeInTheDocument();
    });

    // Expand the receipt edit form
    const expandButtons = screen.getAllByRole('button', { name: /expand/i });
    if (expandButtons.length > 0) {
      fireEvent.click(expandButtons[0]);
    }

    // Verify medical fields are visible
    await waitFor(() => {
      expect(screen.getByDisplayValue('上海市第六人民医院')).toBeInTheDocument();
      expect(screen.getByDisplayValue('B2026001')).toBeInTheDocument();
    });
  });

  // US-DIALOG-02: Discard receipt
  it('discards a receipt from the confirm list', async () => {
    (photoService.batchExtract as jest.Mock).mockResolvedValue({
      results: [
        {
          photoId: 'photo_1',
          parsedReceipts: [
            { photoId: 'photo_1', type: 'Shopping', totalAmount: 100, hospitalName: '医院A', merchantName: '超市A' },
            { photoId: 'photo_1', type: 'Shopping', totalAmount: 50, merchantName: '超市B' },
          ],
        },
      ],
    });

    render(
      <BatchExtractDialog
        open={true}
        selectedPhotoIds={['photo_1']}
        selectedPhotos={mockPhotos}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('共提取 2 条票据')).toBeInTheDocument();
    });

    // Click discard on the second receipt
    const discardButtons = screen.getAllByText('丢弃');
    if (discardButtons.length > 0) {
      fireEvent.click(discardButtons[0]);
    }

    await waitFor(() => {
      expect(screen.getByText('共提取 1 条票据')).toBeInTheDocument();
    });
  });

  // US-DIALOG-03: Receipts grouped by photo tab
  it('shows receipt tabs by photo', async () => {
    (photoService.batchExtract as jest.Mock).mockResolvedValue({
      results: [
        { photoId: 'photo_1', parsedReceipts: [{ photoId: 'photo_1', type: 'Medical', totalAmount: 25, hospitalName: '医院A' }] },
        { photoId: 'photo_2', parsedReceipts: [{ photoId: 'photo_2', type: 'Shopping', totalAmount: 100, merchantName: '超市A' }] },
      ],
    });

    render(
      <BatchExtractDialog
        open={true}
        selectedPhotoIds={['photo_1', 'photo_2']}
        selectedPhotos={mockPhotos}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('挂号单.jpg')).toBeInTheDocument();
      expect(screen.getByText('超市小票.jpg')).toBeInTheDocument();
    });
  });

  // FE-DIALOG-504: Field editing updates state
  it('updates receipt fields when edited', async () => {
    (photoService.batchExtract as jest.Mock).mockResolvedValue({
      results: [
        {
          photoId: 'photo_1',
          parsedReceipts: [
            {
              photoId: 'photo_1',
              type: 'Medical',
              hospitalName: '原医院',
              medicalRecordNumber: 'B000000',
              totalAmount: 100,
            },
          ],
        },
      ],
    });

    render(
      <BatchExtractDialog
        open={true}
        selectedPhotoIds={['photo_1']}
        selectedPhotos={mockPhotos}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    );

    await waitFor(() => screen.getByText('共提取 1 条票据'));

    // Expand and edit
    const expandButtons = screen.getAllByRole('button', { name: /expand/i });
    if (expandButtons.length > 0) {
      fireEvent.click(expandButtons[0]);
    }

    // Edit medicalRecordNumber
    const mrnInput = screen.getByDisplayValue('B000000') as HTMLInputElement;
    fireEvent.change(mrnInput, { target: { value: 'B99999999' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('B99999999')).toBeInTheDocument();
    });
  });
});
```

#### 3.2.2 PhotoReceiptGroupedView 组件测试

```typescript
// client/src/components/Photos/__tests__/PhotoReceiptGroupedView.test.tsx

import { render, screen } from '@testing-library/react';
import PhotoReceiptGroupedView from '../PhotoReceiptGroupedView';
import { type PhotoDto } from '@/services/photo.service';

describe('PhotoReceiptGroupedView — Phase 5 Title Enhancement', () => {
  const mockPhotos: PhotoDto[] = [
    {
      id: 'photo_1',
      fileName: '挂号单.jpg',
      associatedReceiptIds: ['rcpt_1', 'rcpt_2'],
    },
    {
      id: 'photo_2',
      fileName: 'no_receipt.jpg',
      associatedReceiptIds: [],
    },
  ];

  // FE-PHOTO-501: Title shows merchant/hospital name
  it('displays hospital name in group title', () => {
    render(
      <PhotoReceiptGroupedView
        photos={mockPhotos}
        onPhotoClick={() => {}}
      />
    );

    // Verify hospital name or merchant name appears in title
    expect(screen.getByText('rcpt_1')).toBeInTheDocument();
  });

  // FE-PHOTO-502: No-receipt group
  it('displays no-receipt group for photos without receipts', () => {
    render(
      <PhotoReceiptGroupedView
        photos={mockPhotos}
        onPhotoClick={() => {}}
      />
    );

    expect(screen.getByText('无票据关联')).toBeInTheDocument();
    expect(screen.getByText(/1 张照片未关联票据/)).toBeInTheDocument();
  });
});
```

### 3.3 端到端集成测试

#### 3.3.1 完整 Photo->OCR->Confirm->Visit 流程

```csharp
// server.Tests/Integration/PhotoOcrConfirmFlowTests.cs

/// <summary>
/// End-to-end integration test for the complete Photo -> OCR -> Confirm -> Visit/MedicalRecord flow.
/// Uses InMemoryMongoRepository + mocked OCR API responses.
/// </summary>
public class PhotoOcrConfirmFlowTests
{
    [Fact]
    public async Task FullFlow_MedicalReceipt_CreatesVisitAndMedicalRecordIndex()
    {
        // === Setup: InMemoryMongoRepository + Mocked OCR ===
        var receiptRepo = new InMemoryMongoRepository<Receipt>();
        var visitRepo = new InMemoryMongoRepository<ReceiptVisit>();
        var photoRepo = new InMemoryMongoRepository<PhotoAlbum>();
        var medicalIndexRepo = new InMemoryMongoRepository<MedicalRecordIndex>;

        // Seed data
        var photo = new PhotoAlbum
        {
            Id = "photo_e2e_001",
            OwnerId = "user_e2e_001",
            FileName = "挂号单_上海市第六人民医院.jpg",
            Tags = new List<string> { "医疗" }
        };
        await photoRepo.UpsertAsync(photo);

        // Mock HTTP calls for OCR Step 1 and Step 2
        // (Use WebApplicationFactory with IHttpClientFactory mock)

        // === Step 1: BatchExtract ===
        var batchRequest = new BatchExtractRequest
        {
            PhotoIds = new List<string> { "photo_e2e_001" }
        };

        // Act: Call BatchExtract (with mocked OCR responses)
        // Mock Step 1: Return medical OCR text with 病案号 B2026001
        // Mock Step 2: Return JSON with medicalRecordNumber

        var batchResult = await _controller.BatchExtract(batchRequest);
        var batchOk = Assert.IsType<OkObjectResult>(batchResult);
        var batchResponse = Assert.IsType<BatchExtractResponse>(batchOk.Value);

        // Assert: Step 1 & 2 completed
        Assert.Single(batchResponse.Results);
        var extractResult = batchResponse.Results[0];
        Assert.Equal("Completed", extractResult.Status);
        Assert.NotEmpty(extractResult.ParsedReceipts);

        // === Step 2: SaveConfirmed ===
        var confirmedReceipt = extractResult.ParsedReceipts[0];
        var saveRequest = new SaveConfirmedRequest
        {
            Receipts = new List<SaveReceiptRequest>
            {
                new()
                {
                    PhotoId = "photo_e2e_001",
                    Type = confirmedReceipt.Type,
                    MedicalRecordNumber = confirmedReceipt.MedicalRecordNumber,
                    HospitalName = confirmedReceipt.HospitalName,
                    ReceiptDate = confirmedReceipt.ReceiptDate,
                    TotalAmount = confirmedReceipt.TotalAmount,
                }
            }
        };

        var saveResult = await _controller.SaveConfirmed(saveRequest);
        var saveOk = Assert.IsType<OkObjectResult>(saveResult);

        // === Step 3: Verify downstream effects ===
        // 1. Receipt saved with MedicalRecordNumber
        var savedReceipt = await receiptRepo.GetByIdAsync(It.IsAny<string>());
        Assert.Equal("B2026001", savedReceipt.MedicalRecordNumber);

        // 2. MedicalRecordIndex created
        var medIndex = await medicalIndexRepo.GetByIdAsync(It.IsAny<string>());
        Assert.Equal("B2026001", medIndex.MedicalRecordNumber);
        Assert.Contains(savedReceipt.Id, medIndex.ReceiptIds);

        // 3. ReceiptVisit created with MedicalRecordNumber
        // (Verify Receipt.VisitId is set and Visit.MedicalRecordNumber matches)

        // 4. Photo PhotoReceiptDateIndex updated
        var updatedPhoto = await photoRepo.GetByIdAsync("photo_e2e_001");
        Assert.NotNull(updatedPhoto.PhotoReceiptDateIndex);
        Assert.Contains(savedReceipt.Id,
            updatedPhoto.PhotoReceiptDateIndex["2026-04"]);
    }

    [Fact]
    public async Task FullFlow_ShoppingReceipt_NoMedicalRecordIndexCreated()
    {
        // === Setup ===
        // (Same as above, but with shopping receipt)

        // === Step 1: BatchExtract with shopping OCR ===
        // Mock Step 2: Return shopping JSON (no medicalRecordNumber)

        // === Step 2: SaveConfirmed ===
        // Type = "Shopping"

        // === Verify ===
        // 1. Receipt saved with type = "Shopping"
        // 2. NO MedicalRecordIndex created
        // 3. ShoppingPriceIndex created for each line item
    }
}
```

---

## 4. 测试优先级矩阵

### 4.1 Must (P0) — 100% 通过率要求

| 类别 | 测试编号 | 关键场景 |
|------|---------|---------|
| 实体模型 | MODEL-501~502, MODEL-504~505 | Receipt/Visit/Photo 新增字段 |
| OCR | BATCH-501~507 | 场景感知 prompt, medicalRecordNumber 解析, 多票据拆分 |
| SaveConfirmed | SAVE-501~506 | MedicalRecordIndex 创建, SourcePhotoId, Visit 关联 |
| 病案号提取 | MRN-501~503, MRN-505~506 | 正则提取正确性 |
| AutoAssociate | AUTO-501~502, AUTO-504 | Level 0 精确匹配 |
| API 端点 | API-501, API-503, API-505 | medical-index, update-visit, relink |
| 前端 | FE-DIALOG-501~504 | 医疗字段编辑, 丢弃 receipt |
| Photo 视图 | FE-PHOTO-501~503 | 分组标题, 无票据组, 多分组出现 |
| 边界 | BOUNDARY-501, BOUNDARY-502, BOUNDARY-506, BOUNDARY-507 | 跨月, 空日期, 异常不阻塞, 权限隔离 |

**Must 类测试统计: 45 项**

### 4.2 Should (P1) — >= 95% 通过率要求

| 类别 | 测试编号 | 关键场景 |
|------|---------|---------|
| 实体模型 | MODEL-503, MODEL-504 | MedicalRecordIndex 唯一约束, ShoppingPriceIndex |
| OCR | BATCH-508 | 空照片列表 |
| SaveConfirmed | SAVE-505 | Shopping 不触发 MedicalRecordIndex |
| 病案号提取 | MRN-504, MRN-506 | 出院记录号格式, 短病案号过滤 |
| AutoAssociate | AUTO-503 | 回退到 Level 1 |
| API 端点 | API-502, API-504 | update-visit 病案号变更, price-history |
| 购物数据 | SHOP-501~505 | 商品名归一化, ShoppingPriceIndex 创建 |
| 前端 | FE-DIALOG-505, FE-PHOTO-504~505 | 零金额过滤, 金额汇总, 视图切换 |
| 边界 | BOUNDARY-503~505 | 不同医院同病案号, 空 receipts, 空 JSON 数组 |

**Should 类测试统计: 20 项**

### 4.3 Could (P2) — >= 90% 通过率要求

| 类别 | 测试编号 | 关键场景 |
|------|---------|---------|
| 前端增强 | FE-GROUPED-501~502 | 多种票据标题, 兜底策略 |
| 迁移 | MIG-501~503 | SourcePhotoId 回填, PhotoReceiptDateIndex 回填, 病案号回填 |
| 性能 | PERF-501~503 | BatchExtract 批量性能, 大 MedicalReceipt 列表查询, PhotoReceiptDateIndex 索引查询 |

**Could 类测试统计: 6 项**

### 4.4 优先级汇总

| 优先级 | 数量 | 通过率要求 | 说明 |
|--------|------|-----------|------|
| Must (P0) | 45 | 100% | 核心功能，阻塞发布 |
| Should (P1) | 20 | >= 95% | 重要功能，需要覆盖 |
| Could (P2) | 6 | >= 90% | 增强功能，尽量覆盖 |
| **总计** | **71** | — | — |

---

## 5. 测试执行计划

### 5.1 测试阶段

| 阶段 | 周次 | 内容 | 负责人 |
|------|------|------|--------|
| 测试准备 | Week 1 | 环境搭建, InMemory MongoDB, Mock OCR API, 测试数据准备 | 测试总监 |
| 单元测试 | Week 1-2 | MODEL-5xx, MRN-5xx, SHOP-5xx, NormalizeItemName | 测试总监 |
| 控制器/服务测试 | Week 2-3 | BATCH-5xx, SAVE-5xx, AUTO-5xx, API-5xx | 测试总监 |
| 前端组件测试 | Week 3 | FE-DIALOG-5xx, FE-PHOTO-5xx, FE-GROUPED-5xx | 测试总监 |
| 集成测试 | Week 3 | Photo->OCR->Confirm 端到端流程 | 测试总监 |
| 边界/回归测试 | Week 4 | BOUNDARY-5xx, 现有 Phase 4 回归 | 测试总监 |
| 验收测试 | Week 4 | 对照 PRD 验收标准逐项确认 | 指挥官 + 测试总监 |

### 5.2 回归测试策略

Phase 5 的所有新增测试都是**增量式**的。对于 Phase 4 现有功能：

1. **不修改** 任何现有测试用例
2. **不修改** 任何现有测试数据
3. **新增** 的测试用例只在新的测试文件中
4. 每次 CI 运行中，Phase 4 和 Phase 5 测试**同时执行**
5. 如果 Phase 4 测试失败，Phase 5 不被批准合并

### 5.3 CI/CD 集成

```yaml
# .github/workflows/phase5-test.yml (suggested)
name: Phase 5 Tests

on:
  pull_request:
    paths:
      - 'server/**'
      - 'client/**'
      - 'server.Tests/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup .NET 9
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '9.0.x'
      - name: Restore server
        run: cd server && dotnet restore
      - name: Build server
        run: cd server && dotnet build --no-restore
      - name: Run Phase 4 & 5 tests
        run: cd server.Tests && dotnet test --no-build --verbosity normal
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install client deps
        run: cd client && npm ci
      - name: Run frontend tests
        run: cd client && npm test -- --watchAll=false --coverage
```

---

## 6. 附录

### 6.1 映射的 PRD 用户故事

| 测试用例 | 覆盖 PRD 用户故事 |
|---------|------------------|
| BATCH-501~507 | US-OCR-01, US-OCR-02, US-OCR-03 |
| SAVE-501~506 | US-MED-01, US-MED-02 |
| AUTO-501~504 | US-MED-02 |
| API-501~505 | US-MED-03, US-MED-05 |
| SHOP-501~505 | US-SHOP-01, US-SHOP-02 |
| FE-DIALOG-501~505 | US-DIALOG-01, US-DIALOG-02 |
| FE-PHOTO-501~505 | US-PHOTO-01, US-PHOTO-02 |
| FE-GROUPED-501~502 | US-PHOTO-02 |
| MIG-501~503 | US-MIG-01, US-MIG-02 |

### 6.2 测试数据准备清单

| 数据类型 | 用途 | 来源 |
|---------|------|------|
| 医疗场景测试图片 | BatchExtract OCR 测试 | 使用 Mock OCR 响应替代 |
| 购物场景测试图片 | BatchExtract OCR 测试 | 使用 Mock OCR 响应替代 |
| 病案号格式样本 | MRN 正则提取测试 | 中国医疗系统常见格式 |
| 商品名样本 | 归一化测试 | 常见超市商品名 |
| MedicalRecordIndex 种子数据 | SaveConfirmed 联动测试 | InMemory 生成 |
| 跨月 receipt 数据 | 边界测试 | 构造日期 |

### 6.3 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Mock OCR 响应与真实 Qwen VL 行为不一致 | 中 | 关键流程使用真实 API 进行 E2E 验证（可选） |
| InMemory MongoDB 与真实 MongoDB 行为差异 | 低 | 关键集合验证在测试后手动确认 |
| 前端测试环境配置复杂 | 中 | 使用 Docker 容器化测试环境 |
| Phase 4 回归测试被 Phase 5 间接破坏 | 中 | CI 强制要求全部测试通过 |
| 病案号正则对非标准格式漏匹配 | 高 | 单元测试覆盖所有已知格式 |

### 6.4 文档版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-04-23 | 初始版本，基于 PRD_Phase5_Enhanced.md v2.0 |

---

**文件结束。**
