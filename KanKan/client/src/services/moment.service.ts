import apiClient from '@/utils/api';

export interface MomentContent {
  text?: string;
  mediaUrls?: string[];
  location?: string;
}

export interface Moment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: MomentContent;
  visibility: 'public' | 'friends' | 'private';
  createdAt: string;
  likes: Array<{ userId: string; userName: string; timestamp: string }>;
  comments: Array<{ id: string; userId: string; userName: string; userAvatar: string; text: string; timestamp: string }>;
}

export interface CreateMomentRequest {
  text?: string;
  mediaUrls?: string[];
  location?: string;
  visibility?: 'public' | 'friends' | 'private';
}

class MomentService {
  async getMoments(limit = 50, before?: string): Promise<Moment[]> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (before) {
      params.append('before', before);
    }
    const response = await apiClient.get<Moment[]>(`/pa?${params}`);
    return response.data;
  }

  async createMoment(request: CreateMomentRequest): Promise<Moment> {
    const response = await apiClient.post<Moment>('/pa', request);
    return response.data;
  }

  async deleteMoment(momentId: string): Promise<void> {
    await apiClient.delete(`/pa/${momentId}`);
  }

  async toggleLike(momentId: string): Promise<Moment> {
    const response = await apiClient.post<Moment>(`/pa/${momentId}/likes`, {});
    return response.data;
  }

  async addComment(momentId: string, text: string): Promise<Moment> {
    const response = await apiClient.post<Moment>(`/pa/${momentId}/comments`, { text });
    return response.data;
  }
}

export const momentService = new MomentService();
