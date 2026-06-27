import { z } from "zod";
import { generateStructured } from "./modelProvider";
import { QUESTIONNAIRE_SAFETY_PROMPT } from "./prompts";

export const safetyInputSchema = z.object({
  questions: z.array(
    z.object({ position: z.number().int(), text: z.string() }),
  ),
});
export type SafetyInput = z.infer<typeof safetyInputSchema>;

export const riskyQuestionSchema = z.object({
  position: z.number().int(),
  text: z.string(),
  reason: z.string(),
  saferAlternative: z.string(),
});

export const safetyOutputSchema = z.object({
  decision: z.enum(["approved", "needs_revision"]),
  riskyQuestions: z.array(riskyQuestionSchema).default([]),
  notes: z.string().default(""),
});
export type SafetyOutput = z.infer<typeof safetyOutputSchema>;

// Protected / off-limits topics (see ARCHITECTURE §5.3).
const SENSITIVE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "health/medical", re: /\b(health|medical|illness|disab|therapy|pregnan)/i },
  { label: "family/private life", re: /\b(family|marriage|spouse|children|kids|divorce|dating|relationship)\b/i },
  { label: "politics", re: /\b(politic|election|party|vote)/i },
  { label: "religion", re: /\b(religion|religious|church|faith|pray)/i },
  { label: "nationality/origin", re: /\b(nationality|ethnic|race|immigrat|citizenship|country of origin)/i },
  { label: "salary/compensation", re: /\b(salary|compensation|pay|bonus|wage)\b/i },
];

const LEADING_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "leading/accusatory wording", re: /\b(don't you|isn't it true|why did you fail|admit that|obviously)\b/i },
];

function mockSafety(input: SafetyInput): SafetyOutput {
  const risky = input.questions
    .map((q) => {
      const sensitive = SENSITIVE_PATTERNS.find((p) => p.re.test(q.text));
      const leading = LEADING_PATTERNS.find((p) => p.re.test(q.text));
      const hit = sensitive ?? leading;
      if (!hit) return null;
      return {
        position: q.position,
        text: q.text,
        reason: `Question may touch a sensitive or inappropriate area: ${hit.label}.`,
        saferAlternative:
          "Rephrase to focus on concrete, work-related contributions and their impact.",
      };
    })
    .filter((x): x is z.infer<typeof riskyQuestionSchema> => x !== null);

  return {
    decision: risky.length > 0 ? "needs_revision" : "approved",
    riskyQuestions: risky,
    notes:
      risky.length > 0
        ? "Some questions need revision before sending."
        : "All questions are work-related and appropriate.",
  };
}

export async function runQuestionnaireSafetyAgent(input: SafetyInput) {
  const parsed = safetyInputSchema.parse(input);
  return generateStructured({
    agentName: "questionnaireSafetyAgent",
    instruction: QUESTIONNAIRE_SAFETY_PROMPT,
    input: parsed,
    schema: safetyOutputSchema,
    mock: mockSafety,
  });
}
