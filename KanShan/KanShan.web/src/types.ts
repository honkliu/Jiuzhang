export type UserDto = {
  id: string;
  userName: string;
  displayName: string;
};

export type AuthResponse = {
  accessToken: string;
  user: UserDto;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderDisplayName: string;
  text?: string | null;
  imageUrl?: string | null;
  clientMessageId?: string | null;
  isRecalled?: boolean;
  recalledAt?: string | null;
  recalledByUserId?: string | null;
  createdAt: string;
};

export type ConversationParticipantDto = {
  userId: string;
  userName: string;
  displayName: string;
  role: string;
};

export type ConversationSummaryDto = {
  id: string;
  type: string;
  title: string;
  participants: ConversationParticipantDto[];
  lastMessage?: MessageDto | null;
  unreadCount: number;
  createdAt: string;
};

export type ConversationDto = {
  id: string;
  type: string;
  title: string;
  participants: ConversationParticipantDto[];
  createdAt: string;
};
