import apiClient from '@/utils/api';

export interface UploadResponse {
  url: string;
  fileName: string;
  contentType: string;
  size: number;
}

class MediaService {
  async upload(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<UploadResponse>('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  }
}

export const mediaService = new MediaService();
