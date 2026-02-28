import apiClient from '@/utils/api';

export interface AvatarImage {
  avatarImageId: string;
  emotion: string | null;
  imageUrl: string;
  sourceAvatarId?: string;
  createdAt: string;
}

export interface GenerateEmotionsResponse {
  jobId: string;
  status: string;
  message: string;
}

export interface UploadAvatarResponse {
  avatarImageId: string;
  imageUrl: string;
  fileName: string;
  fileSize: number;
}

export interface SelectableAvatar {
  avatarImageId: string;
  imageUrl: string;
  thumbnailDataUrl?: string;  // Base64 data URL for instant display
  fullImageDataUrl?: string | null;  // Base64 data URL for full image (only when includeFull=true)
  fullImageUrl: string;
  fileName: string;
  fileSize: number;
  ownerUserId: string;
  createdAt: string;
}

export interface SelectableAvatarResponse {
  items: SelectableAvatar[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface EmotionThumbnailResult {
  avatarImageId: string;
  emotion: string;
  imageUrl: string;
  thumbnailDataUrl?: string | null;
}

export interface EmotionFullResult {
  avatarImageId: string;
  emotion: string;
  imageUrl: string;
  fullImageDataUrl?: string | null;
}

export interface EmotionThumbnailsResponse {
  sourceAvatarId: string;
  emotions: string[];
  results: EmotionThumbnailResult[];
}

class AvatarService {
  async uploadAvatar(file: File): Promise<UploadAvatarResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<UploadAvatarResponse>('/avatar/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  }

  async getAvatarImage(avatarImageId: string): Promise<string> {
    // Returns the full URL to the avatar image
    return `/api/avatar/image/${avatarImageId}`;
  }

  async generateEmotions(avatarId: string): Promise<GenerateEmotionsResponse> {
    const response = await apiClient.post<GenerateEmotionsResponse>('/imagegeneration/generate', {
      sourceType: 'avatar',
      generationType: 'emotions',
      mode: 'replace',
      avatarId,
    });

    return response.data;
  }

  async getPredefinedAvatar(fileName: string): Promise<UploadAvatarResponse> {
    const response = await apiClient.get<UploadAvatarResponse>(`/avatar/predefined/${encodeURIComponent(fileName)}`);
    return response.data;
  }

  async getSelectableAvatars(page: number, pageSize: number): Promise<SelectableAvatarResponse> {
    const response = await apiClient.get<SelectableAvatarResponse>('/avatar/originals', {
      params: { page, pageSize },
    });
    return response.data;
  }

  async getSelectableAvatarsFull(page: number, pageSize: number): Promise<SelectableAvatarResponse> {
    const response = await apiClient.get<SelectableAvatarResponse>('/avatar/originals', {
      params: { page, pageSize, includeFull: true },
    });
    return response.data;
  }

  async getUserEmotionAvatars(userId: string): Promise<AvatarImage[]> {
    const response = await apiClient.get<AvatarImage[]>(`/avatar/${userId}/emotions`);
    return response.data;
  }

  async getEmotionThumbnails(sourceAvatarId: string): Promise<EmotionThumbnailResult[]> {
    const response = await apiClient.get<{ results: EmotionThumbnailResult[] }>(
      `/avatar/emotion-thumbnails/${sourceAvatarId}`
    );
    return response.data.results || [];
  }

  async getEmotionThumbnailsMeta(sourceAvatarId: string): Promise<EmotionThumbnailsResponse> {
    const response = await apiClient.get<EmotionThumbnailsResponse>(
      `/avatar/emotion-thumbnails/${sourceAvatarId}`
    );
    return response.data;
  }

  async getEmotionThumbnailsFull(sourceAvatarId: string): Promise<EmotionFullResult[]> {
    const response = await apiClient.get<{ results: EmotionFullResult[] }>(
      `/avatar/emotion-thumbnails/${sourceAvatarId}`,
      { params: { includeFull: true } }
    );
    return response.data.results || [];
  }

  async deleteAvatar(avatarImageId: string): Promise<void> {
    await apiClient.delete(`/avatar/${avatarImageId}`);
  }
}

export const avatarService = new AvatarService();
