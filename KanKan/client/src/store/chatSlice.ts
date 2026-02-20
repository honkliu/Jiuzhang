import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { chatService, Chat, Message } from '@/services/chat.service';
import { WA_USER_ID } from '@/utils/chatParticipants';

interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Record<string, Message[]>; // chatId -> messages
  loading: boolean;
  error: string | null;
  typingUsers: Record<string, { userId: string; userName: string }[]>; // chatId -> typing users
  drafts: Record<string, Record<string, { userName: string; text: string }>>; // chatId -> userId -> draft
}

const initialState: ChatState = {
  chats: [],
  activeChat: null,
  messages: {},
  loading: false,
  error: null,
  typingUsers: {},
  drafts: {},
};

const isWaOnlyChat = (chat: Chat): boolean => {
  const participants = chat.participants ?? [];
  const hasWa = participants.some((p) => p.userId === WA_USER_ID);
  const realParticipants = participants.filter((p) => p.userId && p.userId !== WA_USER_ID);
  return hasWa && realParticipants.length <= 1;
};

// Async thunks
export const fetchChats = createAsyncThunk('chat/fetchChats', async () => {
  return await chatService.getChats();
});

export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async ({ chatId, limit, before }: { chatId: string; limit?: number; before?: string }) => {
    const messages = await chatService.getMessages(chatId, limit, before);
    return { chatId, messages };
  }
);

