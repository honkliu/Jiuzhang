import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { UserDto } from "../types";
import { useAuthStore } from "../store/auth";
import { Modal } from "./Modal";

export function GroupCreateModal(props: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const token = useAuthStore((s) => s.token);

  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserDto[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Record<string, UserDto>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!token) return;
      const term = q.trim();
      if (!term) {
        if (!showAll) setResults([]);
        return;
      }
      try {
        if (!cancelled) setShowAll(false);
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

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  return (
    <Modal title="New group" onClose={props.onClose}>
      <div className="formRow">
        <label className="label">Group title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Project A"
        />
      </div>

      <div className="formRow">
        <label className="label">Add members</label>
        <input
          className="input"
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            if (v.trim().length === 0) setShowAll(true);
          }}
          placeholder="Search users..."
          onFocus={async () => {
            if (!token) return;
            if (q.trim().length > 0) return;
            if (results.length > 0) return;
            try {
              setShowAll(true);
              const users = await api.listUsers(token, { limit: 50 });
              setResults(users);
            } catch {
              setResults([]);
            }
          }}
        />
        <div className="pickerResults">
          {results.map((u) => {
            const checked = Boolean(selected[u.id]);
            return (
              <button
                key={u.id}
                className={`pickerItem ${checked ? "pickerItemSelected" : ""}`}
                onClick={() =>
                  setSelected((s) => {
                    const next = { ...s };
                    if (next[u.id]) delete next[u.id];
                    else next[u.id] = u;
                    return next;
                  })
                }
              >
                <div className="pickerName">{u.displayName}</div>
                <div className="pickerSub">@{u.userName}</div>
              </button>
            );
          })}
        </div>

        {selectedList.length > 0 && (
          <div className="chips">
            {selectedList.map((u) => (
              <span className="chip" key={u.id}>
                {u.displayName}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button className="btn btnGhost" onClick={props.onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn btnPrimary"
          disabled={busy || !token || title.trim().length < 1}
          onClick={async () => {
            if (!token) return;
            setBusy(true);
            setError(null);
            try {
              const conv = await api.createGroup(
                token,
                title.trim(),
                selectedList.map((u) => u.id),
              );
              props.onCreated(conv.id);
            } catch (e: any) {
              setError(e?.message ?? String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Creating..." : "Create"}
        </button>
      </div>
    </Modal>
  );
}
