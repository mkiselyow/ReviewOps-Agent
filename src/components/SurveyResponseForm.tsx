"use client";

import { useEffect, useRef, useState } from "react";
import {
  type FormQuestion,
  buildGateBySection,
  buildSubmitPayload,
  isQuestionVisible,
  toggleMultiValue,
} from "@/lib/surveyForm";

type Validation = {
  qualityScore: number;
  isWeak: boolean;
  missingFields: string[];
  followUpQuestion: string | null;
  mappedValue: string | null;
};

const LONG_FORM = new Set(["long_text", "short_text", "evidence_link"]);

export default function SurveyResponseForm({
  token,
  questions,
  initialAnswers,
}: {
  token: string;
  questions: FormQuestion[];
  initialAnswers: Record<string, string>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [allowReview, setAllowReview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validations, setValidations] = useState<Record<string, Validation>>({});
  const [submitted, setSubmitted] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Long questionnaires push the success banner off-screen — bring it into view.
  useEffect(() => {
    // Optional-chained: jsdom (tests) doesn't implement scrollIntoView.
    if (submitted) bannerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [submitted, validations]);

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }
  function setEvidenceLink(id: string, value: string) {
    setEvidence((e) => ({ ...e, [id]: value }));
  }
  function toggleMulti(id: string, option: string) {
    setAnswers((a) => ({ ...a, [id]: toggleMultiValue(a[id] ?? "", option) }));
  }

  const gates = buildGateBySection(questions);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        answers: buildSubmitPayload(questions, answers, evidence, allowReview),
      };
      const res = await fetch(`/api/survey/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      const byQ: Record<string, Validation> = {};
      for (const v of data.validations) byQ[v.questionId] = v.validation;
      setValidations(byQ);
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const weakCount = Object.values(validations).filter((v) => v.isWeak).length;
  const hasValidations = Object.keys(validations).length > 0;
  const submittedMessage = !hasValidations
    ? "Thanks! Your answers were submitted."
    : weakCount > 0
      ? `Thanks! ${weakCount} answer(s) could be stronger — see the prompts below, improve them, and resubmit.`
      : "Thanks! Your answers were submitted and look like solid evidence.";

  function renderInput(q: FormQuestion) {
    const value = answers[q.id] ?? "";
    switch (q.questionType) {
      case "long_text":
        return (
          <textarea
            aria-label={q.text}
            value={value}
            onChange={(e) => setAnswer(q.id, e.target.value)}
          />
        );
      case "number":
        return (
          <input
            type="number"
            aria-label={q.text}
            value={value}
            onChange={(e) => setAnswer(q.id, e.target.value)}
          />
        );
      case "date":
        return (
          <input
            type="date"
            aria-label={q.text}
            value={value}
            onChange={(e) => setAnswer(q.id, e.target.value)}
          />
        );
      case "email":
        return (
          <input
            type="email"
            aria-label={q.text}
            value={value}
            onChange={(e) => setAnswer(q.id, e.target.value)}
          />
        );
      case "single_choice":
      case "rating":
        if (q.options.length > 0) {
          return (
            <div className="stack" style={{ gap: 4 }} role="radiogroup" aria-label={q.text}>
              {q.options.map((opt) => (
                <label key={opt} className="row" style={{ cursor: "pointer", gap: 8 }}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={value === opt}
                    onChange={() => setAnswer(q.id, opt)}
                    style={{ width: "auto" }}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          );
        }
        return (
          <input aria-label={q.text} value={value} onChange={(e) => setAnswer(q.id, e.target.value)} />
        );
      case "multi_choice": {
        const selected = new Set(
          value.split("|").map((s) => s.trim()).filter(Boolean),
        );
        return (
          <div className="stack" style={{ gap: 4 }} role="group" aria-label={q.text}>
            {q.options.map((opt) => (
              <label key={opt} className="row" style={{ cursor: "pointer", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selected.has(opt)}
                  onChange={() => toggleMulti(q.id, opt)}
                  style={{ width: "auto" }}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      }
      default:
        return (
          <input aria-label={q.text} value={value} onChange={(e) => setAnswer(q.id, e.target.value)} />
        );
    }
  }

  let lastSection: string | null = null;

  return (
    <form className="stack" onSubmit={submit}>
      {error && <div className="note bad">{error}</div>}

      {submitted && (
        <div ref={bannerRef} className={`note ${weakCount > 0 ? "warn" : "good"}`}>
          {submittedMessage}
        </div>
      )}

      {questions.map((q) => {
        if (!isQuestionVisible(q, answers, gates)) {
          lastSection = q.section;
          return null;
        }
        const v = validations[q.id];
        const showSectionHeading = q.section && q.section !== lastSection;
        lastSection = q.section;
        return (
          <div key={q.id}>
            {showSectionHeading && (
              <h3 style={{ margin: "18px 0 6px" }}>{q.section}</h3>
            )}
            <div className="card">
              <label>
                {q.text}
                {q.required ? " *" : ""}
              </label>
              {q.explanation && (
                <p className="small muted" style={{ margin: "2px 0 8px" }}>
                  {q.explanation}
                </p>
              )}
              {renderInput(q)}

              {q.evidenceRequired && (
                <div style={{ marginTop: 8 }}>
                  <label className="small muted">
                    📎 Evidence — link to a PR, doc, or artifact
                  </label>
                  <input
                    type="url"
                    aria-label={`Evidence for: ${q.text}`}
                    placeholder="https://…"
                    value={evidence[q.id] ?? ""}
                    onChange={(e) => setEvidenceLink(q.id, e.target.value)}
                  />
                </div>
              )}

              {v && LONG_FORM.has(q.questionType) && (
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
        <button className={submitted ? "btn-ghost" : undefined} disabled={busy}>
          {busy ? "Submitting…" : submitted ? "Resubmit" : "Submit answers"}
        </button>
      </div>
    </form>
  );
}
