import apiClient from '@/utils/api';

export interface Participant {
  userId: string;
  displayName: string;
  avatarUrl: string;
  gender?: 'male' | 'female';
  isOnline: boolean;
}

export interface LastMessage {
  text: string;
  senderId: string;
  senderName: string;
  messageType: string;
  timestamp: string;
}

export interface Chat {
  id: string;
  chatType: string;
  name: string;
  avatar: string;
  participants: Participant[];
  adminIds: string[];
  lastMessage: LastMessage | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderGender?: string;
  messageType: string;
  text?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileName?: string;
  fileSize?: string;
  replyTo?: string;
  timestamp: string;
  deliveredTo: string[];
  readBy: string[];
  reactions: Record<string, string>;
  isDeleted: boolean;
}

export interface CreateChatRequest {
  chatType?: string;
  participantIds: string[];
  groupName?: string;
  groupAvatar?: string;
}

export interface SendMessageRequest {
  messageType?: string;
  text?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileName?: string;
  fileSize?: string;
  replyTo?: string;
}

export interface UpdateChatRequest {
  groupName?: string;
  groupAvatar?: string;
}

class ChatService {
  async getChats(): Promise<Chat[]> {
    const response = await apiClient.get<Chat[]>('/chat');
    return response.data;
  }

  async getChat(chatId: string): Promise<Chat> {
    const response = await apiClient.get<Chat>(`/chat/${chatId}`);
    return response.data;
  }

  async createChat(request: CreateChatRequest): Promise<Chat> {
    const response = await apiClient.post<Chat>('/chat', request);
    return response.data;
  }

  async deleteChat(chatId: string): Promise<void> {
    await apiClient.delete(`/chat/${chatId}`);
  }

  async updateChat(chatId: string, request: UpdateChatRequest): Promise<Chat> {
    const response = await apiClient.put<Chat>(`/chat/${chatId}`, request);
    return response.data;
  }

  async hideChat(chatId: string): Promise<void> {
    await apiClient.post(`/chat/${chatId}/hide`, {});
  }

  async unhideChat(chatId: string): Promise<void> {
    await apiClient.post(`/chat/${chatId}/unhide`, {});
  }

  async clearChat(chatId: string): Promise<void> {
    await apiClient.post(`/chat/${chatId}/clear`, {});
  }

  async getMessages(chatId: string, limit = 50, before?: string): Promise<Message[]> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (before) {
      params.append('before', before);
    }
    const response = await apiClient.get<Message[]>(`/chat/${chatId}/messages?${params}`);
    return response.data;
  }

  async sendMessage(chatId: string, request: SendMessageRequest): Promise<Message> {
    const response = await apiClient.post<Message>(`/chat/${chatId}/messages`, request);
    return response.data;
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    await apiClient.delete(`/chat/${chatId}/messages/${messageId}`);
  }
}

export const chatService = new ChatService();
