import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const devLogin = useAuthStore((s) => s.devLogin);

  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(
    () => userName.trim().length > 0 && password.length > 0 && !busy,
    [userName, password, busy],
  );

  return (
    <div className="authPage">
      <div className="authCard">
        <h1>KanShan</h1>
        <div className="muted">Login to continue</div>

        <label className="label">Username</label>
        <input
          className="input"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="alice"
          autoComplete="username"
        />

        <label className="label">Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <div className="error">{error}</div>}

        <button
          className="btn btnPrimary"
          disabled={!canSubmit}
          onClick={async () => {
            setError(null);
            setBusy(true);
            try {
              await login({ userName, password });
              navigate("/app");
            } catch (e: any) {
              setError(e?.message ?? String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <div className="muted" style={{ marginTop: 14 }}>
          Quick login (dev)
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[
            { userName: "alice", label: "Alice" },
            { userName: "bob", label: "Bob" },
            { userName: "carol", label: "Carol" },
          ].map((u) => (
            <button
              key={u.userName}
              className="btn"
              disabled={busy}
              onClick={async () => {
                setError(null);
                setBusy(true);
                try {
                  await devLogin({ userName: u.userName });
                  navigate("/app");
                } catch (e: any) {
                  setError(e?.message ?? String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {u.label}
            </button>
          ))}
        </div>

        <div className="muted" style={{ marginTop: 10 }}>
          No account? <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  );
}
