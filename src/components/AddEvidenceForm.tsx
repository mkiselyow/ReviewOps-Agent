"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  status: "auto_approved" | "pending_review";
  validation: {
    qualityScore: number;
    isWeak: boolean;
    followUpQuestion: string | null;
    missingFields: string[];
    mappedValue: string | null;
  };
};

export default function AddEvidenceForm({ defaultPeriod }: { defaultPeriod: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [period, setPeriod] = useState(defaultPeriod);
  const [allowReview, setAllowReview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          period,
          visibility: allowReview ? "allow_for_review" : "share_with_manager",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setResult(data);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add evidence</h2>
      <p className="muted small">
        Describe a concrete contribution, its impact, and any supporting links.
        It&apos;s validated and either auto-saved or sent to your manager to confirm.
      </p>
      {error && <div className="note bad" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="field">
        <label>Evidence</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. I refactored the shared tooltip component and helped Mark integrate it in billing, closing two layout bugs (PR-123, BUG-45)."
          required
        />
      </div>
      <div className="field">
        <label>Period</label>
        <input value={period} onChange={(e) => setPeriod(e.target.value)} required />
      </div>
      <label className="row" style={{ cursor: "pointer", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={allowReview}
          onChange={(e) => setAllowReview(e.target.checked)}
          style={{ width: "auto" }}
        />
        <span>Allow this evidence to be used for review preparation</span>
      </label>
      <button disabled={busy}>{busy ? "Submitting…" : "Submit evidence"}</button>

      {result && (
        <div
          className={`note ${result.status === "auto_approved" ? "good" : "warn"}`}
          style={{ marginTop: 12 }}
        >
          <div>
            {result.status === "auto_approved"
              ? "Saved ✓ (auto-approved — high confidence)"
              : "Submitted — pending your manager's review (lower confidence)."}
            {" "}Quality {result.validation.qualityScore.toFixed(2)}
            {result.validation.mappedValue ? ` · ${result.validation.mappedValue}` : ""}
          </div>
          {result.validation.isWeak && result.validation.followUpQuestion && (
            <div style={{ marginTop: 4 }}>↳ {result.validation.followUpQuestion}</div>
          )}
        </div>
      )}
    </form>
  );
}
