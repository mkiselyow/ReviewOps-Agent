"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewGenerateForm({
  employeeId,
  employeeName,
  defaultPeriod,
}: {
  employeeId: string;
  employeeName: string;
  defaultPeriod: string;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(defaultPeriod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      router.push(`/manager/reviews/${data.draft.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={generate}>
      <h2>Generate review draft — {employeeName}</h2>
      <p className="muted small">
        The draft is grounded only in evidence {employeeName} approved for review.
        Context is privacy-filtered before the model is called.
      </p>
      {error && <div className="note bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="field">
        <label>Review period</label>
        <input value={period} onChange={(e) => setPeriod(e.target.value)} required />
      </div>
      <button disabled={busy}>{busy ? "Generating…" : "Generate draft"}</button>
    </form>
  );
}
