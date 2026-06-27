import { z } from "zod";
import { generateStructured } from "./modelProvider";
import { VALUES_MAPPER_PROMPT } from "./prompts";

export const valuesMapperInputSchema = z.object({
  summary: z.string(),
  impact: z.string().nullish(),
  companyValues: z.array(z.string()).default([]),
  goals: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
  roleExpectations: z.array(z.string()).default([]),
});
export type ValuesMapperInput = z.infer<typeof valuesMapperInputSchema>;

export const valuesMapperOutputSchema = z.object({
  companyValue: z.string().nullable(),
  goalId: z.string().nullable(),
  roleExpectation: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type ValuesMapperOutput = z.infer<typeof valuesMapperOutputSchema>;

function bestMatch(text: string, candidates: string[]): { value: string | null; score: number } {
  const words = new Set(text.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const cWords = c.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const overlap = cWords.filter((w) => words.has(w)).length;
    const score = cWords.length ? overlap / cWords.length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return { value: best, score: bestScore };
}

function mockMap(input: ValuesMapperInput): ValuesMapperOutput {
  const text = `${input.summary} ${input.impact ?? ""}`;
  const value = bestMatch(text, input.companyValues);
  const goal = bestMatch(
    text,
    input.goals.map((g) => g.title),
  );
  const matchedGoal = input.goals.find((g) => g.title === goal.value) ?? null;
  const expectation = bestMatch(text, input.roleExpectations);

  const confidence = Number(
    Math.max(0.4, (value.score + goal.score + expectation.score) / 3 + 0.4).toFixed(2),
  );

  return {
    companyValue: value.value ?? input.companyValues[0] ?? null,
    goalId: matchedGoal?.id ?? null,
    roleExpectation: expectation.value,
    confidence: Math.min(confidence, 0.95),
  };
}

export async function runValuesMapperAgent(input: ValuesMapperInput) {
  const parsed = valuesMapperInputSchema.parse(input);
  return generateStructured({
    agentName: "valuesMapperAgent",
    instruction: VALUES_MAPPER_PROMPT,
    input: parsed,
    schema: valuesMapperOutputSchema,
    mock: mockMap,
  });
}
