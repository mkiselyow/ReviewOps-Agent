"use client";

import { useState } from "react";

type Warning = { type: string; message: string; severity: "low" | "medium" | "high" };
type Fairness = {
  grounded: boolean;
  warnings: Warning[];
  unsupportedClaims: number;
  citedEvidence: string[];
};
type Grounding = {
  removedCategories: string[];
  evidenceCount: number;
  source: string;
};

const SEV_CLASS: Record<string, string> = { low: "", medium: "warn", high: "bad" };

export default function ReviewDraftViewer({
  draftId,
  initialMarkdown,
  initialStatus,
  fairness,
  grounding,
}: {
  draftId: string;
  initialMarkdown: string;
  initialStatus: string;
  fairness: Fairness;
  grounding: Grounding;
}) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  const approved = status === "approved" || status === "exported";

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${draftId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      setStatus(data.draft.status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportMd() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${draftId}/export`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export failed");
      // Download the finalized markdown in the browser (works on serverless,
      // where the server can't write to disk).
      const blob = new Blob([data.markdown ?? markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName ?? "review.md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExported(true);
      setStatus("exported");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Review draft</h2>
          <div className="row">
            <span className="badge">{status}</span>
            <span className="badge">model: {grounding.source}</span>
            <span className="badge">{grounding.evidenceCount} evidence</span>
            {fairness.grounded ? (
              <span className="badge good">grounded</span>
            ) : (
              <span className="badge bad">needs grounding</span>
            )}
          </div>
        </div>
        {grounding.removedCategories.length > 0 && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Privacy filter removed categories: {grounding.removedCategories.join(", ")}
          </p>
        )}
      </div>

      <div className="card">
        <h3>Fairness &amp; grounding</h3>
        {fairness.warnings.length === 0 ? (
          <div className="note good small">No warnings. Review is well grounded.</div>
        ) : (
          <div className="stack">
            {fairness.warnings.map((w, i) => (
              <div key={i} className={`note ${SEV_CLASS[w.severity]} small`}>
                <strong>{w.type.replace(/_/g, " ")}</strong> ({w.severity}): {w.message}
              </div>
            ))}
          </div>
        )}
        {fairness.unsupportedClaims > 0 && (
          <p className="small error" style={{ marginTop: 8 }}>
            {fairness.unsupportedClaims} unsupported claim(s) — add evidence
            citations or remove the claim before approving.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Draft (editable)</h3>
        <textarea
          style={{ minHeight: 320, fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
        />
        <details style={{ marginTop: 10 }}>
          <summary className="small muted">Preview</summary>
          <pre className="md">{markdown}</pre>
        </details>
      </div>

      {error && <div className="note bad">{error}</div>}

      <div className="card">
        <div className="row">
          <button onClick={approve} disabled={busy || approved}>
            {approved ? "Approved" : busy ? "Saving…" : "Approve draft"}
          </button>
          <button className="btn-ghost" onClick={exportMd} disabled={busy || !approved}>
            {exported ? "Download again" : "Export Markdown"}
          </button>
        </div>
        {exported && (
          <div className="note good small" style={{ marginTop: 12 }}>
            Downloaded the approved review as Markdown.
          </div>
        )}
      </div>
    </>
  );
}
