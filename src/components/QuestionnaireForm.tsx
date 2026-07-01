"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function QuestionnaireForm({
  defaultPeriod,
}: {
  defaultPeriod: string;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState(
    "Q2 collaboration and ownership evidence",
  );
  const [period, setPeriod] = useState(defaultPeriod);
  const [deadline, setDeadline] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceValidation, setEvidenceValidation] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/questionnaires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, period, deadline: deadline || undefined, purpose, notes, evidenceValidation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      router.push(`/manager/questionnaires/${data.questionnaire.id}/preview`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Create a questionnaire</h2>
      <p className="muted small">
        Describe what you want to collect. The Questionnaire Agent follows your
        structure: list skills/items and it makes one question each; give a scale
        (e.g. L1–L5) and it becomes dropdowns; name sections and it groups them
        (add an opt-in to reveal a section on “yes”). With no structure, it
        proposes a short 5–7 question evidence survey. The Safety Agent reviews
        the result.
      </p>
      {error && <div className="note bad" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="field">
        <label>Topic</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} required />
      </div>
      <div className="field">
        <label>Period</label>
        <input value={period} onChange={(e) => setPeriod(e.target.value)} required />
      </div>
      <div className="field">
        <label>Response deadline (optional)</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        <p className="small muted">
          Drives overdue detection + reminder nudges; also sets the survey link
          expiry.
        </p>
      </div>
      <div className="field">
        <label>Purpose (optional)</label>
        <input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="e.g. Mid-year evidence collection"
        />
      </div>
      <div className="field">
        <label>Custom notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste the full structure here: sections, the list of skills/items, the rating scale (e.g. L1–L5 with labels), and any opt-in rules."
          rows={6}
        />
      </div>
      <div className="field">
        <label className="row" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={evidenceValidation}
            onChange={(e) => setEvidenceValidation(e.target.checked)}
            style={{ width: "auto" }}
          />
          <span>Require &amp; validate evidence (ask for links, score answers)</span>
        </label>
        <p className="small muted">
          On: narrative questions ask for a supporting link/artifact and answers
          are scored with follow-ups. Off: a simple pulse/feedback survey —
          answers stored as-is, no evidence demanded, no scoring or evidence cards.
        </p>
      </div>
      <button disabled={busy}>{busy ? "Generating…" : "Generate questions"}</button>
    </form>
  );
}
