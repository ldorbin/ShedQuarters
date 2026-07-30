import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { state, signIn } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Sign in · ShedQuarters";
  }, []);

  if (state === "signed-in") return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signIn(password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Couldn't sign in. Try again.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">
          <span className="brand-mark">SQ</span>
          <span className="brand-text">
            <strong>ShedQuarters</strong>
            <span>Workshop</span>
          </span>
        </div>

        <h1>Sign in</h1>
        <p className="sub">Enter the workshop password to continue.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="field" style={{ marginBottom: 18 }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={busy || password.length === 0}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
