import apiClient from '@/utils/api';

export interface MusicCatalogField {
  key: string;
  label?: string;
  labels?: Record<string, string>;
  type?: string;
  role?: string;
  visible?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  primary?: boolean;
  width?: number;
}

export interface MusicCatalogRecord {
  id: string;
  data: Record<string, unknown>;
  playback: {
    relativeAudioPath: string;
    startSeconds?: number;
    endSeconds?: number | null;
  };
}

export interface MusicCatalog {
  schemaVersion?: string;
  generatedAt?: string;
  schema: {
    fields: MusicCatalogField[];
  };
  records: MusicCatalogRecord[];
  [key: string]: unknown;
}

export interface MusicPlaybackUrl {
  url: string;
  expiresAt: string;
}

class MusicService {
  async getCatalog(): Promise<MusicCatalog> {
    const response = await apiClient.get<MusicCatalog>('/music/catalog');
    const catalog = response.data;
    if (!catalog?.schema?.fields || !Array.isArray(catalog.records)) {
      throw new Error('The music catalog schema is invalid.');
    }
    return catalog;
  }

  async createPlaybackUrl(recordId: string): Promise<MusicPlaybackUrl> {
    const response = await apiClient.post<MusicPlaybackUrl>(
      `/music/records/${encodeURIComponent(recordId)}/playback-url`,
    );
    return response.data;
  }
}

export const musicService = new MusicService();
