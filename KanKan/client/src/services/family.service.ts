import apiClient from '@/utils/api';

export interface FamilyDate {
  year: number;
  month?: number;
  day?: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface FamilyPersonDto {
  id: string;
  treeId: string;
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
  experiences?: FamilyExperience[];
}

export interface FamilyRelationshipDto {
  id: string;
  type: 'parent-child' | 'spouse';
  fromId: string;
  toId: string;
  parentRole?: string;
  childStatus?: string;
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

export interface FamilyNode extends FamilyPersonDto {
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

export function buildTree(
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

  // Sort children: older (earlier birth year) on the right = later in array
  // This matches Chinese genealogy convention: 长子在右
  for (const node of map.values()) {
    if (node.children.length > 1) {
      node.children.sort((a, b) => {
        const ya = a.birthDate?.year ?? 9999;
        const yb = b.birthDate?.year ?? 9999;
        // Younger first (left), older last (right)
        return yb - ya;
      });
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

class FamilyService {
  async listTrees(): Promise<FamilyTreeDto[]> {
    const res = await apiClient.get<FamilyTreeDto[]>('/family');
    return res.data;
  }

  async createTree(data: Partial<FamilyTreeDto>): Promise<FamilyTreeDto> {
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

  async addPerson(treeId: string, data: Partial<FamilyPersonDto>): Promise<FamilyPersonDto> {
    const res = await apiClient.post<FamilyPersonDto>(`/family/${treeId}/persons`, data);
    return res.data;
  }

  async updatePerson(treeId: string, personId: string, data: Partial<FamilyPersonDto>): Promise<FamilyPersonDto> {
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

  async updateRelationship(treeId: string, relId: string, data: { sortOrder?: number; notes?: string }): Promise<FamilyRelationshipDto> {
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
}

export const familyService = new FamilyService();
