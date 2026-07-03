"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type View = {
  questionnaireId: string;
  title: string;
  deadline: string | null;
  overdue: boolean;
  total: number;
  submitted: number;
  outstanding: number;
  targets: { respondentName: string }[];
};

export default function RemindersPanel({ views }: { views: View[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [deadlineDraft, setDeadlineDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function remind(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/questionnaires/${id}/remind`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send reminders");
      setMsg((m) => ({
        ...m,
        [id]:
          data.sent > 0
            ? `Nudged ${data.sent} respondent(s)${data.skipped ? `, ${data.skipped} recently reminded` : ""}.`
            : data.skipped > 0
              ? `All outstanding respondents were reminded recently (${data.skipped}).`
              : "Everyone has responded — nothing to send.",
      }));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function updateDeadline(id: string, current: string | null) {
    const value = deadlineDraft[id] ?? current ?? "";
    setBusy(`deadline:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/questionnaires/${id}/deadline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline: value || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update deadline");
      setMsg((m) => ({
        ...m,
        [id]: `Deadline ${data.deadline ? `set to ${data.deadline}` : "cleared"} — reopened ${data.reopened} link(s).`,
      }));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (views.length === 0) {
    return <p className="muted small">No sent questionnaires yet.</p>;
  }

  return (
    <div className="stack">
      {error && <div className="note bad">{error}</div>}
      {views.map((v) => {
        const complete = v.outstanding === 0;
        return (
          <div key={v.questionnaireId} className={`note ${v.overdue ? "warn" : complete ? "good" : ""}`}>
            <div className="spread">
              <strong>{v.title}</strong>
              <span className="badge">
                {v.submitted}/{v.total} responded
                {v.overdue ? " · overdue" : ""}
              </span>
            </div>
            <div
              className="row small"
              style={{ marginTop: 6, gap: 6, alignItems: "center", flexWrap: "wrap" }}
            >
              <span className="muted">Deadline:</span>
              <input
                type="date"
                value={deadlineDraft[v.questionnaireId] ?? v.deadline ?? ""}
                onChange={(e) =>
                  setDeadlineDraft((d) => ({ ...d, [v.questionnaireId]: e.target.value }))
                }
                style={{ width: "auto" }}
              />
              <button
                className="btn-ghost"
                disabled={busy === `deadline:${v.questionnaireId}`}
                onClick={() => updateDeadline(v.questionnaireId, v.deadline)}
              >
                {busy === `deadline:${v.questionnaireId}`
                  ? "Updating…"
                  : "Update deadline & reopen links"}
              </button>
            </div>
            {!complete && (
              <div className="small muted" style={{ marginTop: 4 }}>
                Outstanding: {v.targets.map((t) => t.respondentName).join(", ")}
              </div>
            )}
            {msg[v.questionnaireId] && (
              <div className="small" style={{ marginTop: 6 }}>{msg[v.questionnaireId]}</div>
            )}
            {!complete && (
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn-ghost"
                  disabled={busy === v.questionnaireId}
                  onClick={() => remind(v.questionnaireId)}
                >
                  {busy === v.questionnaireId ? "Sending…" : "Send reminders"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
