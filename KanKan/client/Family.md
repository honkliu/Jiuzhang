# Family（中国式家谱）— Complete Design Specification

## 1. Goal

A new top-level feature parallel to **Pa** and **Contacts**, visible only to users whose email matches the server-side `AdminEmails` list (`user.isAdmin === true`). The feature is a **中国式家谱** (Chinese clan genealogy) implemented in React + D3, backed by a MongoDB store and a REST API. It must handle the full lifecycle: create, view, edit, search, import, export, and print.

---

## 2. Reference: Final.html Summary

`Family/Final.html` is a standalone D3 v7 HTML prototype. Key behaviours to preserve:

- **Layout:** `d3.tree().nodeSize([50, 140])`, top-down, parent X snapped to rightmost child.
- **Node:** vertical name characters, optional spouse alongside, age below.
- **Viewport windowing:** `MAX_VISIBLE_DEPTH = 5`, `MAX_VISIBLE_WIDTH = 5`, scrollable by keyboard/wheel.
- **Interactions:** left-click highlights subtree + ancestors; right-click opens edit menu; SVG click clears highlight.
- **No persistence** in the reference — all in-memory.

---

## 3. Core Concepts

### 3.1 Generation Number (世代)

Every person in a Chinese genealogy belongs to a numbered generation (世). This is not the same as tree depth — the root person carried into the system may already be the 15th or 20th generation of the clan.

- The tree has a configurable `rootGeneration` (e.g. `15` means the root person is the 15th generation).
- Each person stores an absolute `generation` integer: `root.generation = rootGeneration`, each child = parent's generation + 1.
- The UI shows "第N世" on every node and in the generation strip.
- When printing or exporting, generation numbers are always shown.

### 3.2 字辈 (Generation Name Poem)

Traditional Chinese clans assign one character per generation in a fixed poem, e.g.:

```text
国 志 正 朝 文 明 德 ...
15  16  17  18  19  20  21
```

- The tree stores a `zibeiPoem: string[]` (one character per generation, indexed from `rootGeneration`).
- For display: given a person in generation 17, their 字辈 character is `zibeiPoem[17 - rootGeneration]` = `正`.
- This is purely display/reference data — it does not affect storage of names.

### 3.3 Clan Surname

The tree has a `surname` field (e.g. `李`). Useful for display headers and print layout, and for the import adapter that can auto-prepend the surname to imported bare names.

---

## 4. Data Model

### 4.1 Three MongoDB Collections

#### `FamilyTrees` — tree metadata and configuration

