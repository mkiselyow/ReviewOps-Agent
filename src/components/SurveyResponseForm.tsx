"use client";

import { useState } from "react";

type Question = {
  id: string;
  position: number;
  questionType: string;
  text: string;
  required: boolean;
};

type Validation = {
  qualityScore: number;
  isWeak: boolean;
  missingFields: string[];
  followUpQuestion: string | null;
  mappedValue: string | null;
};

export default function SurveyResponseForm({
  token,
  questions,
  initialAnswers,
}: {
  token: string;
  questions: Question[];
  initialAnswers: Record<string, string>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [allowReview, setAllowReview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validations, setValidations] = useState<Record<string, Validation>>({});
  const [submitted, setSubmitted] = useState(false);

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        answers: questions
          .map((q) => ({
            questionId: q.id,
            answerText: answers[q.id] ?? "",
            visibility: allowReview ? "allow_for_review" : "share_with_manager",
          }))
          .filter((a) => a.answerText.trim().length > 0),
      };
      const res = await fetch(`/api/survey/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      const byQ: Record<string, Validation> = {};

      for (const v of data.validations) {
        console.log(v.validation)
        byQ[v.questionId] = v.validation;
      }
      setValidations(byQ);
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const weakCount = Object.values(validations).filter((v) => v.isWeak).length;

  return (
    <form className="stack" onSubmit={submit}>
      {error && <div className="note bad">{error}</div>}

      {submitted && (
        <div className={`note ${weakCount > 0 ? "warn" : "good"}`}>
          {weakCount > 0
            ? `Thanks! ${weakCount} answer(s) could be stronger — see the prompts below, improve them, and resubmit.`
            : "Thanks! Your answers were submitted and look like solid evidence."}
        </div>
      )}

      {questions.map((q) => {
        const v = validations[q.id];
        return (
          <div key={q.id} className="card">
            <label>
              {q.position + 1}. {q.text}
              {q.required ? " *" : ""}
            </label>
            {q.questionType === "long_text" ? (
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
            ) : (
              <input
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
            )}
            {v && (
              <div
                className={`note ${v.isWeak ? "warn" : "good"} small`}
                style={{ marginTop: 8 }}
              >
                <div>
                  Evidence quality: <strong>{v.qualityScore.toFixed(2)}</strong>
                  {v.mappedValue ? ` · value: ${v.mappedValue}` : ""}
                </div>
                {v.isWeak && v.followUpQuestion && (
                  <div style={{ marginTop: 4 }}>↳ {v.followUpQuestion}</div>
                )}
                {v.missingFields.length > 0 && (
                  <div className="muted">Missing: {v.missingFields.join(", ")}</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="card">
        <label className="row" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={allowReview}
            onChange={(e) => setAllowReview(e.target.checked)}
            style={{ width: "auto" }}
          />
          <span>Allow my answers to be used for review preparation</span>
        </label>
        <p className="small muted">
          If unchecked, answers are shared with your manager but not used to
          ground a review draft.
        </p>
        <button disabled={busy}>
          {busy ? "Submitting…" : submitted ? "Resubmit" : "Submit answers"}
        </button>
      </div>
    </form>
  );
}