export const createChat = createAsyncThunk(
  'chat/createChat',
  async (request: { participantIds: string[]; chatType?: string; groupName?: string }) => {
    return await chatService.createChat(request);
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveChat: (state, action: PayloadAction<Chat | null>) => {
      state.activeChat = action.payload;
    },
    incrementUnread: (state, action: PayloadAction<{ chatId: string; by?: number }>) => {
      const { chatId, by } = action.payload;
      const inc = by ?? 1;
      const idx = state.chats.findIndex((c) => c.id === chatId);
      if (idx !== -1) {
        if (isWaOnlyChat(state.chats[idx])) return;
        state.chats[idx].unreadCount = (state.chats[idx].unreadCount || 0) + inc;
      }
    },
    clearUnread: (state, action: PayloadAction<{ chatId: string }>) => {
      const { chatId } = action.payload;
      const idx = state.chats.findIndex((c) => c.id === chatId);
      if (idx !== -1) {
        state.chats[idx].unreadCount = 0;
      }
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      const message = action.payload;
      if (!state.messages[message.chatId]) {
        state.messages[message.chatId] = [];
      }
      // Avoid duplicates
      const exists = state.messages[message.chatId].some((m) => m.id === message.id);
      if (!exists) {
        state.messages[message.chatId].push(message);
        // Sort by timestamp
        state.messages[message.chatId].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      }
      // Update last message in chat list
      const chatIndex = state.chats.findIndex((c) => c.id === message.chatId);
      if (chatIndex !== -1) {
        state.chats[chatIndex].lastMessage = {
          text: message.text || '[Media]',
          senderId: message.senderId,
          senderName: message.senderName,
          messageType: message.messageType,
          timestamp: message.timestamp,
        };
        state.chats[chatIndex].updatedAt = message.timestamp;
        // Move chat to top
        const chat = state.chats.splice(chatIndex, 1)[0];
        state.chats.unshift(chat);
      }
    },
    addChat: (state, action: PayloadAction<Chat>) => {
      const incoming = action.payload;
      const index = state.chats.findIndex((c) => c.id === incoming.id);
      if (index === -1) {
        state.chats.unshift(incoming);
        return;
      }

      const existingUnread = state.chats[index].unreadCount || 0;
      const merged: Chat = {
        ...incoming,
        unreadCount: isWaOnlyChat(incoming)
          ? 0
          : Math.max(existingUnread, incoming.unreadCount || 0),
      };

      state.chats.splice(index, 1);
      state.chats.unshift(merged);
    },
    updateChat: (state, action: PayloadAction<Chat>) => {
      const index = state.chats.findIndex((c) => c.id === action.payload.id);
      if (index !== -1) {
        const existingUnread = state.chats[index].unreadCount || 0;
        state.chats[index] = {
          ...action.payload,
          unreadCount: isWaOnlyChat(action.payload)
            ? 0
            : Math.max(existingUnread, action.payload.unreadCount || 0),
        };
      }
      if (state.activeChat?.id === action.payload.id) {
        state.activeChat = action.payload;
      }
    },
    removeChat: (state, action: PayloadAction<string>) => {
      state.chats = state.chats.filter((c) => c.id !== action.payload);
      if (state.activeChat?.id === action.payload) {
        state.activeChat = null;
      }
      delete state.messages[action.payload];
    },
    setTypingUser: (
      state,
      action: PayloadAction<{ chatId: string; userId: string; userName: string; isTyping: boolean }>
    ) => {
      const { chatId, userId, userName, isTyping } = action.payload;
      if (!state.typingUsers[chatId]) {
        state.typingUsers[chatId] = [];
      }
      if (isTyping) {
        const exists = state.typingUsers[chatId].some((u) => u.userId === userId);
        if (!exists) {
          state.typingUsers[chatId].push({ userId, userName });
        }
      } else {
        state.typingUsers[chatId] = state.typingUsers[chatId].filter((u) => u.userId !== userId);
      }
    },
    setDraft: (
      state,
      action: PayloadAction<{ chatId: string; userId: string; userName: string; text: string }>
    ) => {
      const { chatId, userId, userName, text } = action.payload;
      if (!state.drafts[chatId]) {
        state.drafts[chatId] = {};
      }

      if (text.trim().length === 0) {
        delete state.drafts[chatId][userId];
      } else {
        state.drafts[chatId][userId] = { userName, text };
      }
    },
    clearDraftForUser: (state, action: PayloadAction<{ chatId: string; userId: string }>) => {
      const { chatId, userId } = action.payload;
      if (!state.drafts[chatId]) return;
      delete state.drafts[chatId][userId];
    },
    updateUserOnlineStatus: (state, action: PayloadAction<{ userId: string; isOnline: boolean }>) => {
      const { userId, isOnline } = action.payload;
      state.chats.forEach((chat) => {
        chat.participants.forEach((p) => {
          if (p.userId === userId) {
            p.isOnline = isOnline;
          }
        });
      });
      if (state.activeChat) {
        state.activeChat.participants.forEach((p) => {
          if (p.userId === userId) {
            p.isOnline = isOnline;
          }
        });
      }
    },
    upsertParticipantProfile: (
      state,
      action: PayloadAction<{ userId: string; displayName?: string; avatarUrl?: string; gender?: 'male' | 'female' | string }>
    ) => {
      const { userId, displayName, avatarUrl, gender } = action.payload;

      const applyToParticipants = (participants: Array<{ userId: string; displayName: string; avatarUrl: string; gender?: any }>) => {
        participants.forEach((p) => {
          if (p.userId !== userId) return;
          if (typeof displayName === 'string') p.displayName = displayName;
          if (typeof avatarUrl === 'string') p.avatarUrl = avatarUrl;
          if (typeof gender === 'string') p.gender = gender;
        });
      };

      state.chats.forEach((chat) => applyToParticipants(chat.participants));
      if (state.activeChat) applyToParticipants(state.activeChat.participants);

      if (typeof avatarUrl === 'string' || typeof gender === 'string') {
        Object.values(state.messages).forEach((chatMessages) => {
          chatMessages.forEach((message) => {
            if (message.senderId !== userId) return;
            if (typeof avatarUrl === 'string') message.senderAvatar = avatarUrl;
            if (typeof gender === 'string') message.senderGender = gender;
          });
        });
      }
    },
    startAgentMessage: (state, action: PayloadAction<Message>) => {
      const message = action.payload;
      if (!state.messages[message.chatId]) {
        state.messages[message.chatId] = [];
      }
      const exists = state.messages[message.chatId].some((m) => m.id === message.id);
      if (!exists) {
        state.messages[message.chatId].push(message);
      }
    },
    appendAgentMessageChunk: (
      state,
      action: PayloadAction<{ chatId: string; messageId: string; chunk: string }>
    ) => {
      const { chatId, messageId, chunk } = action.payload;
      const chatMessages = state.messages[chatId];
      if (!chatMessages) return;
      const msg = chatMessages.find((m) => m.id === messageId);
      if (msg) {
        msg.text = `${msg.text || ''}${chunk}`;
      }
    },
    finalizeAgentMessage: (
      state,
      action: PayloadAction<{ chatId: string; messageId: string; fullText: string }>
    ) => {
      const { chatId, messageId, fullText } = action.payload;
      const chatMessages = state.messages[chatId];
      if (!chatMessages) return;
      const msg = chatMessages.find((m) => m.id === messageId);
      if (msg) {
        msg.text = fullText;
      }
    },
    markMessageDelivered: (state, action: PayloadAction<{ chatId: string; messageId: string; userId: string }>) => {
      const { chatId, messageId, userId } = action.payload;
      const chatMessages = state.messages[chatId];
      if (!chatMessages) return;

      const msg = chatMessages.find((m) => m.id === messageId);
      if (msg && !msg.deliveredTo.includes(userId)) {
        msg.deliveredTo.push(userId);
      }
    },
    markMessageRead: (state, action: PayloadAction<{ chatId: string; messageId: string; userId: string }>) => {
      const { chatId, messageId, userId } = action.payload;
      const chatMessages = state.messages[chatId];
      if (!chatMessages) return;

      const msg = chatMessages.find((m) => m.id === messageId);
      if (msg && !msg.readBy.includes(userId)) {
        msg.readBy.push(userId);
      }
    },
    clearMessages: (state, action: PayloadAction<string>) => {
      delete state.messages[action.payload];
    },
    clearChat: (state) => {
      state.chats = [];
      state.activeChat = null;
      state.messages = {};
      state.typingUsers = {};
      state.drafts = {};
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch chats
      .addCase(fetchChats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChats.fulfilled, (state, action) => {
        state.loading = false;
        const unreadById = new Map(state.chats.map((c) => [c.id, c.unreadCount || 0] as const));
        state.chats = action.payload.map((chat) => ({
          ...chat,
          unreadCount: isWaOnlyChat(chat)
            ? 0
            : Math.max(unreadById.get(chat.id) || 0, chat.unreadCount || 0),
        }));
      })
      .addCase(fetchChats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch chats';
      })
      // Fetch messages
      .addCase(fetchMessages.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.loading = false;
        const { chatId, messages } = action.payload;
        state.messages[chatId] = messages;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch messages';
      })
      // Create chat
      .addCase(createChat.fulfilled, (state, action) => {
        const exists = state.chats.some((c) => c.id === action.payload.id);
        if (!exists) {
          state.chats.unshift(action.payload);
        }
        state.activeChat = action.payload;
      });
  },
});

export const {
  setActiveChat,
  incrementUnread,
  clearUnread,
  addMessage,
  addChat,
  updateChat,
  removeChat,
  setTypingUser,
  upsertParticipantProfile,
  updateUserOnlineStatus,
  markMessageDelivered,
  markMessageRead,
  startAgentMessage,
  appendAgentMessageChunk,
  finalizeAgentMessage,
  setDraft,
  clearDraftForUser,
  clearMessages,
  clearChat,
} = chatSlice.actions;

export default chatSlice.reducer;