```json
{
  "_id": "ftree_<guid>",
  "name": "李氏家谱",
  "surname": "李",
  "ownerId": "user_<guid>",
  "domain": "@shaol.com",
  "rootGeneration": 1,
  "zibeiPoem": ["国", "志", "正", "朝", "文", "明", "德"],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

#### `FamilyPersons` — one document per person, no tree structure

Every field beyond `name` is optional. New fields can be added at any time; old documents return `null` — no migration needed.

```json
{
  "_id": "fperson_<guid>",
  "treeId": "ftree_<guid>",
  "domain": "@shaol.com",

  "name": "李国栋",
  "aliases": ["李老大"],
  "gender": "male",
  "generation": 1,

  "birthDate": { "year": 1944, "month": 3, "day": 12, "calendarType": "solar", "isLeapMonth": false },
  "deathDate": { "year": 2021, "month": 11, "day": 5, "calendarType": "solar", "isLeapMonth": false },
  "birthPlace": "湖南省长沙市",
  "deathPlace": "湖南省长沙市",
  "isAlive": false,

  "avatarUrl": "https://…/avatar.jpg",
  "photos": [
    { "id": "photo_<guid>", "url": "https://…/1.jpg", "caption": "结婚照", "year": 1968 }
  ],

  "occupation": "教师",
  "education": "大学本科",
  "biography": "一生从教三十年…",
  "briefNote": "长房次子",

  "experiences": [
    { "id": "exp_<guid>", "type": "education", "title": "湖南师范大学", "description": "中文系", "startYear": 1963, "endYear": 1967 },
    { "id": "exp_<guid>", "type": "work",      "title": "长沙第一中学", "description": "语文教师","startYear": 1968, "endYear": 1998 },
    { "id": "exp_<guid>", "type": "milestone", "title": "入党",         "description": "",         "startYear": 1972, "endYear": null  }
  ],

  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

**Person field groups:**

| Group | Fields | Notes |
| --- | --- | --- |
| Identity | `name`, `aliases[]`, `gender`, `generation` | `aliases` covers 字, 号, maiden names; `generation` is the absolute 世 number |
| Dates & places | `birthDate`, `deathDate`, `birthPlace`, `deathPlace`, `isAlive` | Structured partial dates: `{ year, month?, day?, calendarType?, isLeapMonth? }`; supports solar and lunar entry |
| Media | `avatarUrl`, `photos[]` | Single display avatar + photo gallery; URLs stored from existing KanKan upload endpoint |
| Profile | `occupation`, `education`, `biography`, `briefNote` | Free-form text plus a short note shown in detail panel |
| Experiences | `experiences[]` | Chronological life events; `type`: `work`, `education`, `military`, `milestone`, `other` |

#### `FamilyRelationships` — one document per relationship edge

Two `type` values: `parent-child` and `spouse`. Each has its own qualifier fields.

**parent-child record:**

```json
{
  "_id": "frel_<guid>",
  "treeId": "ftree_<guid>",
  "domain": "@shaol.com",
  "type": "parent-child",
  "fromId": "fperson_<guid>",
  "toId":   "fperson_<guid>",
  "parentRole":  "father",
  "childStatus": "biological",
  "sortOrder": 0,
  "notes": "",
  "createdAt": "ISO8601"
}
```

**spouse record:**

```json
{
  "_id": "frel_<guid>",
  "treeId": "ftree_<guid>",
  "domain": "@shaol.com",
  "type": "spouse",
  "fromId": "fperson_<guid>",
  "toId":   "fperson_<guid>",
  "unionType": "married",
  "startYear": 1968,
  "endYear":   null,
  "notes": "结发夫妻",
  "createdAt": "ISO8601"
}
```

**`parentRole` values:**

| Value | Chinese | Notes |
| --- | --- | --- |
| `father` | 父亲 | biological or primary male parent |
| `mother` | 母亲 | biological or primary female parent |
| `stepfather` | 继父 | male parent via marriage to bio parent |
| `stepmother` | 继母 | female parent via marriage to bio parent |
| `adoptive-father` | 养父 | formal adoption |
| `adoptive-mother` | 养母 | formal adoption |
| `foster-father` | 寄养父 | foster care |
| `foster-mother` | 寄养母 | foster care |
| `godfather` | 干爸 | 义父 / 教父 |
| `godmother` | 干妈 | 义母 / 教母 |

**`childStatus` values:**

| Value | Chinese | Notes |
| --- | --- | --- |
| `biological` | 亲生 | born to this parent |
| `adopted` | 养子女 | formally adopted |
| `step` | 继子女 | from the other parent's prior relationship |
| `foster` | 寄养 | temporary foster placement |
| `godchild` | 干儿女 | 义子女 |

**`unionType` values (spouse):**

| Value | Chinese | Notes |
| --- | --- | --- |
| `married` | 已婚 | current marriage |
| `divorced` | 离异 | `endYear` = divorce year |
| `widowed` | 丧偶 | `endYear` = year of partner's death |
| `cohabiting` | 同居 | unmarried partner |
| `betrothed` | 订婚 | historical betrothal records |

**Siblings: derived, never stored.** Two persons are full siblings when they share the same `fromId` in `parent-child` records. Half-siblings share one parent. The client derives this from the assembled tree — storing sibling records explicitly creates redundancy and inconsistency risk.

**One person can have multiple spouse records** (sequential marriages). `startYear`/`endYear` disambiguates ordering.

#### `FamilyDocuments` — tree-scoped shared documents (4th collection)

Family documents belong to the **tree/clan as a whole**, not to any individual person. They represent the collective memory of the family: history texts, photo albums, ceremony records, certificates, announcements.

```json
{
  "_id": "fdoc_<guid>",
  "treeId": "ftree_<guid>",
  "domain": "@shaol.com",

  "type": "history",
  "title": "李氏起源与迁徙史",
  "body": "Markdown or HTML rich text, up to ~1MB…",

  "coverImageUrl": "https://…/cover.jpg",
  "attachments": [
    { "id": "att_<guid>", "url": "https://…/deed.jpg", "filename": "土地契约.jpg", "mimeType": "image/jpeg" }
  ],

  "tags": ["历史", "迁徙"],
  "linkedPersonIds": ["fperson_<guid>", "fperson_<guid>"],
  "generationFrom": 1,
  "generationTo": 5,

  "authorId": "user_<guid>",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

**`type` values:**

| Value | Chinese | Examples |
| --- | --- | --- |
| `history` | 族史 | clan origin story, migration records, founding narrative |
| `photo-album` | 相册 | named collection of family photos |
| `celebration` | 庆典记录 | reunion gatherings, festivals, weddings, funerals |
| `certificate` | 证书 / 文书 | land deeds, government records, diplomas, birth certificates |
| `record` | 记录 | membership registers, meeting minutes, clan rules |
| `announcement` | 公告 | clan announcements, obituaries, births |

**Key design decisions:**

- `body` stores rich text (Markdown). For very large bodies (>500 KB) the text is stored in Azure Blob and `body` stores the URL — the same pattern as existing KanKan media.
- `attachments[]` are arbitrary file URLs (images, PDFs, scans) — reuses the existing `POST /media/upload` endpoint.
- `linkedPersonIds[]` optionally associates a document with specific people (e.g. a certificate that belongs to two persons). This is advisory — it only drives UI cross-links, not access control.
- `generationFrom` / `generationTo` optionally scopes a document to a generation range (e.g. "this history covers generations 1–10"). Used for filtering in the Documents tab.
- One tree can have many documents of the same type (multiple photo albums, multiple history chapters).

### 4.2 Indexes

`FamilyTrees`:

- `{ domain: 1, updatedAt: -1 }` — list trees per domain

`FamilyPersons`:

- `{ treeId: 1 }` — load all persons for one tree
- `{ treeId: 1, generation: 1 }` — generation view / filtering

`FamilyRelationships`:

- `{ treeId: 1, type: 1, fromId: 1 }` — children of a person (hot path)
- `{ treeId: 1, type: 1, toId: 1 }` — parents of a person (ancestor lookup)
- `{ treeId: 1 }` — load all relationships for one tree

`FamilyDocuments`:

- `{ treeId: 1, type: 1, updatedAt: -1 }` — list documents by type for a tree
- `{ treeId: 1, linkedPersonIds: 1 }` — find documents linked to a person

### 4.3 `appsettings.json` additions

```json
"MongoDB": {
  "Collections": {
    "FamilyTrees": "FamilyTrees",
    "FamilyPersons": "FamilyPersons",
    "FamilyRelationships": "FamilyRelationships",
    "FamilyDocuments": "FamilyDocuments"
  }
}
```

---

## 5. Client State Model (TypeScript)

```typescript
// ── Sub-types ──────────────────────────────────────────────────────

interface FamilyDate {
  year: number;
  month?: number;
  day?: number;
  calendarType?: 'solar' | 'lunar';
  isLeapMonth?: boolean;
}

interface FamilyPhoto {
  id: string;
  url: string;
  caption?: string;
  year?: number;
}

interface FamilyExperience {
  id: string;
  type: 'work' | 'education' | 'military' | 'milestone' | 'other';
  title: string;
  description?: string;
  startYear?: number;
  endYear?: number | null;
}

// ── Raw DTOs (flat, as received from API) ─────────────────────────

interface FamilyTreeDto {
  id: string;
  name: string;
  surname?: string;
  domain: string;
  ownerId: string;
  rootGeneration: number;         // e.g. 1 or 15
  zibeiPoem?: string[];           // one char per generation
  createdAt: string;
  updatedAt: string;
}

interface FamilyPersonDto {
  id: string;
  treeId: string;
  name: string;
  aliases?: string[];
  gender?: 'male' | 'female' | 'unknown';
  generation: number;             // absolute 世 number
  birthDate?: FamilyDate;
  deathDate?: FamilyDate;
  birthPlace?: string;
  deathPlace?: string;
  isAlive?: boolean;
  avatarUrl?: string;
  photos?: FamilyPhoto[];
  occupation?: string;
  education?: string;
  biography?: string;
  briefNote?: string;
  experiences?: FamilyExperience[];
}

interface FamilyRelationshipDto {
  id: string;
  type: 'parent-child' | 'spouse';
  fromId: string;
  toId: string;
  // parent-child
  parentRole?:  'father' | 'mother'
              | 'stepfather' | 'stepmother'
              | 'adoptive-father' | 'adoptive-mother'
              | 'foster-father'   | 'foster-mother'
              | 'godfather'       | 'godmother';
  childStatus?: 'biological' | 'adopted' | 'step' | 'foster' | 'godchild';
  sortOrder?: number;
  // spouse
  unionType?: 'married' | 'divorced' | 'widowed' | 'cohabiting' | 'betrothed';
  startYear?: number;
  endYear?: number | null;
  notes?: string;
}

interface FamilyAttachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
}

