"use client";

import { useState } from "react";

type QA = { question: string; answer: string };
type Respondent = { name: string; status: string; answers: QA[] };

/**
 * Copy raw questionnaire results (questions + answers only — NO AI fields:
 * no quality scores, mapped values, evidence, or follow-ups) as JSON or Markdown.
 */
export default function ResultsExport({
  respondents,
}: {
  respondents: Respondent[];
}) {
  const [copied, setCopied] = useState<"json" | "markdown" | null>(null);

  function toJSON(): string {
    return JSON.stringify(
      respondents.map((r) => ({
        respondent: r.name,
        status: r.status,
        answers: Object.fromEntries(r.answers.map((a) => [a.question, a.answer])),
      })),
      null,
      2,
    );
  }

  function toMarkdown(): string {
    return respondents
      .map((r) => {
        const body = r.answers.length
          ? r.answers.map((a) => `- **${a.question}**: ${a.answer || "—"}`).join("\n")
          : "_No answers submitted._";
        return `## ${r.name} (${r.status})\n\n${body}`;
      })
      .join("\n\n");
  }

  async function copy(kind: "json" | "markdown") {
    const text = kind === "json" ? toJSON() : toMarkdown();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked (e.g. non-secure context) — no-op.
    }
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="btn-ghost" type="button" onClick={() => copy("json")}>
        {copied === "json" ? "Copied ✓" : "Copy JSON"}
      </button>
      <button className="btn-ghost" type="button" onClick={() => copy("markdown")}>
        {copied === "markdown" ? "Copied ✓" : "Copy Markdown"}
      </button>
    </div>
  );
}
