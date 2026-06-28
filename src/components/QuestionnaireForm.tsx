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
        body: JSON.stringify({ topic, period, purpose, notes, evidenceValidation }),
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
        Describe what evidence you want to collect. The Questionnaire Agent will
        propose 5–7 work-related questions and the Safety Agent will review them.
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
          placeholder="Any specifics you want emphasized."
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
          <span>Validate evidence quality (score answers, ask follow-ups)</span>
        </label>
        <p className="small muted">
          Turn off for a simple pulse/feedback survey: answers are stored as-is,
          with no scoring, follow-ups, or evidence cards.
        </p>
      </div>
      <button disabled={busy}>{busy ? "Generating…" : "Generate questions"}</button>
    </form>
  );
}
