# KanKan — Test Plan: Photo Album & Enhanced OCR

**版本:** 1.0
**日期:** 2026-04-22
**作者:** 测试总监 (Hermes)
**审查:** 指挥官

---

## 1. 模块概述

### 1.1 Photo Album
照片相册模块允许用户上传和管理照片（主要场景：发票/票据凭证照片），支持：
- 单张/批量上传（Base64，最多 20 张）
- 本地文件存储 (`wwwroot/photos/`)
- MongoDB (`photo_albums` 集合) 持久化
- 元数据管理：拍摄日期、GPS 位置、相机型号、分辨率、标签、备注
- 与 Receipt（票据）关联（多对多）
- 日期范围过滤：按上传日期 / 拍摄日期查询
- 网格/分组视图 + 分页 + 灯箱浏览

**技术栈:** .NET 9 + MongoDB, React 18 + TypeScript + MUI

### 1.2 Enhanced OCR
增强 OCR 模块利用视觉语言模型（Qwen VL）从照片中提取票据信息：
- 两步提取：Step1 视觉 OCR（含图片）→ Step2 Schema 映射（纯文本）
- 支持 Shopping 和 Medical 两种票据类型
- Medical 类型支持 HL7 FHIR 资源类型映射
- 批量 OCR 处理（`/visits/batch-extract`）
- 确认保存（`/visits/save-confirmed`）
- 票据去重检查（`POST /receipts/check-duplicate`）
- 自动关联（3 级匹配：门诊号 > 医院+患者 > 医院名）

**技术栈:** .NET 9 + HTTP Client → Qwen VL API, React 18 + TypeScript

---

## 2. 测试策略

| 层级 | 范围 | 框架 | 工具 |
|---|---|---|---|
| **单元测试** | PhotoService, PhotoRepository, ReceiptRepository, PhotoDtosMapper, 数据模型验证 | xUnit + Moq + FluentAssertions | InMemory MongoDB |
| **控制器测试** | PhotoController, ReceiptController 端点 | xUnit + WebApplicationFactory | 内存 MongoDB, 模拟 HTTP Client |
| **组件测试** | React 前端组件 | Jest + React Testing Library | @testing-library/react |
| **集成测试** | 端到端 API 流程 | xUnit + WebApplicationFactory | 内存 MongoDB + 模拟 OCR API |
| **E2E 测试** | 浏览器完整流程 | Playwright | 真实浏览器 |

---

## 3. 测试范围与用例矩阵

### 3.1 Photo Album — 后端

#### 3.1.1 PhotoService

| 用例 ID | 方法 | 描述 | 优先级 |
|---|---|---|---|
| PH-SVC-001 | UploadAsync | 正常上传 Base64 图片 | P0 |
| PH-SVC-002 | UploadAsync | Base64 数据包含 data URI 前缀 | P1 |
| PH-SVC-003 | UploadAsync | Base64 无效数据 → ArgumentException | P0 |
| PH-SVC-004 | UploadAsync | Base64 数据损坏（截断/不合法字符） | P1 |
| PH-SVC-005 | UploadAsync | 自动文件名生成（不提供 FileName 时） | P1 |
| PH-SVC-006 | UploadAsync | 文件写入失败（磁盘空间不足） | P2 |
| PH-SVC-007 | UploadAsync | 文件目录不存在 → 自动创建 | P1 |
| PH-SVC-008 | UploadAsync | 设置可选元数据（CapturedDate, Lat/Lng, CameraModel 等） | P1 |
| PH-SVC-009 | UploadBatchAsync | 批量上传全部成功 | P1 |
| PH-SVC-010 | UploadBatchAsync | 批量上传部分失败（继续处理其余） | P0 |
| PH-SVC-011 | UploadBatchAsync | 批量上传全部失败 | P2 |
| PH-SVC-012 | UploadBatchAsync | 空列表上传 | P2 |
| PH-SVC-013 | GetByIdAsync | 有效 ID + 正确 OwnerId → 返回 Photo | P0 |
| PH-SVC-014 | GetByIdAsync | 有效 ID + 错误 OwnerId → 返回 null（权限隔离） | P0 |
| PH-SVC-015 | GetByIdAsync | 不存在的 ID → 返回 null | P1 |
| PH-SVC-016 | GetAllAsync | 用户有多张照片 → 按 UploadedAt 降序 | P0 |
| PH-SVC-017 | GetAllAsync | 用户无照片 → 空列表 | P1 |
| PH-SVC-018 | GetByDateRangeAsync | 有效日期范围过滤 | P1 |
| PH-SVC-019 | GetByDateRangeAsync | 日期范围无结果 → 空列表 | P2 |
| PH-SVC-020 | GetByDateRangeAsync | 开始日期 > 结束日期 → 空列表 | P2 |
| PH-SVC-021 | GetByReceiptIdAsync | 按 ReceiptId 查找关联照片 | P1 |
| PH-SVC-022 | GetByReceiptIdAsync | 权限隔离：photo.OwnerId != 请求 OwnerId | P0 |
| PH-SVC-023 | UpdateAsync | 更新 Notes 和 Tags | P1 |
| PH-SVC-024 | UpdateAsync | 更新 CapturedDate, Lat/Lng, LocationName | P1 |
| PH-SVC-025 | UpdateAsync | 更新 AssociatedReceiptIds | P1 |
| PH-SVC-026 | UpdateAsync | 不存在的照片 → KeyNotFoundException | P0 |
| PH-SVC-027 | UpdateAsync | 照片存在但 OwnerId 不匹配 → KeyNotFoundException | P0 |
| PH-SVC-028 | UpdateAsync | 只更新部分字段（其余保持不变） | P1 |
| PH-SVC-029 | DeleteAsync | 正常删除 + 文件物理删除 | P0 |
| PH-SVC-030 | DeleteAsync | 文件路径不存在 → 不抛异常 | P1 |
| PH-SVC-031 | DeleteAsync | 文件物理删除失败 → 数据库仍删除 | P2 |
| PH-SVC-032 | DownloadAsync | 通过 FilePath 下载文件 | P0 |
| PH-SVC-033 | DownloadAsync | 通过 Base64Data 下载（回退路径） | P1 |
| PH-SVC-034 | DownloadAsync | 照片不存在 → KeyNotFoundException | P0 |
| PH-SVC-035 | DownloadAsync | 无文件路径且无 Base64Data → InvalidOperationException | P1 |

