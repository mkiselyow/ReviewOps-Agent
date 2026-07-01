"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Validation = {
  qualityScore: number;
  isWeak: boolean;
  followUpQuestion: string | null;
  missingFields: string[];
  mappedValue: string | null;
};

type ApiResult =
  | { status: "needs_confirmation"; validation: Validation }
  | {
      status: "stored";
      evidence: { id: string; status: "auto_approved" | "pending_review" };
      validation: Validation;
    };

export default function AddEvidenceForm({ defaultPeriod }: { defaultPeriod: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [period, setPeriod] = useState(defaultPeriod);
  const [allowReview, setAllowReview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  // The id of the item this submission is iterating on (so resubmits update the
  // same item instead of creating duplicates). Cleared when the text changes.
  const [evidenceId, setEvidenceId] = useState<string | null>(null);

  async function send(confirmWeak: boolean) {
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
          confirmWeak,
          evidenceId: evidenceId ?? undefined,
        }),
      });
      const data: ApiResult = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Submit failed");
      setResult(data);
      if (data.status === "stored") {
        setEvidenceId(data.evidence.id);
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onTextChange(value: string) {
    setText(value);
    // Editing after a store starts a NEW piece of evidence.
    if (result?.status === "stored") {
      setEvidenceId(null);
      setResult(null);
    }
  }

  const needsConfirm = result?.status === "needs_confirmation";

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void send(false);
      }}
    >
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
          onChange={(e) => onTextChange(e.target.value)}
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
      <button disabled={busy || !text.trim()}>
        {busy ? "Checking…" : "Submit evidence"}
      </button>

      {needsConfirm && (
        <div className="note warn" style={{ marginTop: 12 }}>
          <div>
            <strong>This looks a bit thin</strong> (quality{" "}
            {result.validation.qualityScore.toFixed(2)}) — it hasn&apos;t been saved yet.
          </div>
          {result.validation.followUpQuestion && (
            <div style={{ marginTop: 4 }}>↳ {result.validation.followUpQuestion}</div>
          )}
          {result.validation.missingFields.length > 0 && (
            <div className="small muted" style={{ marginTop: 4 }}>
              Missing: {result.validation.missingFields.join(", ")}
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <span className="small muted">Improve it above and submit again, or</span>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => void send(true)}
            >
              Submit anyway for manager review
            </button>
          </div>
        </div>
      )}

      {result?.status === "stored" && (
        <div
          className={`note ${result.evidence.status === "auto_approved" ? "good" : "warn"}`}
          style={{ marginTop: 12 }}
        >
          {result.evidence.status === "auto_approved"
            ? "Saved ✓ — auto-approved (high confidence)."
            : "Submitted ✓ — sent to your manager to confirm (lower confidence)."}{" "}
          Quality {result.validation.qualityScore.toFixed(2)}
          {result.validation.mappedValue ? ` · ${result.validation.mappedValue}` : ""}
        </div>
      )}
    </form>
  );
}
