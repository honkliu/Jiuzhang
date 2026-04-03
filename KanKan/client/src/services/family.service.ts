import apiClient from '@/utils/api';

export interface FamilyDate {
  year: number;
  month?: number;
  day?: number;
  calendarType?: 'solar' | 'lunar';
  isLeapMonth?: boolean;
}

export interface FamilyPhoto {
  id: string;
  url: string;
  caption?: string;
  year?: number;
}

export interface FamilyExperience {
  id: string;
  type: 'work' | 'education' | 'military' | 'milestone' | 'other';
  title: string;
  description?: string;
  startYear?: number;
  endYear?: number | null;
}

export interface FamilyAttachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
}

export interface FamilyTreeDto {
  id: string;
  name: string;
  surname?: string;
  domain: string;
  ownerId: string;
  rootGeneration: number;
  zibeiPoem?: string[];
  canManagePermissions?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyTreeVisibilityDto {
  treeId: string;
  userViewers: string[];
  userEditors: string[];
  domainViewers: string[];
  domainEditors: string[];
}

export interface FamilyPersonDto {
  id: string;
  treeId: string;
  linkedTreeId?: string;
  linkedPersonId?: string;
  linkedTreeName?: string;
  linkedPersonName?: string;
  name: string;
  aliases?: string[];
  gender?: 'male' | 'female' | 'unknown';
  generation: number;
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

export interface FamilyRelationshipDto {
  id: string;
  type: 'parent-child' | 'spouse';
  fromId: string;
  toId: string;
  parentRole?: string;
  childStatus?: string;
  lineageType?: string;
  displayTag?: string;
  sourceParentId?: string;
  sourceChildRank?: number;
  sortOrder?: number;
  unionType?: string;
  startYear?: number;
  endYear?: number | null;
  notes?: string;
}

export interface FamilyDocumentDto {
  id: string;
  treeId: string;
  type: 'history' | 'photo-album' | 'celebration' | 'certificate' | 'record' | 'announcement';
  title: string;
  body?: string;
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

// ─── Section & Page types ───────────────────────────────────────────────────

export interface FamilySectionDto {
  id: string;
  treeId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageElementDto {
  id: string;
  type: 'text' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  imageUrl?: string;
  zIndex: number;
}

export interface FamilyPageDto {
  id: string;
  sectionId: string;
  treeId: string;
  pageNumber: number;
  elements: PageElementDto[];
  createdAt: string;
  updatedAt: string;
}

export interface FamilyPageSummaryDto {
  id: string;
  pageNumber: number;
}

export interface CreateFamilyTreeRequest {
  name: string;
  surname?: string;
  domain?: string;
  rootGeneration?: number;
  zibeiPoem?: string[];
}

export interface UpdateFamilyTreeVisibilityRequest {
  userViewers?: string[];
  userEditors?: string[];
  domainViewers?: string[];
  domainEditors?: string[];
}

export interface NestedFamilyPersonImport {
  name: string;
  gender?: 'male' | 'female' | 'unknown';
  spouse?: string;
  spouseGender?: 'male' | 'female' | 'unknown';
  birthYear?: number;
  deathYear?: number;
  children?: NestedFamilyPersonImport[];
}

export interface FamilyNode extends FamilyPersonDto {
  canonicalPersonId?: string;
  children: FamilyNode[];
  spouses: FamilyNode[];
  parentRels: FamilyRelationshipDto[];
  spouseRels: FamilyRelationshipDto[];
}

export interface FullTreeResponse {
  tree: FamilyTreeDto;
  persons: FamilyPersonDto[];
  relationships: FamilyRelationshipDto[];
}

export interface ImportTreeArchiveRequest {
  file: File;
  name?: string;
  domain?: string;
}

export interface ExportTreeArchiveResult {
  blob: Blob;
  fileName: string;
}

type UpsertFamilyPersonPayload = Partial<FamilyPersonDto> & {
  clearLinkedPerson?: boolean;
  clearBirthDate?: boolean;
  clearDeathDate?: boolean;
};

export function buildFamilyNodes(
  persons: FamilyPersonDto[],
  rels: FamilyRelationshipDto[]
): FamilyNode[] {
  const map = new Map(persons.map(p => [
    p.id,
    { ...p, canonicalPersonId: p.id, children: [], spouses: [], parentRels: [], spouseRels: [] } as FamilyNode
  ]));

  const pcRels = rels
    .filter(r => r.type === 'parent-child')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const spRels = rels.filter(r => r.type === 'spouse');

  // sortOrder is interpreted as left-to-right display order, where the rightmost child is eldest.
  // In other words: smaller sortOrder renders further left, larger sortOrder renders further right.

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

  return [...map.values()];
}

export function buildTree(
  persons: FamilyPersonDto[],
  rels: FamilyRelationshipDto[]
): FamilyNode | null {
  const canonicalNodes = buildFamilyNodes(persons, rels);
  const canonicalMap = new Map(canonicalNodes.map(node => [node.id, node]));

  const childIds = new Set(
    canonicalNodes.flatMap(node => node.parentRels.map(rel => rel.toId))
  );
  const roots = canonicalNodes.filter(node => !childIds.has(node.id));
  const root = roots[0] ?? canonicalNodes[0] ?? null;
  if (!root) return null;

  const isAdoptiveParentRel = (rel?: FamilyRelationshipDto) => rel?.displayTag === '继子' || rel?.lineageType === 'adoptive';

  const shouldProjectChildren = (canonicalNode: FamilyNode, parentRel?: FamilyRelationshipDto) => {
    const hasAdoptiveParent = canonicalNode.parentRels.some(rel => isAdoptiveParentRel(rel));
    if (!hasAdoptiveParent) {
      return true;
    }

    if (!parentRel) {
      return canonicalNode.parentRels.length === 0;
    }

    return isAdoptiveParentRel(parentRel);
  };

  const cloneBranch = (
    canonicalNode: FamilyNode,
    parentRel?: FamilyRelationshipDto,
    displayPath: Set<string> = new Set()
  ): FamilyNode => {
    const displayId = parentRel ? `${canonicalNode.id}@@${parentRel.fromId}` : canonicalNode.id;
    const displayKey = `${displayId}|${parentRel?.id ?? 'root'}`;
    if (displayPath.has(displayKey)) {
      return {
        ...canonicalNode,
        id: displayId,
        canonicalPersonId: canonicalNode.id,
        children: [],
        spouses: canonicalNode.spouses,
        parentRels: parentRel ? [parentRel] : [],
        spouseRels: canonicalNode.spouseRels,
      };
    }

    const nextPath = new Set(displayPath);
    nextPath.add(displayKey);

    return {
      ...canonicalNode,
      id: displayId,
      canonicalPersonId: canonicalNode.id,
      children: shouldProjectChildren(canonicalNode, parentRel)
        ? canonicalNode.children.map(child => {
            const childCanonical = canonicalMap.get(child.id) ?? child;
            const childRel = child.parentRels.find(rel => rel.type === 'parent-child' && rel.fromId === canonicalNode.id);
            return cloneBranch(childCanonical, childRel, nextPath);
          })
        : [],
      spouses: canonicalNode.spouses,
      parentRels: parentRel ? [parentRel] : [],
      spouseRels: canonicalNode.spouseRels,
    };
  };

  return cloneBranch(root);
}

class FamilyService {
  async listTrees(): Promise<FamilyTreeDto[]> {
    const res = await apiClient.get<FamilyTreeDto[]>('/family');
    return res.data;
  }

