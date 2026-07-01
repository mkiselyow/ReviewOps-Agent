"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ScaleLegend, { type ScaleLevel } from "./ScaleLegend";

type Question = {
  id: string;
  position: number;
  questionType: string;
  text: string;
  options: string[];
  section: string | null;
  evidenceRequired: boolean;
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
  scaleLegend,
  questions,
  safety,
}: {
  questionnaireId: string;
  title: string;
  purpose: string | null;
  status: string;
  scaleLegend: ScaleLevel[];
  questions: Question[];
  safety: Safety;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<GeneratedLink[] | null>(null);
  const [sent, setSent] = useState(status === "sent");

  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineMsg, setRefineMsg] = useState<string | null>(null);

  async function regenerate() {
    if (!feedback.trim()) return;
    setRefining(true);
    setRefineError(null);
    setRefineMsg(null);
    try {
      const res = await fetch(
        `/api/questionnaires/${questionnaireId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to regenerate");
      setFeedback("");
      setRefineMsg(`Updated — now ${data.questionCount} question(s).`);
      router.refresh(); // re-fetch the server component with the new questions
    } catch (e) {
      setRefineError((e as Error).message);
    } finally {
      setRefining(false);
    }
  }

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

      {questions.length === 0 && safety.decision === "needs_revision" && (
        <div className="note bad">
          <strong>Request refused.</strong> {safety.notes} No questions were
          generated — revise the request and try again.
        </div>
      )}

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

      <ScaleLegend legend={scaleLegend} />

      <div className="card">
        <h3>Questions ({questions.length})</h3>
        <ol className="stack">
          {questions.map((q, i) => {
            const showSection =
              q.section && q.section !== (questions[i - 1]?.section ?? null);
            return (
              <div key={q.id}>
                {showSection && (
                  <h4 style={{ margin: "14px 0 4px" }}>{q.section}</h4>
                )}
                <li style={{ marginBottom: 10 }}>
                  <div>{q.text}</div>
                  {q.options.length > 0 && (
                    <div className="small muted">Options: {q.options.join(" · ")}</div>
                  )}
                  <div className="small muted">
                    <span className="badge">{q.questionType}</span>{" "}
                    {q.evidenceRequired && <span className="badge">evidence</span>}{" "}
                    {q.explanation}
                  </div>
                </li>
              </div>
            );
          })}
        </ol>
      </div>

      {error && <div className="note bad">{error}</div>}

      {!sent && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Refine before approving</h3>
          <p className="small muted">
            Not quite right? Describe the changes (e.g. “drop Angular, add Svelte”,
            “make evidence optional”, “add a Backend section”) and regenerate. This
            replaces the draft’s questions — nothing is sent until you approve.
          </p>
          {refineError && <div className="note bad">{refineError}</div>}
          {refineMsg && <div className="note good">{refineMsg}</div>}
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What should change?"
            rows={3}
            disabled={refining}
          />
          <button
            onClick={regenerate}
            disabled={refining || !feedback.trim()}
            style={{ marginTop: 8 }}
          >
            {refining ? "Regenerating…" : "Regenerate with feedback"}
          </button>
        </div>
      )}

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
