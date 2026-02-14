import apiClient from '@/utils/api';
import { User } from '@/services/contact.service';

class AdminService {
  async getUsers(limit = 200): Promise<User[]> {
    const response = await apiClient.get<User[]>(`/admin/users?limit=${limit}`);
    return response.data;
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    const response = await apiClient.delete<{ message: string }>(`/admin/users/${userId}`);
    return response.data;
  }

  async disableUser(userId: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(`/admin/users/${userId}/disable`);
    return response.data;
  }

  async enableUser(userId: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(`/admin/users/${userId}/enable`);
    return response.data;
  }
}

export const adminService = new AdminService();
