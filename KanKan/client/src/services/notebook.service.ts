import apiClient from '@/utils/api';
import type { PageElementDto } from '@/services/family.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NotebookDto {
  id: string;
  name: string;
  domain: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerEmail: string;
  canEdit: boolean;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookVisibilityDto {
  notebookId: string;
  userViewers: string[];
  userEditors: string[];
  domainViewers: string[];
  domainEditors: string[];
}

export interface NotebookSectionDto {
  id: string;
  notebookId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookPageDto {
  id: string;
  sectionId: string;
  notebookId: string;
  pageNumber: number;
  elements: PageElementDto[];
  createdAt: string;
  updatedAt: string;
}

export interface NotebookPageSummaryDto {
  id: string;
  pageNumber: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

class NotebookService {
  // ── Notebook CRUD ──

  async list(): Promise<NotebookDto[]> {
    const res = await apiClient.get<NotebookDto[]>('/notebook');
    return res.data;
  }

  async get(notebookId: string): Promise<NotebookDto> {
    const res = await apiClient.get<NotebookDto>(`/notebook/${notebookId}`);
    return res.data;
  }

  async create(data: { name: string; domain?: string }): Promise<NotebookDto> {
    const res = await apiClient.post<NotebookDto>('/notebook', data);
    return res.data;
  }

  async update(notebookId: string, data: { name?: string }): Promise<NotebookDto> {
    const res = await apiClient.put<NotebookDto>(`/notebook/${notebookId}`, data);
    return res.data;
  }

  async delete(notebookId: string): Promise<void> {
    await apiClient.delete(`/notebook/${notebookId}`);
  }

  // ── Visibility ──

  async getVisibility(notebookId: string): Promise<NotebookVisibilityDto> {
    const res = await apiClient.get<NotebookVisibilityDto>(`/notebook/${notebookId}/visibility`);
    return res.data;
  }

  async updateVisibility(notebookId: string, data: Partial<NotebookVisibilityDto>): Promise<NotebookVisibilityDto> {
    const res = await apiClient.put<NotebookVisibilityDto>(`/notebook/${notebookId}/visibility`, data);
    return res.data;
  }

  // ── Sections ──

  async listSections(notebookId: string): Promise<NotebookSectionDto[]> {
    const res = await apiClient.get<NotebookSectionDto[]>(`/notebook/${notebookId}/sections`);
    return res.data;
  }

  async createSection(notebookId: string, data: { name: string; sortOrder?: number }): Promise<NotebookSectionDto> {
    const res = await apiClient.post<NotebookSectionDto>(`/notebook/${notebookId}/sections`, data);
    return res.data;
  }

  async updateSection(notebookId: string, sectionId: string, data: { name?: string; sortOrder?: number }): Promise<NotebookSectionDto> {
    const res = await apiClient.put<NotebookSectionDto>(`/notebook/${notebookId}/sections/${sectionId}`, data);
    return res.data;
  }

  async deleteSection(notebookId: string, sectionId: string): Promise<void> {
    await apiClient.delete(`/notebook/${notebookId}/sections/${sectionId}`);
  }

  // ── Pages ──

  async listPages(notebookId: string, sectionId: string): Promise<NotebookPageSummaryDto[]> {
    const res = await apiClient.get<NotebookPageSummaryDto[]>(`/notebook/${notebookId}/sections/${sectionId}/pages`);
    return res.data;
  }

  async getPage(notebookId: string, pageId: string): Promise<NotebookPageDto> {
    const res = await apiClient.get<NotebookPageDto>(`/notebook/${notebookId}/pages/${pageId}`);
    return res.data;
  }

  async createPage(notebookId: string, sectionId: string, data?: { pageNumber?: number }): Promise<NotebookPageDto> {
    const res = await apiClient.post<NotebookPageDto>(`/notebook/${notebookId}/sections/${sectionId}/pages`, data ?? {});
    return res.data;
  }

  async updatePage(notebookId: string, pageId: string, data: { elements?: PageElementDto[]; pageNumber?: number }): Promise<NotebookPageDto> {
    const res = await apiClient.put<NotebookPageDto>(`/notebook/${notebookId}/pages/${pageId}`, data);
    return res.data;
  }

  async deletePage(notebookId: string, pageId: string): Promise<void> {
    await apiClient.delete(`/notebook/${notebookId}/pages/${pageId}`);
  }

  // ── Import/Export ──

  async exportArchive(notebookId: string): Promise<{ blob: Blob; fileName: string }> {
    const res = await apiClient.get<Blob>(`/notebook/${notebookId}/export-archive`, { responseType: 'blob' });
    const disposition = String(res.headers['content-disposition'] ?? '');
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const rawFileName = match?.[1] ?? match?.[2] ?? 'notebook.zip';
    return { blob: res.data, fileName: decodeURIComponent(rawFileName) };
  }

  async importArchive(notebookId: string, file: File): Promise<{ message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<{ message: string }>(`/notebook/${notebookId}/import-archive`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }
}

export const notebookService = new NotebookService();