  async createTree(data: CreateFamilyTreeRequest): Promise<FamilyTreeDto> {
    const res = await apiClient.post<FamilyTreeDto>('/family', data);
    return res.data;
  }

  async updateTree(treeId: string, data: Partial<FamilyTreeDto>): Promise<FamilyTreeDto> {
    const res = await apiClient.put<FamilyTreeDto>(`/family/${treeId}`, data);
    return res.data;
  }

  async deleteTree(treeId: string): Promise<void> {
    await apiClient.delete(`/family/${treeId}`);
  }

  async getTree(treeId: string): Promise<FullTreeResponse> {
    const res = await apiClient.get<FullTreeResponse>(`/family/${treeId}`);
    return res.data;
  }

  async getTreeVisibility(treeId: string): Promise<FamilyTreeVisibilityDto> {
    const res = await apiClient.get<FamilyTreeVisibilityDto>(`/family/${treeId}/visibility`);
    return res.data;
  }

  async updateTreeVisibility(treeId: string, data: UpdateFamilyTreeVisibilityRequest): Promise<FamilyTreeVisibilityDto> {
    const res = await apiClient.put<FamilyTreeVisibilityDto>(`/family/${treeId}/visibility`, data);
    return res.data;
  }

  async addPerson(treeId: string, data: UpsertFamilyPersonPayload): Promise<FamilyPersonDto> {
    const res = await apiClient.post<FamilyPersonDto>(`/family/${treeId}/persons`, data);
    return res.data;
  }

  async updatePerson(treeId: string, personId: string, data: UpsertFamilyPersonPayload): Promise<FamilyPersonDto> {
    const res = await apiClient.put<FamilyPersonDto>(`/family/${treeId}/persons/${personId}`, data);
    return res.data;
  }

  async deletePerson(treeId: string, personId: string): Promise<void> {
    await apiClient.delete(`/family/${treeId}/persons/${personId}`);
  }

  async addRelationship(treeId: string, rel: Omit<FamilyRelationshipDto, 'id'>): Promise<FamilyRelationshipDto> {
    const res = await apiClient.post<FamilyRelationshipDto>(`/family/${treeId}/relationships`, rel);
    return res.data;
  }