#### 3.1.2 PhotoRepository

| 用例 ID | 描述 | 优先级 |
|---|---|---|
| PH-REPO-001 | InsertOneAsync → 文档持久化 | P0 |
| PH-REPO-002 | Find by OwnerId → 正确结果 | P0 |
| PH-REPO-003 | Find by OwnerId + DateRange → 正确过滤 | P0 |
| PH-REPO-004 | Find by ReceiptId (Contained) → 正确结果 | P1 |
| PH-REPO-005 | ReplaceOneAsync → 更新验证 | P1 |
| PH-REPO-006 | DeleteOneAsync → 删除验证 | P1 |
| PH-REPO-007 | UpsertAsync → ID 存在时更新，不存在时插入 | P2 |
| PH-REPO-008 | SortByDescending(UploadedAt) → 顺序验证 | P1 |

#### 3.1.3 PhotoController

| 用例 ID | 端点 | 描述 | 优先级 |
|---|---|---|---|
| PH-Ctrl-001 | POST /api/photos | 正常上传 → 201 Created | P0 |
| PH-Ctrl-002 | POST /api/photos | 未认证 → 401 | P0 |
| PH-Ctrl-003 | POST /api/photos/batch | 批量上传 → 200 OK | P1 |
| PH-Ctrl-004 | GET /api/photos | 获取全部 → 200 OK | P0 |
| PH-Ctrl-005 | GET /api/photos/by-upload-date | 按上传日期过滤 → 200 OK | P1 |
| PH-Ctrl-006 | GET /api/photos/by-captured-date | 按拍摄日期过滤 → 200 OK | P1 |
| PH-Ctrl-007 | GET /api/photos/by-receipt/{id} | 按 ReceiptId 查询 → 200 OK | P1 |
| PH-Ctrl-008 | GET /api/photos/{id} | 获取单张 → 200 OK | P0 |
| PH-Ctrl-009 | GET /api/photos/{id} | 不存在 → 404 | P0 |
| PH-Ctrl-010 | PUT /api/photos/{id} | 更新元数据 → 200 OK | P1 |
| PH-Ctrl-011 | DELETE /api/photos/{id} | 删除 → 204 NoContent | P0 |
| PH-Ctrl-012 | GET /api/photos/download/{id} | 下载文件 → 200 OK + 文件内容 | P0 |
| PH-Ctrl-013 | GET /api/photos/download/{id} | 不存在 → 404 | P0 |

---

### 3.2 Enhanced OCR — 后端

#### 3.2.1 ReceiptController Extract

