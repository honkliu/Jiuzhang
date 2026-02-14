import apiClient from '@/utils/api';

export interface User {
  id: string;
  domain?: string;
  isAdmin?: boolean;
  isDisabled?: boolean;
  handle: string;
  displayName: string;
  avatarUrl: string;
  gender?: 'male' | 'female';
  bio: string;
  isOnline: boolean;
  lastSeen: string;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  fromUser: User;
}

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

  async updateProfile(data: { displayName?: string; bio?: string; avatarUrl?: string; gender?: 'male' | 'female' }): Promise<User> {
    const response = await apiClient.put<User>('/contact/me', data);
    return response.data;
  }
}

export const contactService = new ContactService();
