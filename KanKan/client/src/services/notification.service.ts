import apiClient from '@/utils/api';

export interface NotificationDto {
  id: string;
  category: string;
  chatId?: string;
  messageId?: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

class NotificationService {
  async getNotifications(params?: { unreadOnly?: boolean; limit?: number; before?: string }): Promise<NotificationDto[]> {
    const qs = new URLSearchParams();
    if (params?.unreadOnly) qs.set('unreadOnly', 'true');
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.before) qs.set('before', params.before);

    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await apiClient.get<NotificationDto[]>(`/notifications${suffix}`);
    return res.data;
  }

  async getUnreadCount(): Promise<number> {
    const res = await apiClient.get<number>('/notifications/unread-count');
    return res.data;
  }

  async markRead(notificationId: string): Promise<void> {
    await apiClient.post(`/notifications/${notificationId}/read`, {});
  }

  async markAllRead(): Promise<void> {
    await apiClient.post('/notifications/read-all', {});
  }
}

export const notificationService = new NotificationService();
