import { useEffect, useMemo, useState } from "react";
import type { ConversationSummaryDto, UserDto } from "../types";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { api } from "../lib/api";
import { GroupCreateModal } from "./GroupCreateModal";

export function Sidebar(props: {
  conversations: ConversationSummaryDto[];
  selectedConversationId: string | null;
  onOpenConversation: (conversationId: string) => void;
  onHideConversation?: (conversationId: string) => void;
  onCollapse?: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const loadConversations = useChatStore((s) => s.loadConversations);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [groupModal, setGroupModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!token) return;
      const term = q.trim();
      if (!term) {
        setResults([]);
        return;
      }
      try {
        const users = await api.searchUsers(token, term);
        if (!cancelled) setResults(users);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, token]);

  const hasResults = useMemo(() => results.length > 0 && q.trim().length > 0, [results, q]);

  return (
    <div className="sidebar">
      <div className="sidebarHeader">
        <div>
          <div className="sidebarTitle">{me?.displayName ?? "(me)"}</div>
          <div className="muted">@{me?.userName ?? ""}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {props.onCollapse && (
            <button
              className="btn btnGhost btnIcon"
              onClick={props.onCollapse}
              title="Hide chats"
              aria-label="Hide chats"
            >
              «
            </button>
          )}
          <button className="btn btnGhost" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="sidebarActions">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users to chat..."
        />

        {hasResults && (
          <div className="searchResults">
            {results.map((u) => (
              <button
                key={u.id}
                className="searchResultItem"
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  try {
                    const conv = await api.createDirect(token, u.id);
                    await loadConversations(token);
                    props.onOpenConversation(conv.id);
                    setQ("");
                    setResults([]);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div className="name">{u.displayName}</div>
                    <div className="muted">@{u.userName}</div>
                  </div>
                  <div className="muted">Start</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <button className="btn btnPrimary" onClick={() => setGroupModal(true)}>
          New group
        </button>
      </div>

      <div className="conversationList">
        {props.conversations.map((c) => {
          const selected = c.id === props.selectedConversationId;
          const isGroup = (c.type ?? "").toLowerCase() === "group";

          const memberNames = isGroup
            ? c.participants
                .filter((p) => (!me?.id ? true : p.userId !== me.id))
                .map((p) => p.displayName)
                .filter(Boolean)
            : [];

          const shown = memberNames.slice(0, 4);
          const extra = memberNames.length - shown.length;
          const membersLine = shown.join(" · ") + (extra > 0 ? ` +${extra}` : "");

          return (
            <div
              key={c.id}
              className={`conversationItem ${selected ? "conversationItemSelected" : ""}`}
              onClick={() => props.onOpenConversation(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  props.onOpenConversation(c.id);
                }
              }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="name">{c.title}</div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  {c.unreadCount > 0 && (
                    <div className="badge" title={`${c.unreadCount} unread`}>
                      {c.unreadCount}
                    </div>
                  )}
                </div>
              </div>

              {isGroup && membersLine && <div className="conversationSub">{membersLine}</div>}

              {props.onHideConversation && (
                <button
                  type="button"
                  className="convHideBtn"
                  title="Delete chat"
                  aria-label="Delete chat"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onHideConversation?.(c.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {props.conversations.length === 0 && (
          <div className="muted" style={{ padding: 12 }}>
            No chats yet. Search users to start.
          </div>
        )}
      </div>

      {groupModal && (
        <GroupCreateModal
          onClose={() => setGroupModal(false)}
          onCreated={async (conversationId) => {
            if (token) await loadConversations(token);
            setGroupModal(false);
            props.onOpenConversation(conversationId);
          }}
        />
      )}
    </div>
  );
}
