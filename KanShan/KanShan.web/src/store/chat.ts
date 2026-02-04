import { create } from "zustand";
import type { ConversationSummaryDto, MessageDto } from "../types";
import { api } from "../lib/api";

function upsertMessage(list: MessageDto[], msg: MessageDto): MessageDto[] {
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = msg;
    return next;
  }
  return [...list, msg].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

type ChatState = {
  conversations: ConversationSummaryDto[];
  selectedConversationId: string | null;
  messagesByConversation: Record<string, MessageDto[]>;
  isLoadingConversations: boolean;
  error: string | null;

  loadConversations: (token: string) => Promise<void>;
  selectConversation: (id: string | null) => void;
  loadMessages: (token: string, conversationId: string) => Promise<void>;
  receiveMessage: (msg: MessageDto) => void;
  clearUnread: (conversationId: string) => void;
  patchMessageText: (conversationId: string, messageId: string, text: string) => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  selectedConversationId: null,
  messagesByConversation: {},
  isLoadingConversations: false,
  error: null,

  loadConversations: async (token) => {
    set({ isLoadingConversations: true, error: null });
    try {
      const convs = await api.listConversations(token);
      set({ conversations: convs, isLoadingConversations: false });
    } catch (e: any) {
      set({ error: e?.message ?? String(e), isLoadingConversations: false });
    }
  },

  selectConversation: (id) => set({ selectedConversationId: id }),

  loadMessages: async (token, conversationId) => {
    const existing = get().messagesByConversation[conversationId];
    if (existing && existing.length > 0) return;

    try {
      const messages = await api.getMessages(token, conversationId, { limit: 100 });
      set((s) => ({
        messagesByConversation: { ...s.messagesByConversation, [conversationId]: messages },
      }));
    } catch (e: any) {
      set({ error: e?.message ?? String(e) });
    }
  },

  receiveMessage: (msg) => {
    set((s) => {
      const current = s.messagesByConversation[msg.conversationId] ?? [];
      const nextMessages = upsertMessage(current, msg);

      const isActive = s.selectedConversationId === msg.conversationId;

      const nextConversations = s.conversations
        .map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessage: msg,
                unreadCount: isActive ? 0 : (c.unreadCount ?? 0) + 1,
              }
            : c,
        )
        .sort((a, b) => {
          const aTs = new Date(a.lastMessage?.createdAt ?? a.createdAt).getTime();
          const bTs = new Date(b.lastMessage?.createdAt ?? b.createdAt).getTime();
          return bTs - aTs;
        });

      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [msg.conversationId]: nextMessages,
        },
        conversations: nextConversations,
      };
    });
  },

  clearUnread: (conversationId) => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      ),
    }));
  },

  patchMessageText: (conversationId, messageId, text) => {
    set((s) => {
      const current = s.messagesByConversation[conversationId] ?? [];
      const idx = current.findIndex((m) => m.id === messageId);
      if (idx < 0) return s;

      const next = current.slice();
      next[idx] = { ...next[idx], text };

      const nextConversations = s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: c.lastMessage?.id === messageId
                ? { ...(c.lastMessage as MessageDto), text }
                : c.lastMessage,
            }
          : c,
      );

      return {
        messagesByConversation: { ...s.messagesByConversation, [conversationId]: next },
        conversations: nextConversations,
      };
    });
  },
}));
