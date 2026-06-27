import { z } from "zod";
import { generateStructured } from "./modelProvider";
import { REVIEW_DRAFT_PROMPT } from "./prompts";

export const reviewDraftInputSchema = z.object({
  employee: z.object({ roleTitle: z.string(), alias: z.string() }),
  period: z.string(),
  goals: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
  roleExpectations: z.array(z.string()).default([]),
  companyValues: z.array(z.string()).default([]),
  evidence: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string(),
        impact: z.string().nullable(),
        period: z.string(),
        companyValue: z.string().nullable(),
        goalId: z.string().nullable(),
        qualityScore: z.number().nullable(),
      }),
    )
    .default([]),
});
export type ReviewDraftInput = z.infer<typeof reviewDraftInputSchema>;

export const reviewDraftOutputSchema = z.object({
  markdown: z.string().min(1),
  evidenceReferences: z.array(z.string()).default([]),
});
export type ReviewDraftOutput = z.infer<typeof reviewDraftOutputSchema>;

function mockDraft(input: ReviewDraftInput): ReviewDraftOutput {
  const ev = [...input.evidence].sort(
    (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0),
  );
  const role = input.employee.roleTitle;
  const refs = ev.map((e) => e.id);

  const lines: string[] = [];

  lines.push("## Summary");
  if (ev.length > 0) {
    const values = [...new Set(ev.map((e) => e.companyValue).filter(Boolean))];
    lines.push(
      `Over ${input.period}, the ${role} contributed ${ev.length} documented piece(s) of evidence` +
        (values.length ? `, demonstrating ${values.join(", ")}.` : ".") +
        " The summary below is grounded only in approved evidence.",
    );
  } else {
    lines.push(
      `No approved evidence was available for ${input.period}. This draft is intentionally limited; collect and approve evidence before finalizing.`,
    );
  }
  lines.push("");

  lines.push("## Achievements");
  if (ev.length > 0) {
    for (const e of ev) lines.push(`- ${e.summary} [${e.id}]`);
  } else {
    lines.push("- _No approved achievements on record for this period._");
  }
  lines.push("");

  lines.push("## Evidence-Backed Examples");
  if (ev.length > 0) {
    for (const e of ev.slice(0, 3)) {
      lines.push(`### ${e.companyValue ?? "Contribution"} [${e.id}]`);
      lines.push(e.summary);
      if (e.impact) lines.push(`- Impact: ${e.impact}`);
      lines.push("");
    }
  } else {
    lines.push("_None._");
    lines.push("");
  }

  lines.push("## Growth Areas");
  const uncovered = input.roleExpectations.slice(0, 2);
  if (uncovered.length > 0) {
    for (const r of uncovered) {
      lines.push(`- Continue to strengthen: ${r.toLowerCase()}.`);
    }
  } else {
    lines.push("- Discuss growth areas together in the review conversation.");
  }
  lines.push("");

  lines.push("## Suggested Next-Period Goals");
  if (input.goals.length > 0) {
    for (const g of input.goals) lines.push(`- Build on goal: ${g.title}.`);
  } else {
    lines.push("- Set 2-3 concrete, measurable goals for the next period.");
  }
  lines.push("");

  lines.push("## Evidence References");
  if (ev.length > 0) {
    for (const e of ev) lines.push(`- [${e.id}] ${e.summary}`);
  } else {
    lines.push("- _No evidence references._");
  }
  lines.push("");

  return { markdown: lines.join("\n"), evidenceReferences: refs };
}

export async function runReviewDraftAgent(input: ReviewDraftInput) {
  const parsed = reviewDraftInputSchema.parse(input);
  return generateStructured({
    agentName: "reviewDraftAgent",
    instruction: REVIEW_DRAFT_PROMPT,
    input: parsed,
    schema: reviewDraftOutputSchema,
    mock: mockDraft,
  });
}
