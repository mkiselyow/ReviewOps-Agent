"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Passphrase sign-in for the real manager account (hidden from the demo
 * switcher). Posts to /api/login/passphrase.
 */
export default function ManagerPassphraseLogin() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login/passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Sign-in failed");
      router.push("/manager");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 16 }}>
      <h2>Manager sign-in</h2>
      <p className="muted small">
        Real manager account (not shown above). Enter your passphrase to access
        your team&apos;s real questionnaire responses.
      </p>
      {error && <div className="note bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="field">
        <label>Passphrase</label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <button disabled={busy || !passphrase}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
