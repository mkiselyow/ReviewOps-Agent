"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  employeeName: string;
  sourceText: string | null;
  summary: string;
  impact: string | null;
  concern: string | null;
  companyValue: string | null;
  qualityScore: number | null;
  confidence: number | null;
};

export default function EvidenceReviewQueue({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "approve" | "reject">>({});

  async function act(id: string, decision: "approve" | "reject") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/evidence/${id}/${decision}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setDone((d) => ({ ...d, [id]: decision }));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="muted small">No evidence awaiting review.</p>;
  }

  return (
    <div className="stack">
      {error && <div className="note bad">{error}</div>}
      {items.map((it) => (
        <div key={it.id} className="note warn">
          <div className="spread">
            <strong>{it.employeeName}</strong>
            <span className="badge">
              quality {it.qualityScore != null ? it.qualityScore.toFixed(2) : "—"}
              {it.confidence != null ? ` · conf ${it.confidence.toFixed(2)}` : ""}
              {it.companyValue ? ` · ${it.companyValue}` : ""}
            </span>
          </div>

          {/* Raw evidence, in the employee's own words, for transparency. */}
          {it.sourceText && (
            <blockquote
              className="small"
              style={{
                margin: "8px 0 0",
                paddingLeft: 10,
                borderLeft: "3px solid var(--border, #555)",
                fontStyle: "italic",
              }}
            >
              “{it.sourceText}”
            </blockquote>
          )}

          {/* The agent's read on it. */}
          <div className="small muted" style={{ marginTop: 8 }}>
            <strong>Agent summary:</strong> {it.summary}
          </div>
          {it.impact && (
            <div className="small muted" style={{ marginTop: 2 }}>Impact: {it.impact}</div>
          )}
          {it.concern && (
            <div className="small" style={{ marginTop: 4 }}>
              ⚠ <strong>Concern:</strong> {it.concern}
            </div>
          )}
          {done[it.id] ? (
            <div
              className={`small ${done[it.id] === "approve" ? "success" : "error"}`}
              style={{ marginTop: 8 }}
            >
              {done[it.id] === "approve" ? "Approved ✓" : "Rejected"}
            </div>
          ) : (
            <div className="row" style={{ marginTop: 8 }}>
              <button disabled={busy === it.id} onClick={() => act(it.id, "approve")}>
                Approve
              </button>
              <button
                className="btn-ghost"
                disabled={busy === it.id}
                onClick={() => act(it.id, "reject")}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
