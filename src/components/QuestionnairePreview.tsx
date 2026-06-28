"use client";

import { useState } from "react";
import Link from "next/link";

type Question = {
  id: string;
  position: number;
  questionType: string;
  text: string;
  explanation: string | null;
};

type Safety = {
  decision: "approved" | "needs_revision";
  riskyQuestions: { position: number; reason: string; saferAlternative: string }[];
  notes: string;
};

type GeneratedLink = { respondentName: string; link: string };

export default function QuestionnairePreview({
  questionnaireId,
  title,
  purpose,
  status,
  questions,
  safety,
}: {
  questionnaireId: string;
  title: string;
  purpose: string | null;
  status: string;
  questions: Question[];
  safety: Safety;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<GeneratedLink[] | null>(null);
  const [sent, setSent] = useState(status === "sent");

  async function approveAndSend() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/questionnaires/${questionnaireId}/approve`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      setLinks(data.links);
      setSent(true);
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
          <h2 style={{ margin: 0 }}>{title}</h2>
          <span className="badge">{sent ? "sent" : status}</span>
        </div>
        {purpose && <p className="muted">{purpose}</p>}
      </div>

      <div className={`card`}>
        <h3>
          Safety review:{" "}
          {safety.decision === "approved" ? (
            <span className="badge good">approved</span>
          ) : (
            <span className="badge warn">needs revision</span>
          )}
        </h3>
        <p className="muted small">{safety.notes}</p>
        {safety.riskyQuestions.length > 0 && (
          <div className="stack">
            {safety.riskyQuestions.map((r, i) => (
              <div key={i} className="note warn">
                <div className="small">
                  <strong>Q{r.position + 1}:</strong> {r.reason}
                </div>
                <div className="small muted">Suggestion: {r.saferAlternative}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Questions</h3>
        <ol className="stack">
          {questions.map((q) => (
            <li key={q.id} style={{ marginBottom: 10 }}>
              <div>{q.text}</div>
              <div className="small muted">
                <span className="badge">{q.questionType}</span>{" "}
                {q.explanation}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {error && <div className="note bad">{error}</div>}

      {!sent ? (
        <div className="card">
          <p className="small muted">
            Approving will generate personal token links for your direct reports
            and place them in the mock outbox.
          </p>
          <button onClick={approveAndSend} disabled={busy}>
            {busy ? "Approving…" : "Approve & generate links"}
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="note good" style={{ marginBottom: 12 }}>
            Questionnaire approved and links generated.
          </div>
          {links && (
            <div className="stack">
              {links.map((l) => (
                <div key={l.link}>
                  <label>{l.respondentName}</label>
                  <div className="row">
                    <Link className="linkbox" href={l.link}>
                      {l.link}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="small" style={{ marginTop: 12 }}>
            <Link href="/manager/outbox">Open mock outbox →</Link>
          </p>
        </div>
      )}
    </>
  );
}
