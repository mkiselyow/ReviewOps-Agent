"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SelectableUser = {
  id: string;
  displayName: string;
  roleTitle: string;
  managerName: string | null;
};

export default function UserSwitcher({ users }: { users: SelectableUser[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Login failed");
      router.push("/manager");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      {error && <div className="note bad">{error}</div>}
      {users.map((u) => (
        <div key={u.id} className="spread card" style={{ marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{u.displayName}</div>
            <div className="small muted">
              {u.roleTitle}
              {u.managerName ? ` · reports to ${u.managerName}` : " · no manager"}
            </div>
          </div>
          <button disabled={busy === u.id} onClick={() => login(u.id)}>
            {busy === u.id ? "Signing in…" : "Log in"}
          </button>
        </div>
      ))}
    </div>
  );
}