interface FamilyDocumentDto {
  id: string;
  treeId: string;
  type: 'history' | 'photo-album' | 'celebration' | 'certificate' | 'record' | 'announcement';
  title: string;
  body?: string;                    // Markdown rich text
  coverImageUrl?: string;
  attachments?: FamilyAttachment[];
  tags?: string[];
  linkedPersonIds?: string[];
  generationFrom?: number;
  generationTo?: number;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

// ── Assembled node used by D3 ──────────────────────────────────────

interface FamilyNode extends FamilyPersonDto {
  children: FamilyNode[];         // ordered by sortOrder
  spouses:  FamilyNode[];         // all union partners
  parentRels: FamilyRelationshipDto[];  // raw rel records to this node as child
  spouseRels: FamilyRelationshipDto[];  // raw spouse rel records
}

// ── Page-level state (FamilyPage) ─────────────────────────────────

interface FamilyPageState {
  trees: FamilyTreeDto[];
  selectedTreeId: string | null;
  persons: FamilyPersonDto[];
  relationships: FamilyRelationshipDto[];
  documents: FamilyDocumentDto[];
  root: FamilyNode | null;        // assembled, derived
  viewMode: 'tree' | 'list' | 'generation' | 'documents' | 'print';
  loading: boolean;
  error: string | null;
}
```

### 5.1 Client-Side Tree Assembly

```typescript
function buildTree(
  persons: FamilyPersonDto[],
  rels: FamilyRelationshipDto[]
): FamilyNode | null {
  const map = new Map(persons.map(p => [
    p.id,
    { ...p, children: [], spouses: [], parentRels: [], spouseRels: [] } as FamilyNode
  ]));

  const pcRels = rels
    .filter(r => r.type === 'parent-child')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const spRels = rels.filter(r => r.type === 'spouse');

  for (const r of pcRels) {
    const parent = map.get(r.fromId), child = map.get(r.toId);
    if (parent && child) {
      parent.children.push(child);
      child.parentRels.push(r);
    }
  }
  for (const r of spRels) {
    const a = map.get(r.fromId), b = map.get(r.toId);
    if (a && b) {
      a.spouses.push(b); a.spouseRels.push(r);
      b.spouses.push(a); b.spouseRels.push(r);
    }
  }

  const childIds = new Set(pcRels.map(r => r.toId));
  return [...map.values()].find(n => !childIds.has(n.id)) ?? null;
}
```

Sibling order always follows `FamilyRelationship.sortOrder`, and the rightmost child is the eldest (`长子在右`). Birth dates are display metadata and must not override explicit relationship ordering.

---

## 6. API Design

Base path: `/api/family`. All endpoints require `[Authorize]` + server-side `currentUser.IsAdmin` check.

### 6.1 Tree Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/family` | List all trees for caller's domain |
| `POST` | `/api/family` | Create a new tree |
| `PUT` | `/api/family/{treeId}` | Update tree metadata (name, surname, zibeiPoem, rootGeneration) |
| `DELETE` | `/api/family/{treeId}` | Delete tree + all its persons and relationships |

### 6.2 Load Full Tree (one call)

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/family/{treeId}` | `{ tree, persons[], relationships[] }` |

### 6.3 Person Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/family/{treeId}/persons` | Add a person; `name` required, all else optional |
| `PUT` | `/api/family/{treeId}/persons/{personId}` | Partial update — only send changed fields |
| `DELETE` | `/api/family/{treeId}/persons/{personId}` | Delete person + all their relationship records |

### 6.4 Relationship Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/family/{treeId}/relationships` | Create a relationship |
| `PUT` | `/api/family/{treeId}/relationships/{relId}` | Update sortOrder or notes |
| `DELETE` | `/api/family/{treeId}/relationships/{relId}` | Remove a relationship |

### 6.5 Document Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/family/{treeId}/documents` | List all documents for a tree (optionally filter by `?type=history`) |
| `POST` | `/api/family/{treeId}/documents` | Create a new document |
| `PUT` | `/api/family/{treeId}/documents/{docId}` | Update document (title, body, attachments, tags, links) |
| `DELETE` | `/api/family/{treeId}/documents/{docId}` | Delete document and its attachments |

### 6.6 Import / Export Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/family/{treeId}/import` | Import from JSON (Final.html shape, recursive nested) |
| `GET` | `/api/family/{treeId}/export` | Export full flat JSON `{ tree, persons[], relationships[] }` |

### 6.6 Write Operations (atomic, no full-tree replace)

| Operation | Collections touched | MongoDB call |
| --- | --- | --- |
| Edit person fields | `FamilyPersons` | `UpdateOneAsync` |
| Add person | `FamilyPersons` | `InsertOneAsync` |
| Add parent-child link | `FamilyRelationships` | `InsertOneAsync` |
| Add spouse link | `FamilyRelationships` | `InsertOneAsync` |
| Remove person | `FamilyPersons` + `FamilyRelationships` | `DeleteOneAsync` person; `DeleteManyAsync` rels by fromId or toId |
| Delete subtree | Both | BFS to collect descendant IDs; `DeleteManyAsync $in` on both collections |
| Reorder siblings | `FamilyRelationships` | Bulk `UpdateOneAsync` on `sortOrder` |
| Import nested JSON | Both | Recursive walk: `InsertManyAsync` persons, then `InsertManyAsync` rels |

---

## 7. Server Implementation Files

```text
Controllers/FamilyController.cs
Models/Entities/FamilyTree.cs              # FamilyTree, FamilyPerson, FamilyRelationship,
                                           # FamilyDocument, FamilyDate, FamilyPhoto,
                                           # FamilyExperience, FamilyAttachment
Models/DTOs/FamilyDtos.cs                  # all request/response DTOs
Repositories/Interfaces/
  IFamilyTreeRepository.cs
  IFamilyPersonRepository.cs
  IFamilyRelationshipRepository.cs
  IFamilyDocumentRepository.cs
Repositories/Implementations/
  FamilyTreeRepository.cs                  # MongoDB
  FamilyPersonRepository.cs               # MongoDB
  FamilyRelationshipRepository.cs         # MongoDB
  FamilyDocumentRepository.cs             # MongoDB
  InMemoryFamilyRepository.cs             # dev/test (implements all four interfaces)
```

**Admin gate (same pattern as AdminController):**

```csharp
var currentUser = await _userRepository.GetByIdAsync(GetUserId());
if (!currentUser.IsAdmin) return Forbid();
```

---

## 8. Client Service

```typescript
// src/services/family.service.ts
class FamilyService {
  // Trees
  listTrees(): Promise<FamilyTreeDto[]>
  createTree(data: Partial<FamilyTreeDto>): Promise<FamilyTreeDto>
  updateTree(treeId: string, data: Partial<FamilyTreeDto>): Promise<FamilyTreeDto>
  deleteTree(treeId: string): Promise<void>

  // Full load
  getTree(treeId: string): Promise<{ tree: FamilyTreeDto; persons: FamilyPersonDto[]; relationships: FamilyRelationshipDto[] }>

  // Persons
  addPerson(treeId: string, data: Partial<FamilyPersonDto>): Promise<FamilyPersonDto>
  updatePerson(treeId: string, personId: string, data: Partial<FamilyPersonDto>): Promise<FamilyPersonDto>
  deletePerson(treeId: string, personId: string): Promise<void>

  // Relationships
  addRelationship(treeId: string, rel: Omit<FamilyRelationshipDto, 'id'>): Promise<FamilyRelationshipDto>
  updateRelationship(treeId: string, relId: string, data: Pick<FamilyRelationshipDto, 'sortOrder' | 'notes'>): Promise<FamilyRelationshipDto>
  deleteRelationship(treeId: string, relId: string): Promise<void>

  // Documents
  listDocuments(treeId: string, type?: FamilyDocumentDto['type']): Promise<FamilyDocumentDto[]>
  createDocument(treeId: string, data: Partial<FamilyDocumentDto>): Promise<FamilyDocumentDto>
  updateDocument(treeId: string, docId: string, data: Partial<FamilyDocumentDto>): Promise<FamilyDocumentDto>
  deleteDocument(treeId: string, docId: string): Promise<void>

  // Import / Export
  importTree(treeId: string, nestedJson: object): Promise<void>
  exportTree(treeId: string): Promise<Blob>
}
export const familyService = new FamilyService();
```

---

## 9. Component Structure

```text
src/components/Family/
├── FamilyPage.tsx            # Page shell, state, view-mode router
├── FamilyToolbar.tsx         # Tree selector, view tabs, import/export/print buttons
├── views/
│   ├── FamilyTreeView.tsx    # D3 canvas view (main tree)
│   ├── FamilyListView.tsx    # Searchable person list, sortable by name/generation
│   ├── FamilyGenView.tsx     # Generation strip: horizontal row per 世
│   ├── FamilyDocsView.tsx    # Clan documents browser + editor
│   └── FamilyPrintView.tsx   # Print-optimised layout (CSS @media print)
├── FamilyTreeCanvas.tsx      # D3 rendering, viewport state, interactions
├── FamilyNodeContextMenu.tsx # Right-click quick menu (add child/spouse, view, delete)
├── FamilyPersonPanel.tsx     # Right-side Drawer: full person detail + inline edit
├── FamilyDocEditor.tsx       # Full-screen document editor (Markdown + attachments)
├── FamilyTextImport.tsx      # Plain-text notation parser + preview
└── FamilyImportDialog.tsx    # Import modal: paste/upload JSON, preview, confirm
```

---

## 10. UI / UX Design

### 10.1 Page Layout

```text
┌────────────────────────────────────────────────────────────────┐
│  AppHeader (家谱 nav item visible to admins only)              │
├────────────────────────────────────────────────────────────────┤
│  FamilyToolbar:                                                │
│  [李氏家谱 ▾] [+ 新建]   [树形|列表|世代|打印]                │
│  [导入] [导出] [打印] [?帮助]                                  │
├────────────────────────────────────────────────────────────────┤
│                                      │                         │
│   Active view (tree / list /         │  FamilyPersonPanel      │
│   generation / print)                │  (slide-in Drawer,      │
│                                      │   opens on node click)  │
│                            [help ▾]  │                         │
└────────────────────────────────────────────────────────────────┘
```

### 10.2 Tree View (FamilyTreeCanvas)

- D3 top-down layout, `nodeSize([50, 140])`.
- Each node shows: vertical name characters + optional spouse alongside + **"第N世"** generation badge below.
- 字辈 character highlighted in name if `zibeiPoem` is configured.
- Viewport windowing: `MAX_VISIBLE_DEPTH = 5`, `MAX_VISIBLE_WIDTH = 5`.
- Navigation: Arrow keys / mouse wheel (vertical = generation depth, Shift+wheel = horizontal).
- Left-click: highlight subtree + ancestors, dim others.
- Right-click: `FamilyNodeContextMenu` quick menu.
- Click background: clear highlight.
- Relationship type badge on link line: `继` for step, `养` for adoptive (biological links have no badge).

### 10.3 Node Quick Menu (right-click)

```text
┌─────────────────────────┐
│ 👁 查看 / 编辑详情       │  → opens FamilyPersonPanel
│ ➕ 添加子女              │  → inline sub-menu: 亲生 / 养 / 继
│ 💑 添加配偶              │  → inline sub-menu: 已婚 / 离异 / …
│ 🔍 查看祖先路径          │  → highlights ancestor chain
│ 📄 复制此分支            │  → copies branch JSON to clipboard
│ 🗑 删除此人              │  → confirm dialog
└─────────────────────────┘
```

### 10.4 Person Detail Panel (right Drawer)

```text
┌─────────────────────────────────────┐
│ [← 关闭]              [✏ 编辑]      │
│                                     │
│ [Avatar]  李国栋   第1世            │
│          (1944–2021)  男            │
│          湖南省长沙市出生            │
│                                     │
│ 字辈：国  别名：李老大              │
│ ─────────────────────────────────── │
│ 职业：教师   学历：大学本科          │
│ ─────────────────────────────────── │
│ 生平简介                            │
│ 一生从教三十年…                     │
│ ─────────────────────────────────── │
│ 父亲：李周氏（亲生）                │
│ 配偶：王氏（已婚 1968–）            │
│ 子女：李志远、李志宏、… (5人)       │
│ ─────────────────────────────────── │
│ 人生经历                            │
│ 1963 ▪ 入读湖南师范大学             │
│ 1968 ▪ 任职长沙第一中学             │
│ 1972 ★ 入党                        │
│ 1998 ▪ 退休                        │
│ ─────────────────────────────────── │
│ 照片  [结婚照] [全家福] [+上传]     │
└─────────────────────────────────────┘
```

- **Edit mode**: toggled by ✏ button; all fields become inline MUI inputs.
- **Relationship section** shows derived family links (parents, spouses, children) and supports adding a spouse or a child inline.
- **Child insertion** accepts a 排行 / `sortOrder` position and shifts later siblings automatically.
- **Date editing** supports both 公历 and 农历 metadata.
- **Photo upload** reuses `POST /media/upload`.

### 10.5 List View (FamilyListView)

A searchable, sortable table of all persons in the tree:

| 世代 | 姓名 | 性别 | 出生年 | 出生地 | 配偶 |
| --- | --- | --- | --- | --- | --- |
| 第1世 | 李国栋 | 男 | 1944 | 湖南长沙 | 王氏 |
| 第2世 | 李志远 | 男 | 1966 | … | 张氏 |

- Search box filters by name or alias.
- Click a row opens `FamilyPersonPanel`.
- Columns sortable by generation, name, birth year.

### 10.6 Generation View (FamilyGenView)

Horizontal rows, one per generation number. Each row shows all persons of that 世 as cards, left to right in `sortOrder`. Useful for comparing people of the same generation across different branches.

```text
第1世  ├── 李国栋 ──────────────────────────────────┤
第2世  ├── 李志远 ── 李志宏 ── 李志伟 ── 李志强 ──┤
第3世  ├── 李正豪 ── 李正轩 ── 李正宇 ── … ────────┤
```

### 10.7 Documents View (FamilyDocsView)

A dedicated tab showing all clan documents grouped by type, with full create/edit/delete capability.

```text
┌──────────────────────────────────────────────────────────────┐
│  [族史] [相册] [庆典] [证书] [记录] [公告]  [+ 新建文档]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  族史                                                        │
│  ┌─────────────────────────────────────────┐                │
│  │ 李氏起源与迁徙史            第1–10世    │                │
│  │ 记录李氏从山东迁至湖南的历史…  [编辑]  │                │
│  └─────────────────────────────────────────┘                │
│                                                              │
│  庆典记录                                                    │
│  ┌─────────────────────────────────────────┐                │
│  │ 2023年清明祭祖              [图2张]     │                │
│  │ 全体宗亲200余人参加…          [编辑]  │                │
│  └─────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────┘
```

Clicking a document opens `FamilyDocEditor` — a full-screen editor with:

- Title field
- Markdown rich-text body editor (with preview toggle)
- Attachment upload (images, PDFs — reuses `POST /media/upload`)
- "关联人物" section: search persons by name and link them
- "世代范围" selector: optional generation from/to
- Tags field

### 10.8 Plain-Text Notation for Quick Tree Entry (FamilyTextImport)

For fast bulk entry, the system accepts a plain-text shorthand. This bypasses the form UI entirely — type or paste text describing a branch, click **解析并导入** ("Parse & Import"), review the preview, and confirm.

#### Grammar

The core rule is: **the number of `-` before a name = the person's depth in the tree being entered**. A `,` on the same token = spouse. Qualifiers in `[]` follow the name.

```text
<entry>     ::= <person> (<spouse>)? (<qualifier>)*
<spouse>    ::= "," <name>
<qualifier> ::= "[" <tag> "]"
<tag>       ::= "女" | "养" | "继" | "已故" | "?" | <year>
<child>     ::= "-"+ <entry>
```

**Qualifier tags:**

| Tag | Meaning |
| --- | --- |
| `女` | female (default gender is male for Chinese clan trees) |
| `养` | adopted child (`childStatus: adopted`) |
| `继` | step-child (`childStatus: step`) |
| `已故` | deceased (`isAlive: false`) |
| `{YYYY}` | birth year, e.g. `{1944}` |
| `{N世}` | explicit generation override, e.g. `{15世}` |
| `?` | unknown / placeholder person |

#### Examples

**Example 1 — the input from the requirement:**

```
A, B - C -- D - E -- F -- G
```

Parsed as:

```
A (spouse: B)
  └─ C                    (child of A & B, depth 1)
       └─ D               (child of C, depth 2)
  └─ E                    (child of A & B, depth 1, sibling of C)
       └─ F               (child of E, depth 2)
       └─ G               (child of E, depth 2, sibling of F)
```

**Example 2 — multiline with qualifiers:**

```
李国栋{1世}, 王氏{女}
  - 李志远{2世}{1966}
    -- 李正豪{3世}
    -- 李正轩{3世}{女}
  - 李志宏{2世}{1968}[已故]
  - 李志伟{2世}
    -- 李正宇{3世}[养]
```

**Example 3 — inline shorthand for quick entry:**

```
李国, 王氏 - 李志 -- 李正 - 李强[女] -- 张磊 -- 张华
```

#### Parser behaviour

1. Tokenise: split on whitespace, treat `-`-prefixed tokens as depth markers.
2. Track a parent-stack. Depth increase = push; depth decrease = pop to the matching depth level.
3. `,` immediately after a name on the same depth = create a `spouse` relationship between the two.
4. Each name → `InsertOneAsync` into `FamilyPersons`; each parent-child edge → `InsertOneAsync` into `FamilyRelationships`.
5. `generation` = parent's generation + 1, or `rootGeneration` for depth-0 nodes. Explicit `{N世}` override takes priority.
6. Ambiguous names (same name already exists in the tree) are flagged in the preview with a yellow warning — user can choose to link to the existing person or create a new one.

#### UI flow

```text
┌──────────────────────────────────────────────────────────────┐
│  文字录入 (Plain-text entry)             [格式说明 ?]        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 李国栋, 王氏 - 李志远 -- 李正豪                        │  │
│  │ - 李志宏                                               │  │
│  └────────────────────────────────────────────────────────┘  │
│  [解析预览]                                                   │
├──────────────────────────────────────────────────────────────┤
│  预览：3人，2段关系，世代 1–3                                 │
│  ✅ 李国栋 (第1世, 男) + 配偶 王氏 (女)                     │
│  ✅ 李志远 → 李国栋 之子 (第2世)                            │
│  ✅ 李正豪 → 李志远 之子 (第3世)                            │
│  ⚠ 李志宏 → 父母不明（将添加为李国栋之子）                  │
│  [确认导入]   [取消]                                         │
└──────────────────────────────────────────────────────────────┘
```

### 10.9 Import (FamilyImportDialog)

Three supported formats:

**Format A — Plain-text notation** (see section 10.8 above):

- Handled by `FamilyTextImport` component and the `POST /api/family/{treeId}/import/text` endpoint.

**Format B — Final.html nested JSON** (auto-detected, recursive `{ name, spouse?, age?, children? }`):

- Server walks recursively, creates persons, infers generation from depth + `rootGeneration`.
- Spouse string → new `FamilyPerson` + `spouse` relationship.

**Format C — Flat export JSON** (round-trip format `{ tree, persons[], relationships[] }`):

- Backup/restore. Server inserts directly, re-assigns IDs to avoid collisions.

UI flow: choose format → paste JSON text or upload `.json` file → preview summary (N persons, M relationships, generation range) → confirm import.

### 10.10 Export

- **JSON export** (`GET /api/family/{treeId}/export`): flat `{ tree, persons[], relationships[], documents[] }` as a `.json` file download.
- **Print / PDF**: activates `FamilyPrintView` + `window.print()`. CSS `@media print`: white background, nodes as inline blocks per generation row, page breaks between major branches. Browser "Save as PDF" produces the genealogy book.

---

## 11. Access Control

| Layer | Mechanism |
| --- | --- |
| Navigation | `AppHeader.tsx` shows 家谱 item only when `user.isAdmin` |
| Route | `ProtectedRoute adminOnly` redirects non-admins to `/chats` |
| API | `FamilyController` checks `currentUser.IsAdmin`; returns `403` otherwise |
| Data scope | `domain` field on every document; domain-scoped admins see only their domain |

`AdminEmails` in `appsettings.json` sets `IsAdmin = true` at login. No client-side email list needed.

---

## 12. Open Questions

1. **Multiple trees per domain?** Design supports it (list endpoint, tree selector dropdown). MVP could limit to one.
2. **字辈 auto-assignment?** Should adding a child auto-populate the corresponding 字辈 character into the child's name? Opt-in feature.
3. **GEDCOM import** (`.ged` files — industry standard)? Phase 2+ feature.
4. **Collaborative editing?** Last-write-wins is acceptable for MVP; SignalR real-time sync is a future option.
5. **Subtree deletion** — delete silently or require confirmation listing all affected persons and relationship counts?
6. **Persons outside the bloodline** (spouses who married in) — should they appear in the generation view? Currently yes, at the same generation as their child's parent.

---

## 13. Implementation Phases

### Phase 1 — Static Tree (no persistence)

- [ ] Admin-gated route `/family`, nav item, `ProtectedRoute adminOnly`.
- [ ] `FamilyPage`, `FamilyToolbar`, `FamilyTreeCanvas` with hardcoded `Final.html` seed data.
- [ ] D3 rendering: vertical names, spouse alongside, **第N世** badge, links with type badges.
- [ ] Viewport windowing + keyboard/wheel navigation.
- [ ] Left-click highlight, right-click `FamilyNodeContextMenu` (UI only, no save).

### Phase 2 — Person Detail & In-Memory Edit

- [ ] `FamilyPersonPanel` drawer (read + edit all person fields).
- [ ] Context menu: add child (with role selector), add spouse (with unionType), delete person.
- [ ] In-memory state updates → D3 re-render on every change.
- [ ] Generation view (`FamilyGenView`) and list view (`FamilyListView`).

### Phase 3 — Backend & Persistence

- [ ] `FamilyTree`, `FamilyPerson`, `FamilyRelationship` C# entities and DTOs.
- [ ] Three MongoDB repositories + InMemory equivalents.
- [ ] `FamilyController`: all CRUD + import + export endpoints.
- [ ] `MongoDbInitializer`: create `FamilyTrees`, `FamilyPersons`, `FamilyRelationships` collections with indexes.
- [ ] `family.service.ts`: wire all API calls; auto-save on every edit action.

### Phase 4 — Rich Profiles & Media

- [x] Photo upload in `FamilyPersonPanel` (reuse media endpoint).
- [ ] Experience timeline editor (add / edit / delete / reorder).
- [ ] Alias and 字辈 display in node and panel.

### Phase 5 — Import, Export & Print

- [ ] `FamilyImportDialog`: paste/upload, preview, confirm.
- [ ] Import adapter for `Final.html` nested JSON format.
- [ ] JSON export download.
- [ ] `FamilyPrintView` + CSS print styles for genealogy book layout.

### Phase 6 — Polish

- [ ] 字辈 poem editor in tree settings.
- [ ] Multiple trees dropdown (create / delete / switch).
- [ ] Mobile touch support (pinch-zoom, swipe navigation).
- [ ] GEDCOM import (`.ged` standard format).