| 用例 ID | 端点 | 描述 | 优先级 |
|---|---|---|---|
| OCR-CTRL-001 | POST /receipts/extract | 正常两步提取 → 200 OK | P0 |
| OCR-CTRL-002 | POST /receipts/extract | ImageUrl 为空 → 400 | P0 |
| OCR-CTRL-003 | POST /receipts/extract | OcrPrompt 为空 → 400 | P0 |
| OCR-CTRL-004 | POST /receipts/extract | MapPrompt 为空 → 400 | P0 |
| OCR-CTRL-005 | POST /receipts/extract | 图片文件不存在 → 400 | P1 |
| OCR-CTRL-006 | POST /receipts/extract | Agent BaseURL 未配置 → 500 | P0 |
| OCR-CTRL-007 | POST /receipts/extract | Step1 OCR 调用失败 → 502 | P0 |
| OCR-CTRL-008 | POST /receipts/extract | Step1 返回空结果 → 502 | P1 |
| OCR-CTRL-009 | POST /receipts/extract | Step2 映射失败 → 502 | P1 |
| OCR-CTRL-010 | POST /receipts/extract | Step1 + Step2 成功 → 返回 step1Raw + step2Raw | P0 |
| OCR-CTRL-011 | POST /receipts/extract | Step1 超时 (300s) 处理 | P2 |
| OCR-CTRL-012 | POST /receipts/extract | Base64 编码图片正确发送 | P1 |
| OCR-CTRL-013 | POST /receipts/extract | PNG 图片 MIME 类型检测 | P1 |
| OCR-CTRL-014 | POST /receipts/extract | JPEG 图片 MIME 类型检测 | P1 |

#### 3.2.2 ReceiptController CheckDuplicate

