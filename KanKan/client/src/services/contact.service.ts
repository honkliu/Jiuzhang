import apiClient from '@/utils/api';
import type { FriendRequest, User } from '@/types';
export type { FriendRequest, User } from '@/types';

class ContactService {
  async searchUsers(query: string): Promise<User[]> {
    const response = await apiClient.get<User[]>(`/contact/search?q=${encodeURIComponent(query)}`);
    return response.data;
  }

  async getAllUsers(): Promise<User[]> {
    const response = await apiClient.get<User[]>('/contact');
    return response.data;
  }

  async getContacts(): Promise<User[]> {
    const response = await apiClient.get<User[]>('/contact/contacts');
    return response.data;
  }

  async getFriendRequests(): Promise<FriendRequest[]> {
    const response = await apiClient.get<FriendRequest[]>('/contact/requests');
    return response.data;
  }

  async sendFriendRequest(userId: string): Promise<void> {
    await apiClient.post('/contact/requests', { userId });
  }

  async acceptFriendRequest(fromUserId: string): Promise<void> {
    await apiClient.post(`/contact/requests/${fromUserId}/accept`);
  }

  async rejectFriendRequest(fromUserId: string): Promise<void> {
    await apiClient.post(`/contact/requests/${fromUserId}/reject`);
  }

  async removeFriend(userId: string): Promise<void> {
    await apiClient.delete(`/contact/friends/${userId}`);
  }

  async getUser(userId: string): Promise<User> {
    const response = await apiClient.get<User>(`/contact/${userId}`);
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/contact/me');
    return response.data;
  }

  async updateProfile(data: { displayName?: string; bio?: string; avatarUrl?: string; avatarImageId?: string | null; gender?: 'male' | 'female' }): Promise<User> {
    const response = await apiClient.put<User>('/contact/me', data);
    return response.data;
  }
}

export const contactService = new ContactService();
