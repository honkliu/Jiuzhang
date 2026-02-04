import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MessageDto } from "../types";
import { useAuthStore } from "../store/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

function isMine(msg: MessageDto, myId: string | undefined) {
  return myId && msg.senderUserId === myId;
}

function initials(name: string | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function renderTextWithMentions(text: string) {
  // Highlights @someone mentions; intentionally ignores '@@' (wa trigger).
  // Keep this lightweight: no lookups, just styling.
  const nodes: ReactNode[] = [];
  const re = /@[a-zA-Z0-9_]{1,32}/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const token = match[0];

    // Skip '@@' and any token that is immediately preceded by '@'.
    if (start > 0 && text[start - 1] === "@") {
      continue;
    }

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    nodes.push(
      <span key={`m-${key++}`} className="mention">
        {token}
      </span>,
    );
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function ChatWindow(props: {
  title: string;
  messages: MessageDto[];
  onSend: (params: { text?: string; file?: File }) => Promise<void>;
  onTyping: (draft: string) => Promise<void>;
  typingHint?: string;
}) {
  const myId = useAuthStore((s) => s.user?.id);
  const myName = useAuthStore((s) => s.user?.displayName);

  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(true);

  const canSend = useMemo(
    () => text.trim().length > 0,
    [text],
  );

  const scrollToBottom = useCallback(() => {
    const el = bodyRef.current;
    if (el)
    {
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      return;
    }

    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  const last = props.messages.at(-1);
  const lastId = last?.id ?? "";
  const lastTextLen = (last?.text ?? "").length;
  const lastImageUrl = last?.imageUrl ?? "";

  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const t = window.requestAnimationFrame(() => scrollToBottom());
    return () => window.cancelAnimationFrame(t);
  }, [props.messages.length, lastId, lastTextLen, lastImageUrl, scrollToBottom]);

  return (
    <div className="chat">
      <div className="chatHeader">
        <div className="chatTitle">{props.title}</div>
      </div>

      <div
        className="chatBody"
        ref={bodyRef}
        onScroll={() => {
          const el = bodyRef.current;
          if (!el) return;
          const thresholdPx = 80;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - thresholdPx;
          isAtBottomRef.current = atBottom;
        }}
      >
        {props.messages.map((m) => {
          const mine = isMine(m, myId);
          const imageUrl = m.imageUrl
            ? m.imageUrl.startsWith("http")
              ? m.imageUrl
              : `${API_BASE_URL}${m.imageUrl}`
            : null;
          return (
            <div key={m.id} className={`msgRow ${mine ? "msgRowMine" : "msgRowOther"}`}>
              {!mine && (
                <div className="avatar" title={m.senderDisplayName}>
                  {initials(m.senderDisplayName)}
                </div>
              )}
              <div className={`msgBubble ${mine ? "msgMine" : "msgOther"}`}>
                {m.isRecalled ? (
                  <div className="muted">(message recalled)</div>
                ) : (
                  <>
                    {m.text && <div className="msgText">{renderTextWithMentions(m.text)}</div>}
                    {imageUrl && (
                      <a href={imageUrl} target="_blank" rel="noreferrer">
                        <img
                          className="msgImage"
                          src={imageUrl}
                          alt="image"
                          onLoad={() => {
                            if (isAtBottomRef.current) scrollToBottom();
                          }}
                        />
                      </a>
                    )}
                  </>
                )}
                <div className="msgTime">
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              {mine && (
                <div className="avatar" title={myName ?? "You"}>
                  {initials(myName ?? "You")}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {props.typingHint && (
        <div className="typingHint" title="Live typing">
          {props.typingHint}
        </div>
      )}

      <div className="chatComposer">
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          onKeyDown={async (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!canSend) return;
              const toSend = text;
              setText("");
              await props.onSend({ text: toSend });
            }
          }}
          onInput={(e) => {
            const draft = (e.target as HTMLInputElement).value;
            if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
            typingTimerRef.current = window.setTimeout(() => {
              props.onTyping(draft).catch(() => undefined);
            }, 120);
          }}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            e.target.value = "";
            await props.onSend({ file: f, text: text.trim() ? text : undefined });
            setText("");
          }}
        />

        <button className="btn btnGhost" onClick={() => fileRef.current?.click()}>
          Image
        </button>

        <button
          className="btn btnPrimary"
          disabled={!canSend}
          onClick={async () => {
            if (!canSend) return;
            const toSend = text;
            setText("");
            await props.onSend({ text: toSend });
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
