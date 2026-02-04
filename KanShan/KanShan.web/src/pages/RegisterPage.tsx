import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);

  const [userName, setUserName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(
    () => userName.trim().length >= 3 && password.length >= 6 && !busy,
    [userName, password, busy],
  );

  return (
    <div className="authPage">
      <div className="authCard">
        <h1>KanShan</h1>
        <div className="muted">Create your account</div>

        <label className="label">Username</label>
        <input
          className="input"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="alice"
          autoComplete="username"
        />

        <label className="label">Display name (optional)</label>
        <input
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Alice"
        />

        <label className="label">Password (at least 6 chars)</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />

        {error && <div className="error">{error}</div>}

        <button
          className="btn btnPrimary"
          disabled={!canSubmit}
          onClick={async () => {
            setError(null);
            setBusy(true);
            try {
              await register({ userName, password, displayName });
              navigate("/app");
            } catch (e: any) {
              setError(e?.message ?? String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Creating..." : "Create account"}
        </button>

        <div className="muted" style={{ marginTop: 10 }}>
          Already have an account? <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
}
