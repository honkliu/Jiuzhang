import apiClient from '@/utils/api';
import type { PhotoDto } from '@/services/photo.service';

class AdminGalleryService {
  async listPhotos(): Promise<PhotoDto[]> {
    const response = await apiClient.get<PhotoDto[]>('/admin/gallery/photos');
    return response.data;
  }

  async deletePhoto(id: string): Promise<void> {
    await apiClient.delete(`/admin/gallery/photos/${encodeURIComponent(id)}`);
  }
}

export const adminGalleryService = new AdminGalleryService();
