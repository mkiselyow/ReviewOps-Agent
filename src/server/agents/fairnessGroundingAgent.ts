import { z } from "zod";
import { generateStructured } from "./modelProvider";
import { FAIRNESS_GROUNDING_PROMPT } from "./prompts";
import { redactPii } from "../tools/privacyTools";

export const fairnessInputSchema = z.object({
  markdown: z.string(),
  evidenceIds: z.array(z.string()).default([]),
});
export type FairnessInput = z.infer<typeof fairnessInputSchema>;

export const fairnessWarningSchema = z.object({
  type: z.enum([
    "unsupported_claim",
    "vague_praise",
    "vague_criticism",
    "recency_bias",
    "source_imbalance",
    "sensitive_data",
    "compensation_language",
  ]),
  message: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

export const fairnessOutputSchema = z.object({
  grounded: z.boolean(),
  warnings: z.array(fairnessWarningSchema).default([]),
  unsupportedClaims: z.number().int().nonnegative(),
  citedEvidence: z.array(z.string()).default([]),
});
export type FairnessOutput = z.infer<typeof fairnessOutputSchema>;

const CITATION_RE = /\[([a-z0-9_]+)\]/gi;
const VAGUE_PRAISE_RE = /\b(great|excellent|amazing|awesome|fantastic|rockstar|10x|good job|very good)\b/i;
const VAGUE_CRITICISM_RE = /\b(not good|bad|weak|poor|disappointing|needs improvement)\b/i;
// Whole-word matches only, so e.g. "pipeline" does not trip "pip" and
// "raised the bar" does not trip compensation language.
const COMP_RE = /\b(promotion|promote|promoted|bonus|salary|compensation|ranking|rank|pip|demotion|demote|termination|terminate|fired)\b/i;

function sectionLines(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      inSection = h[1].trim().toLowerCase() === heading.toLowerCase();
      continue;
    }
    if (inSection) out.push(line);
  }
  return out;
}

function mockFairness(input: FairnessInput): FairnessOutput {
  const warnings: z.infer<typeof fairnessWarningSchema>[] = [];

  // Cited evidence ids that actually exist in the approved set.
  const cited = new Set<string>();
  for (const m of input.markdown.matchAll(CITATION_RE)) {
    if (input.evidenceIds.includes(m[1])) cited.add(m[1]);
  }

  // Unsupported claims: the Achievements section is the canonical claim list;
  // each achievement bullet must carry an evidence citation. (Examples are
  // elaborations of already-cited achievements.)
  const claimLines = sectionLines(input.markdown, "Achievements").filter(
    (l) => /^[-*]\s+\S/.test(l) && !/_no /i.test(l),
  );

  let unsupported = 0;
  for (const line of claimLines) {
    if (!CITATION_RE.test(line)) {
      unsupported++;
      warnings.push({
        type: "unsupported_claim",
        message: `Claim has no evidence citation: "${line.replace(/^[-*]\s+/, "").slice(0, 80)}"`,
        severity: "high",
      });
    }
    CITATION_RE.lastIndex = 0;
  }

  if (VAGUE_PRAISE_RE.test(input.markdown)) {
    warnings.push({
      type: "vague_praise",
      message: "Contains vague praise; replace with specific, evidence-backed statements.",
      severity: "medium",
    });
  }
  if (VAGUE_CRITICISM_RE.test(input.markdown)) {
    warnings.push({
      type: "vague_criticism",
      message: "Contains vague criticism; tie feedback to concrete, observable evidence.",
      severity: "medium",
    });
  }
  if (COMP_RE.test(input.markdown)) {
    warnings.push({
      type: "compensation_language",
      message: "Contains compensation/promotion/ranking language, which is out of scope for this tool.",
      severity: "high",
    });
  }
  const pii = redactPii(input.markdown);
  if (pii.removedCategories.length > 0) {
    warnings.push({
      type: "sensitive_data",
      message: `Possible sensitive personal data detected (${pii.removedCategories.join(", ")}).`,
      severity: "high",
    });
  }
  if (cited.size > 0 && cited.size < 2) {
    warnings.push({
      type: "source_imbalance",
      message: "Review relies on very few evidence sources; gather more before finalizing.",
      severity: "low",
    });
  }
  if (input.evidenceIds.length === 0) {
    warnings.push({
      type: "unsupported_claim",
      message: "No approved evidence is available to ground this review.",
      severity: "high",
    });
  }

  const grounded =
    unsupported === 0 &&
    input.evidenceIds.length > 0 &&
    !warnings.some(
      (w) =>
        w.severity === "high" &&
        (w.type === "compensation_language" || w.type === "sensitive_data"),
    );

  return {
    grounded,
    warnings,
    unsupportedClaims: unsupported,
    citedEvidence: [...cited],
  };
}

export async function runFairnessGroundingAgent(input: FairnessInput) {
  const parsed = fairnessInputSchema.parse(input);
  return generateStructured({
    agentName: "fairnessGroundingAgent",
    instruction: FAIRNESS_GROUNDING_PROMPT,
    input: parsed,
    schema: fairnessOutputSchema,
    mock: mockFairness,
  });
}
