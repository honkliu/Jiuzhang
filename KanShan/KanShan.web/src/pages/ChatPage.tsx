import { useEffect, useMemo, useRef, useState } from "react";
import type { HubConnection } from "@microsoft/signalr";
import { useNavigate } from "react-router-dom";
import type { MessageDto } from "../types";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { createChatConnection } from "../lib/realtime";
import { api } from "../lib/api";
import { Sidebar } from "../components/Sidebar";
import { ChatWindow } from "../components/ChatWindow";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export function ChatPage() {
  const navigate = useNavigate();

  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const conversations = useChatStore((s) => s.conversations);
  const selectedConversationId = useChatStore((s) => s.selectedConversationId);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const receiveMessage = useChatStore((s) => s.receiveMessage);
  const clearUnread = useChatStore((s) => s.clearUnread);
  const patchMessageText = useChatStore((s) => s.patchMessageText);
  const messagesByConversation = useChatStore((s) => s.messagesByConversation);

  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected",
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hiddenChats, setHiddenChats] = useState<Record<string, number>>({});
  const hiddenChatsRef = useRef<Record<string, number>>({});
  const [remoteTyping, setRemoteTyping] = useState<null | {
    conversationId: string;
    userId: string;
    displayName: string;
    text: string;
    at: string;
  }>(null);

  const connectionRef = useRef<HubConnection | null>(null);

  const hiddenChatsStorageKey = useMemo(() => {
    const uid = user?.id ?? "anon";
    return `kanshan:hiddenChats:${uid}`;
  }, [user?.id]);

  useEffect(() => {
    hiddenChatsRef.current = hiddenChats;
  }, [hiddenChats]);

  useEffect(() => {
    // Load hidden chats for current user.
    try {
      const raw = localStorage.getItem(hiddenChatsStorageKey);
      if (!raw) {
        setHiddenChats({});
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setHiddenChats(parsed);
      } else {
        setHiddenChats({});
      }
    } catch {
      setHiddenChats({});
    }
  }, [hiddenChatsStorageKey]);

  const persistHiddenChats = (next: Record<string, number>) => {
    try {
      localStorage.setItem(hiddenChatsStorageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const hideConversationLocal = (conversationId: string) => {
    setHiddenChats((s) => {
      const next = { ...s, [conversationId]: Date.now() };
      persistHiddenChats(next);
      return next;
    });
    if (selectedConversationId === conversationId) {
      selectConversation(null);
    }
  };

  const unhideConversation = (conversationId: string) => {
    setHiddenChats((s) => {
      if (!s[conversationId]) return s;
      const next = { ...s };
      delete next[conversationId];
      persistHiddenChats(next);
      return next;
    });
  };

  const isWaOnlyConversation = (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    const meId = user?.id;
    if (!conv || !meId) return false;
    const ps = conv.participants ?? [];
    if (ps.length !== 2) return false;
    const hasMe = ps.some((p) => p.userId === meId);
    const hasWa = ps.some((p) => (p.userName ?? "").toLowerCase() === "wa");
    return hasMe && hasWa;
  };

  const deleteOrHideConversation = async (conversationId: string) => {
    if (token && isWaOnlyConversation(conversationId)) {
      // For wa-only chats, deleting should remove it completely.
      try {
        await api.deleteConversation(token, conversationId);
      } catch {
        // If server rejects, fall back to local hide.
        hideConversationLocal(conversationId);
        return;
      }

      // Remove from any local hidden state.
      setHiddenChats((s) => {
        if (!s[conversationId]) return s;
        const next = { ...s };
        delete next[conversationId];
        persistHiddenChats(next);
        return next;
      });

      if (selectedConversationId === conversationId) {
        selectConversation(null);
      }

      await loadConversations(token);
      return;
    }

    hideConversationLocal(conversationId);
  };

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  // If a hidden conversation receives new messages (or has unread/newer activity after hiding), show it again.
  useEffect(() => {
    const currentHidden = hiddenChatsRef.current;
    const keys = Object.keys(currentHidden);
    if (keys.length === 0) return;

    let changed = false;
    const next = { ...currentHidden };
    for (const c of conversations) {
      const hiddenAt = next[c.id];
      if (!hiddenAt) continue;

      const lastTs = new Date(c.lastMessage?.createdAt ?? c.createdAt).getTime();
      // Only re-show if there's new activity after the user hid it.
      if (lastTs > hiddenAt) {
        delete next[c.id];
        changed = true;
      }
    }

    if (changed) {
      setHiddenChats(next);
      persistHiddenChats(next);
    }
  }, [conversations, hiddenChatsStorageKey]);

  const visibleConversations = useMemo(
    () => conversations.filter((c) => !hiddenChats[c.id]),
    [conversations, hiddenChats],
  );

  const messages = useMemo(
    () => (selectedConversationId ? messagesByConversation[selectedConversationId] ?? [] : []),
    [messagesByConversation, selectedConversationId],
  );

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    loadConversations(token);
  }, [token, loadConversations, navigate]);

  useEffect(() => {
    if (!token) return;

    const connection = createChatConnection({
      baseUrl: API_BASE_URL,
      accessTokenFactory: () => token,
    });

    connectionRef.current = connection;

    connection.on("message:new", (msg: MessageDto) => {
      receiveMessage(msg);
      if (hiddenChatsRef.current[msg.conversationId]) {
        unhideConversation(msg.conversationId);
      }
    });

    connection.on("message:delta", (payload: any) => {
      const conversationId = String(payload?.conversationId ?? "");
      const id = String(payload?.id ?? "");
      const text = String(payload?.text ?? "");
      if (conversationId && id) {
        patchMessageText(conversationId, id, text);
      }
    });

    connection.on("typing:update", (payload: any) => {
      const conversationId = String(payload?.conversationId ?? "");
      const userId = String(payload?.userId ?? "");
      const displayName = String(payload?.displayName ?? "");
      const text = String(payload?.text ?? "");
      const at = String(payload?.at ?? new Date().toISOString());

      if (!conversationId || !userId) return;
      if (userId === user?.id) return;
      setRemoteTyping({ conversationId, userId, displayName, text, at });
    });

    connection.on("conversation:new", async () => {
      try {
        await loadConversations(token);
      } catch {
        // ignore
      }
    });

    let cancelled = false;

    (async () => {
      setStatus("connecting");
      try {
        await connection.start();
        if (cancelled) return;
        setStatus("connected");
      } catch {
        if (cancelled) return;
        setStatus("disconnected");
      }
    })();

    return () => {
      cancelled = true;
      connection.stop().catch(() => undefined);
      connectionRef.current = null;
    };
  }, [token, receiveMessage, loadConversations, patchMessageText, user?.id]);

  async function openConversation(conversationId: string) {
    if (!token) return;
    selectConversation(conversationId);
    clearUnread(conversationId);
    await loadMessages(token, conversationId);

    const conn = connectionRef.current;
    if (conn) {
      try {
        await conn.invoke("JoinConversation", conversationId);

        const msgs = useChatStore.getState().messagesByConversation[conversationId] ?? [];
        const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        if (last?.id) {
          await conn.invoke("MarkRead", {
            conversationId,
            lastReadMessageId: last.id,
          });
        }
      } catch {
        // ignore
      }
    }
  }

  async function sendTyping(draft: string) {
    if (!selectedConversationId) return;
    const conn = connectionRef.current;
    if (!conn || status !== "connected") return;
    try {
      await conn.invoke("TypingUpdate", selectedConversationId, draft);
    } catch {
      // ignore
    }
  }

  async function sendMessage(params: { text?: string; file?: File }) {
    if (!token) return;
    if (!selectedConversationId) return;

    const conn = connectionRef.current;
    if (!conn || status !== "connected") {
      throw new Error("Realtime connection not ready");
    }

    let imageUrl: string | undefined;

    if (params.file) {
      const up = await api.uploadImage(token, params.file);
      imageUrl = up.url.startsWith("http") ? up.url : `${API_BASE_URL}${up.url}`;
    }

    const payload = {
      conversationId: selectedConversationId,
      text: params.text,
      imageUrl,
      clientMessageId: crypto.randomUUID(),
    };

    await conn.invoke("SendMessage", payload);
  }

  return (
    <div className="appShell">
      {!sidebarCollapsed && (
        <Sidebar
          conversations={visibleConversations}
          selectedConversationId={selectedConversationId}
          onOpenConversation={openConversation}
          onHideConversation={(id) => {
            void deleteOrHideConversation(id);
          }}
          onCollapse={() => setSidebarCollapsed(true)}
        />
      )}

      <div className="main">
        <div className="topBar">
          <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
            <div className="row">
              {sidebarCollapsed && (
                <button
                  className="btn btnGhost btnIcon"
                  onClick={() => setSidebarCollapsed(false)}
                  title="Show chats"
                  aria-label="Show chats"
                >
                  »
                </button>
              )}
              <div className="muted">
                Signed in as <b>{user?.displayName}</b> · Realtime: {status}
              </div>
            </div>
          </div>
        </div>

        {!selectedConversation && (
          <div className="emptyState">
            <div className="emptyTitle">Select a chat</div>
            <div className="muted">
              Use the left panel to start a 1:1 chat or create a group.
            </div>
          </div>
        )}

        {selectedConversation && (
          <ChatWindow
            title={selectedConversation.title}
            messages={messages}
            onSend={sendMessage}
            onTyping={sendTyping}
            typingHint={
              remoteTyping && remoteTyping.conversationId === selectedConversation.id && remoteTyping.text
                ? `${remoteTyping.displayName}: ${remoteTyping.text}`
                : remoteTyping && remoteTyping.conversationId === selectedConversation.id
                  ? `${remoteTyping.displayName} is typing...`
                  : ""
            }
          />
        )}
      </div>
    </div>
  );
}