| 用例 ID | 端点 | 描述 | 优先级 |
|---|---|---|---|
| DUP-001 | POST /receipts/check-duplicate | 重复票据 → isDuplicate: true | P0 |
| DUP-002 | POST /receipts/check-duplicate | 非重复票据 → isDuplicate: false | P0 |
| DUP-003 | POST /receipts/check-duplicate | 输入为空 → 默认 isDuplicate: false | P1 |
| DUP-004 | POST /receipts/check-duplicate | Agent 未配置 → 默认 isDuplicate: false | P0 |
| DUP-005 | POST /receipts/check-duplicate | Agent 返回解析错误 → 默认 isDuplicate: false | P1 |
| DUP-006 | POST /receipts/check-duplicate | 返回 JSON 带 ``` 标记 → 正确去除 | P1 |
| DUP-007 | POST /receipts/check-duplicate | 返回完整响应体(step1Raw)用于调试 | P2 |

#### 3.2.3 Batch Extract (Visits Controller)

| 用例 ID | 端点 | 描述 | 优先级 |
|---|---|---|---|
| BATCH-001 | POST /visits/batch-extract | 正常批量提取 → 返回 Results | P0 |
| BATCH-002 | POST /visits/batch-extract | 空照片列表 → 返回空 Results | P1 |
| BATCH-003 | POST /visits/batch-extract | 部分照片提取失败 → 混合状态 | P1 |
| BATCH-004 | POST /visits/batch-extract | 照片不存在 → 对应项 Error | P1 |

#### 3.2.4 Save Confirmed Receipts

| 用例 ID | 端点 | 描述 | 优先级 |
|---|---|---|---|
| SAVE-001 | POST /visits/save-confirmed | 新建票据并保存 → Receipt + Photo 关联 | P0 |
| SAVE-002 | POST /visits/save-confirmed | 更新已有票据 → Update | P0 |
| SAVE-003 | POST /visits/save-confirmed | 自动关联照片的 AssociatedReceiptIds | P0 |
| SAVE-004 | POST /visits/save-confirmed | 空收据列表 → 返回空结果 | P1 |

#### 3.2.5 AutoAssociate

| 用例 ID | 服务 | 描述 | 优先级 |
|---|---|---|---|
| AUTO-001 | TryAssociatePhotoAsync | 门诊号完全匹配 → MatchLevel: OutpatientNumber | P0 |
| AUTO-002 | TryAssociatePhotoAsync | 医院+患者匹配 → MatchLevel: Hospital+Patient | P1 |
| AUTO-003 | TryAssociatePhotoAsync | 仅医院名匹配 → MatchLevel: Hospital | P1 |
| AUTO-004 | TryAssociatePhotoAsync | 无匹配 → null | P0 |
| AUTO-005 | AutoAssociateAllAsync | 批量自动关联 → 返回结果列表 | P1 |

---

### 3.3 Enhanced OCR — 数据模型

| 用例 ID | 描述 | 优先级 |
|---|---|---|
| MODEL-001 | Receipt.Type 枚举值验证（Shopping/Medical） | P0 |
| MODEL-002 | Receipt.Category 与 Type 的匹配关系 | P1 |
| MODEL-003 | MedicalCategory 到 FHIR Resource Type 映射 | P1 |
| MODEL-004 | ReceiptCurrency 默认值 CNY | P2 |
| MODEL-005 | ReceiptLineItem 字段验证 | P2 |
| MODEL-006 | MedicationItem 字段验证 | P2 |
| MODEL-007 | LabResultItem Status 值域（Normal/High/Low/Abnormal） | P2 |

---

## 4. 测试范围与用例矩阵

### 3.4 Photo Album — 前端组件

| 用例 ID | 组件 | 描述 | 优先级 |
|---|---|---|---|
| FE-PHOTO-001 | PhotoAlbumPage | 页面加载 → 显示"暂无照片"空状态 | P0 |
| FE-PHOTO-002 | PhotoAlbumPage | 有照片 → 显示分组视图（默认） | P0 |
| FE-PHOTO-003 | PhotoAlbumPage | 切换网格视图 → 正确渲染 | P1 |
| FE-PHOTO-004 | PhotoAlbumPage | 日期过滤器：全部/本月/本周 | P1 |
| FE-PHOTO-005 | PhotoAlbumPage | 分页组件（>24张照片时显示） | P1 |
| FE-PHOTO-006 | PhotoAlbumPage | 上传对话框打开/关闭 | P1 |
| FE-PHOTO-007 | PhotoAlbumPage | 删除照片 → 确认对话框 + 成功 | P0 |
| FE-PHOTO-008 | PhotoAlbumPage | 灯箱预览 → 打开/关闭 + 上/下一张 | P1 |
| FE-PHOTO-009 | PhotoAlbumPage | groupPhotos 逻辑 → 正确按年月分组 | P1 |
| FE-PHOTO-010 | PhotoAlbumPage | viewMode 切换 → grouped 数据不丢失 | P2 |

| 用例 ID | 组件 | 描述 | 优先级 |
|---|---|---|---|
| FE-PHOTO-011 | PhotoUploader | 文件选择对话框 → 上传流程 | P0 |
| FE-PHOTO-012 | PhotoUploader | 拖放上传 | P1 |
| FE-PHOTO-013 | PhotoUploader | Base64 转换正确 | P1 |
| FE-PHOTO-014 | PhotoUploader | 批量上传 (maxFiles=20) | P1 |
| FE-PHOTO-015 | PhotoUploader | 上传进度条更新 | P1 |
| FE-PHOTO-016 | PhotoUploader | 上传失败 → 显示错误状态 | P1 |
| FE-PHOTO-017 | PhotoUploader | 上传成功 → 回调 onComplete | P1 |

| 用例 ID | 组件 | 描述 | 优先级 |
|---|---|---|---|
| FE-PHOTO-018 | PhotoCard | 渲染照片缩略图 + 元数据 | P0 |
| FE-PHOTO-019 | PhotoCard | 点击 → 打开灯箱 | P0 |
| FE-PHOTO-020 | PhotoCard | 上下文菜单 → 编辑/删除 | P1 |
| FE-PHOTO-021 | PhotoCard | 编辑对话框 → 保存修改 | P1 |
| FE-PHOTO-022 | PhotoCard | 标签标签显示（位置/相机/票据关联） | P2 |

| 用例 ID | 组件 | 描述 | 优先级 |
|---|---|---|---|
| FE-PHOTO-023 | PhotoLightbox | 照片显示 + 元数据面板 | P0 |
| FE-PHOTO-024 | PhotoLightbox | 关闭按钮 → 关闭灯箱 | P0 |
| FE-PHOTO-025 | PhotoLightbox | 上一张/下一张导航 | P1 |
| FE-PHOTO-026 | PhotoLightbox | 显示关联票据 IDs | P2 |

---

## 5. 边界值测试

| 场景 | 边界值 | 预期结果 |
|---|---|---|
| 上传文件大小 | 0 字节空文件 | 上传成功但数据为空 |
| 上传文件大小 | 单个文件 100MB（大文件） | 应限制/超时处理 |
| Base64 编码 | 超大 Base64（>50MB） | 内存溢出风险 |
| 批量上传 | 0 张照片 | 返回空结果 |
| 批量上传 | 20 张（maxFiles） | 全部处理 |
| 批量上传 | 100 张（超出 maxFiles） | 仅处理前 20 张 |
| 分页 | 正好 24 张照片 | 1 页 |
| 分页 | 25 张照片 | 2 页 |
| 分页 | 0 张照片 | 无分页组件 |
| 日期过滤 | 起始 > 结束 | 空结果 |
| OCR 两步 | Step1 返回空 | 502 错误 |
| OCR 两步 | Step1 正常, Step2 超时 | 502 错误 |
| OCR 两步 | 图片格式不支持 | 错误处理 |
| MongoDB | 无索引查询性能 | 关注大表性能 |
| Delete | 文件已不存在 | 不抛异常 |
| Download | 只有 Base64，无文件路径 | 从 Base64 解码 |

---

## 6. 权限与安全测试

| 用例 ID | 描述 | 优先级 |
|---|---|---|
| SEC-001 | 未认证用户访问 /api/photos → 401 | P0 |
| SEC-002 | 用户A删除用户B的照片 → 404（权限隔离） | P0 |
| SEC-003 | 用户A查询用户B的照片 → 空列表/404 | P0 |
| SEC-004 | 路径遍历攻击：FileName 包含 `../` | P0 |
| SEC-005 | 恶意 Base64 数据注入 | P1 |
| SEC-006 | OCR Agent API Key 泄露（不记录到日志） | P1 |
| SEC-007 | OCR 响应中的敏感信息不泄露 | P1 |
| SEC-008 | 照片文件下载无认证 → 不应公开 | P0 |

---

## 7. 性能测试

| 用例 ID | 描述 | 目标 |
|---|---|---|
| PERF-001 | 批量上传 20 张照片 | < 5 秒 |
| PERF-002 | 获取全部照片（100 张） | < 500ms |
| PERF-003 | OCR 单张图片提取 | < 30 秒 |
| PERF-004 | OCR 批量 10 张 | < 5 分钟 |
| PERF-005 | 分组视图渲染（50 张） | < 1 秒 |

---

## 8. 缺陷报告标准

每个发现的缺陷需记录：
- **标题**: 简洁描述
- **严重程度**: Critical / Major / Minor / Trivial
- **优先级**: P0 / P1 / P2 / P3
- **复现步骤**: 具体可操作
- **预期结果**: 应该发生什么
- **实际结果**: 实际发生什么
- **环境**: 浏览器/OS/API版本
- **附件**: 截图/日志/API 响应

---

## 9. 测试环境与数据

### 9.1 环境要求
- .NET 9 SDK
- Node.js 18+
- MongoDB (InMemory for unit tests)
- Mock OCR API 端点
- 测试用图片文件（JPG, PNG）

### 9.2 测试数据
- 测试用图片：包含正常照片、损坏图片、超大图片
- 测试用 OCR 响应：模拟 Qwen VL 的正常/异常响应
- 测试用照片数据：含各种元数据组合
- 测试用 Receipt 数据：Shopping + Medical 类型

---

## 10. 通过标准

- P0 用例通过率: 100%
- P1 用例通过率: ≥ 95%
- P2 用例通过率: ≥ 90%
- 无 Critical/Major 缺陷遗留
- 代码覆盖率 ≥ 80%（核心业务逻辑）
- 安全漏洞 0 个

---

## 11. 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| OCR API 不稳定 | 高 | 中 | Mock OCR 响应, 重试机制测试 |
| 大文件上传内存溢出 | 高 | 低 | 文件大小限制测试, 内存压力测试 |
| MongoDB 连接超时 | 中 | 低 | InMemory 替代, 超时测试 |
| Base64 编码错误 | 中 | 中 | 输入验证测试, 编码边界测试 |
| 权限绕过 | 高 | 低 | 严格的权限隔离测试 |

---

## 12. 测试执行计划

| 阶段 | 日期 | 内容 | 负责人 |
|---|---|---|---|
| 测试准备 | Week 1 | 环境搭建, 测试数据准备, Mock 配置 | 测试总监 |
| 单元测试 | Week 1-2 | PhotoService, PhotoController, ReceiptController | 测试总监 |
| 组件测试 | Week 2 | React 前端组件测试 | 测试总监 |
| 集成测试 | Week 2 | API 端到端流程 | 测试总监 |
| E2E 测试 | Week 3 | 浏览器完整流程 | 测试总监 |
| 回归测试 | Week 3 | 全量回归 | 测试总监 |
| 验收测试 | Week 3 | 对照 PRD 验收标准 | 指挥官 + 测试总监 |
