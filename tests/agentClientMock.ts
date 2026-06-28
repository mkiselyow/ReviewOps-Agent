/**
 * Deterministic mock of `src/server/agentClient` for unit tests, so the
 * orchestration/persistence/permission logic can be exercised without a running
 * Python service. (Agent *behavior* is evaluated separately via agents-cli eval.)
 */

export function usingAgentService(): boolean {
  return true;
}

const IMPACT_RE = /\b(reduc|increas|improv|closed|saved|cut|fixed|prevent|unblock|\d+\s?(bugs|%|tests|incidents|screens))/i;
const SOURCE_RE = /\b(PR[-\s]?\d+|BUG[-\s]?\d+|#\d+|https?:\/\/|JIRA)/i;

export async function generateQuestionnaire(input: {
  topic: string;
  period: string;
}) {
  const sensitive = /health|family|religion|polit|salary|marriage|nationalit|immigration/i.test(
    input.topic,
  );
  const questions = Array.from({ length: 6 }, (_, i) => ({
    position: i,
    questionType: i % 3 === 1 ? "evidence_link" : "long_text",
    text: `Question ${i + 1} about ${input.topic}`,
    explanation: "why",
    required: i < 4,
  }));
  return {
    title: `${input.period} ${input.topic} Survey`,
    purpose: `Collect ${input.topic} evidence for ${input.period}.`,
    privacyMode: "named_review_evidence",
    questions,
    safety: sensitive
      ? {
          decision: "needs_revision" as const,
          riskyQuestions: [
            { position: 0, reason: "sensitive/protected topic", saferAlternative: "focus on concrete work contributions" },
          ],
          notes: "Some questions touch sensitive topics.",
        }
      : { decision: "approved" as const, riskyQuestions: [], notes: "All work-related." },
  };
}

export async function validateEvidence(input: {
  answerText: string;
  companyValues: string[];
  goals: string[];
}) {
  const text = input.answerText.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const hasImpact = IMPACT_RE.test(text);
  const hasSource = SOURCE_RE.test(text);
  const qualityScore = Math.max(
    0,
    Math.min(
      1,
      0.25 * Math.min(words / 35, 1) +
        0.3 * (hasImpact ? 0.9 : 0.2) +
        0.2 * (hasSource ? 0.9 : 0.1) +
        0.25 * 0.7,
    ),
  );
  const isWeak = qualityScore < 0.6;
  const status = qualityScore >= 0.7 && !isWeak ? "auto_approved" : "pending_review";
  const missingFields: string[] = [];
  if (!hasImpact) missingFields.push("measurable impact");
  if (!hasSource) missingFields.push("supporting link or artifact");
  return {
    summary: text.length > 150 ? text.slice(0, 147) + "..." : text || "No answer.",
    impact: hasImpact ? "Impact described." : null,
    mappedValue: input.companyValues[0] ?? null,
    qualityScore: Number(qualityScore.toFixed(2)),
    confidence: Number(qualityScore.toFixed(2)),
    isWeak,
    followUpQuestion: isWeak
      ? "Can you add one concrete example, who benefited, what changed, and a supporting link?"
      : null,
    missingFields,
    companyValue: input.companyValues[0] ?? null,
    goal: null as string | null,
    status,
    routedReason: status === "auto_approved" ? "high quality" : "low quality / weak -> review",
  };
}

export async function generateReview(context: {
  evidence: { id: string; summary: string }[];
}) {
  const ids = context.evidence.map((e) => e.id);
  const lines = ["## Summary", "Strong period.", "", "## Achievements"];
  for (const e of context.evidence) lines.push(`- ${e.summary} [${e.id}]`);
  lines.push("", "## Evidence References");
  for (const e of context.evidence) lines.push(`- [${e.id}] ${e.summary}`);
  return {
    markdown: lines.join("\n"),
    evidenceReferences: ids,
    fairness: {
      grounded: ids.length > 0,
      warnings: [] as { type: string; message: string; severity: "low" | "medium" | "high" }[],
      unsupportedClaims: 0,
      citedEvidence: ids,
    },
  };
}

// Type re-export so `import type { ClientReviewContext }` keeps resolving.
export type ClientReviewContext = unknown;
