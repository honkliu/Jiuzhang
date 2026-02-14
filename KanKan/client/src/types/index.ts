// User types
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
  phoneNumber?: string;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

// Auth types
export interface RegisterRequest {
  email: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

// Chat types
export interface Chat {
  id: string;
  chatType: 'direct' | 'group';
  participants: ChatParticipant[];
  groupName?: string;
  groupAvatar?: string;
  adminIds?: string[];
  lastMessage?: LastMessage;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string;
  gender?: 'male' | 'female';
  joinedAt: string;
}

export interface LastMessage {
  text: string;
  senderId: string;
  senderName: string;
  messageType: MessageType;
  timestamp: string;
}

// Message types
export type MessageType = 'text' | 'image' | 'video' | 'voice' | 'file';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  sender?: User;
  messageType: MessageType;
  content: MessageContent;
  timestamp: string;
  deliveredTo: string[];
  readBy: string[];
  reactions?: { [userId: string]: string };
  replyTo?: string;
  isDeleted: boolean;
}

export interface MessageContent {
  text?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileName?: string;
  fileSize?: string;
}

export interface SendMessageRequest {
  messageType: MessageType;
  text?: string;
  mediaUrl?: string;
  replyTo?: string;
}

// Contact types
export interface Contact {
  id: string;
  userId: string;
  contactId: string;
  displayName: string;
  avatarUrl: string;
  remark?: string;
  status: 'pending' | 'accepted' | 'blocked';
  addedAt: string;
  tags?: string[];
  isFavorite: boolean;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUser: User;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  createdAt: string;
}

// Moment types
export interface Moment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: MomentContent;
  visibility: 'public' | 'friends' | 'private';
  createdAt: string;
  likes: MomentLike[];
  comments: MomentComment[];
}

export interface MomentContent {
  text?: string;
  mediaUrls?: string[];
  location?: string;
}

export interface MomentLike {
  userId: string;
  userName: string;
  timestamp: string;
}

export interface MomentComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: string;
}

// Redux State types
export interface RootState {
  auth: AuthState;
  chat: ChatState;
  contact: ContactState;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

export interface ChatState {
  selectedChatId: string | null;
  chats: Chat[];
  messages: { [chatId: string]: Message[] };
  typingUsers: { [chatId: string]: string[] };
  loading: boolean;
  error: string | null;
}

export interface ContactState {
  contacts: Contact[];
  friendRequests: FriendRequest[];
  loading: boolean;
  error: string | null;
}

// API Error type
export interface ApiError {
  message: string;
  statusCode: number;
  errors?: { [key: string]: string[] };
}

// SignalR Event types
export interface TypingIndicatorEvent {
  chatId: string;
  userId: string;
  isTyping: boolean;
}

export interface MessageStatusEvent {
  messageId: string;
  userId: string;
  status: 'delivered' | 'read';
}

export interface UserStatusEvent {
  userId: string;
  isOnline: boolean;
}