  async updateRelationship(treeId: string, relId: string, data: {
    parentRole?: string;
    childStatus?: string;
    lineageType?: string;
    displayTag?: string;
    sourceParentId?: string;
    sourceChildRank?: number;
    sortOrder?: number;
    notes?: string;
  }): Promise<FamilyRelationshipDto> {
    const res = await apiClient.put<FamilyRelationshipDto>(`/family/${treeId}/relationships/${relId}`, data);
    return res.data;
  }

  async deleteRelationship(treeId: string, relId: string): Promise<void> {
    await apiClient.delete(`/family/${treeId}/relationships/${relId}`);
  }

  async exportTree(treeId: string): Promise<FullTreeResponse> {
    const res = await apiClient.get<FullTreeResponse>(`/family/${treeId}/export`);
    return res.data;
  }

  async exportTreeArchive(treeId: string): Promise<ExportTreeArchiveResult> {
    const res = await apiClient.get<Blob>(`/family/${treeId}/export-archive`, {
      responseType: 'blob',
    });

    const disposition = String(res.headers['content-disposition'] ?? '');
    const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const rawFileName = fileNameMatch?.[1] ?? fileNameMatch?.[2] ?? 'family-tree.zip';

    return {
      blob: res.data,
      fileName: decodeURIComponent(rawFileName),
    };
  }

  async importTree(treeId: string, root: NestedFamilyPersonImport): Promise<{ personsAdded: number; relationshipsAdded: number }> {
    const res = await apiClient.post<{ personsAdded: number; relationshipsAdded: number }>(`/family/${treeId}/import`, root);
    return res.data;
  }

  async importTreeArchive(data: ImportTreeArchiveRequest): Promise<FamilyTreeDto> {
    const formData = new FormData();
    formData.append('file', data.file);
    if (data.name) {
      formData.append('name', data.name);
    }
    if (data.domain) {
      formData.append('domain', data.domain);
    }

    const res = await apiClient.post<FamilyTreeDto>('/family/import-archive', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  async listSections(treeId: string): Promise<FamilySectionDto[]> {
    const res = await apiClient.get<FamilySectionDto[]>(`/family/${treeId}/sections`);
    return res.data;
  }

  async createSection(treeId: string, data: { name: string; sortOrder?: number }): Promise<FamilySectionDto> {
    const res = await apiClient.post<FamilySectionDto>(`/family/${treeId}/sections`, data);
    return res.data;
  }

  async updateSection(treeId: string, sectionId: string, data: { name?: string; sortOrder?: number }): Promise<FamilySectionDto> {
    const res = await apiClient.put<FamilySectionDto>(`/family/${treeId}/sections/${sectionId}`, data);
    return res.data;
  }

  async deleteSection(treeId: string, sectionId: string): Promise<void> {
    await apiClient.delete(`/family/${treeId}/sections/${sectionId}`);
  }

  // ── Pages ─────────────────────────────────────────────────────────────────

  async listPages(treeId: string, sectionId: string): Promise<FamilyPageSummaryDto[]> {
    const res = await apiClient.get<FamilyPageSummaryDto[]>(`/family/${treeId}/sections/${sectionId}/pages`);
    return res.data;
  }

  async getPage(treeId: string, pageId: string): Promise<FamilyPageDto> {
    const res = await apiClient.get<FamilyPageDto>(`/family/${treeId}/pages/${pageId}`);
    return res.data;
  }

  async createPage(treeId: string, sectionId: string, data?: { pageNumber?: number }): Promise<FamilyPageDto> {
    const res = await apiClient.post<FamilyPageDto>(`/family/${treeId}/sections/${sectionId}/pages`, data ?? {});
    return res.data;
  }

  async updatePage(treeId: string, pageId: string, data: { elements?: PageElementDto[]; pageNumber?: number }): Promise<FamilyPageDto> {
    const res = await apiClient.put<FamilyPageDto>(`/family/${treeId}/pages/${pageId}`, data);
    return res.data;
  }

  async deletePage(treeId: string, pageId: string): Promise<void> {
    await apiClient.delete(`/family/${treeId}/pages/${pageId}`);
  }

  async seedSections(): Promise<{ message: string; treeId?: string }> {
    const res = await apiClient.post<{ message: string; treeId?: string }>('/family/seed-sections');
    return res.data;
  }

  // ── Tree Notebook Bridge ──

  async getTreeNotebook(treeId: string): Promise<{ notebookId: string | null }> {
    const res = await apiClient.get<{ notebookId: string | null }>(`/family/${treeId}/notebook`);
    return res.data;
  }

  async getOrCreateTreeNotebook(treeId: string): Promise<{ notebookId: string }> {
    const res = await apiClient.post<{ notebookId: string }>(`/family/${treeId}/notebook`);
    return res.data;
  }
}

export const familyService = new FamilyService();
