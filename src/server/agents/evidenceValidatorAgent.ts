import { z } from "zod";
import { generateStructured } from "./modelProvider";
import { EVIDENCE_VALIDATOR_PROMPT } from "./prompts";

export const validatorInputSchema = z.object({
  answerText: z.string(),
  questionText: z.string().default(""),
  period: z.string().default(""),
  roleExpectations: z.array(z.string()).default([]),
  companyValues: z.array(z.string()).default([]),
});
export type ValidatorInput = z.infer<typeof validatorInputSchema>;

export const validatorOutputSchema = z.object({
  summary: z.string(),
  impact: z.string().nullable(),
  mappedValue: z.string().nullable(),
  qualityScore: z.number().min(0).max(1),
  dimensions: z.object({
    specificity: z.number().min(0).max(1),
    impact: z.number().min(0).max(1),
    sourceSupport: z.number().min(0).max(1),
    relevance: z.number().min(0).max(1),
    timeClarity: z.number().min(0).max(1),
    reviewUsability: z.number().min(0).max(1),
  }),
  missingFields: z.array(z.string()).default([]),
  isWeak: z.boolean(),
  followUpQuestion: z.string().nullable(),
});
export type ValidatorOutput = z.infer<typeof validatorOutputSchema>;

const FOLLOW_UP =
  "Can you add one concrete example, who benefited, what changed, and any link or artifact that supports it?";

const IMPACT_RE = /\b(reduc|increas|improv|closed|saved|cut|grew|launch|deliver|fixed|prevent|unblock|\d+\s?%|\d+\s?(bugs|incidents|hours|days|users|tests))/i;
const SOURCE_RE = /\b(PR[-\s]?\d+|BUG[-\s]?\d+|#\d+|JIRA|TICKET|https?:\/\/|\bdoc\b|dashboard)/i;

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mockValidate(input: ValidatorInput): ValidatorOutput {
  const text = input.answerText.trim();
  const words = text ? text.split(/\s+/).length : 0;

  const specificity = clamp(words / 35);
  const impact = IMPACT_RE.test(text) ? 0.85 : words > 12 ? 0.4 : 0.15;
  const sourceSupport = SOURCE_RE.test(text) ? 0.9 : 0.1;
  const relevance = words > 0 ? 0.7 : 0;
  const timeClarity = input.period && (text.includes(input.period) || /\bQ[1-4]\b|\b20\d\d\b/.test(text)) ? 0.7 : 0.4;
  const dims = { specificity, impact, sourceSupport, relevance, timeClarity, reviewUsability: 0 };
  const reviewUsability = clamp(
    0.3 * specificity + 0.3 * impact + 0.2 * sourceSupport + 0.2 * relevance,
  );
  dims.reviewUsability = reviewUsability;

  const qualityScore = clamp(
    0.25 * specificity +
      0.3 * impact +
      0.2 * sourceSupport +
      0.1 * relevance +
      0.05 * timeClarity +
      0.1 * reviewUsability,
  );

  const missingFields: string[] = [];
  if (specificity < 0.5) missingFields.push("concrete example");
  if (impact < 0.5) missingFields.push("measurable impact");
  if (sourceSupport < 0.5) missingFields.push("supporting link or artifact");

  const isWeak = qualityScore < 0.6;

  // Best-effort value mapping for the mock.
  const lower = text.toLowerCase();
  const mappedValue =
    input.companyValues.find((v) => lower.includes(v.toLowerCase().split(" ")[0])) ??
    (input.companyValues[0] ?? null);

  const summary = text
    ? text.length > 160
      ? text.slice(0, 157).trimEnd() + "..."
      : text
    : "No answer provided.";
  const impactSentence =
    impact >= 0.5
      ? (text.split(/(?<=[.!?])\s+/).find((s) => IMPACT_RE.test(s)) ?? null)
      : null;

  return {
    summary,
    impact: impactSentence,
    mappedValue,
    qualityScore: Number(qualityScore.toFixed(2)),
    dimensions: {
      specificity: Number(specificity.toFixed(2)),
      impact: Number(impact.toFixed(2)),
      sourceSupport: Number(sourceSupport.toFixed(2)),
      relevance: Number(relevance.toFixed(2)),
      timeClarity: Number(timeClarity.toFixed(2)),
      reviewUsability: Number(reviewUsability.toFixed(2)),
    },
    missingFields,
    isWeak,
    followUpQuestion: isWeak ? FOLLOW_UP : null,
  };
}

export async function runEvidenceValidatorAgent(input: ValidatorInput) {
  const parsed = validatorInputSchema.parse(input);
  return generateStructured({
    agentName: "evidenceValidatorAgent",
    instruction: EVIDENCE_VALIDATOR_PROMPT,
    input: parsed,
    schema: validatorOutputSchema,
    mock: mockValidate,
  });
}
