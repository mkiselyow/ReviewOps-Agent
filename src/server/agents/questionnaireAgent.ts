import { z } from "zod";
import { generateStructured } from "./modelProvider";
import { QUESTIONNAIRE_PROMPT } from "./prompts";
import { PRIVACY_MODES, QUESTION_TYPES } from "../db/schema";

export const questionnaireInputSchema = z.object({
  topic: z.string().min(1),
  purpose: z.string().nullish(),
  period: z.string().min(1),
  roleTitle: z.string().nullish(),
  companyValues: z.array(z.string()).default([]),
  roleExpectations: z.array(z.string()).default([]),
  notes: z.string().nullish(),
});
export type QuestionnaireInput = z.infer<typeof questionnaireInputSchema>;

export const generatedQuestionSchema = z.object({
  position: z.number().int().nonnegative(),
  questionType: z.enum(QUESTION_TYPES),
  text: z.string().min(1),
  explanation: z.string().default(""),
  required: z.boolean().default(true),
});

export const questionnaireOutputSchema = z.object({
  title: z.string().min(1),
  purpose: z.string(),
  privacyMode: z.enum(PRIVACY_MODES),
  questions: z.array(generatedQuestionSchema).min(5).max(7),
});
export type QuestionnaireOutput = z.infer<typeof questionnaireOutputSchema>;

function mockQuestionnaire(input: QuestionnaireInput): QuestionnaireOutput {
  const topic = input.topic.trim();
  const purpose =
    input.purpose?.trim() ||
    `Collect concrete ${topic.toLowerCase()} evidence for ${input.period}.`;
  const questions = [
    {
      position: 0,
      questionType: "long_text" as const,
      text: `Describe a concrete example from ${input.period} that demonstrates ${topic}. What was the situation and what did you do?`,
      explanation: "Captures a specific, work-related example rather than generalities.",
      required: true,
    },
    {
      position: 1,
      questionType: "long_text" as const,
      text: "What was the measurable impact of that work (who benefited, what changed, by how much)?",
      explanation: "Impact is the core of usable performance evidence.",
      required: true,
    },
    {
      position: 2,
      questionType: "evidence_link" as const,
      text: "Share links or artifacts that support this (PRs, tickets, docs, dashboards).",
      explanation: "Source support raises evidence quality and verifiability.",
      required: false,
    },
    {
      position: 3,
      questionType: "long_text" as const,
      text: `Give a second example related to ${topic}, ideally involving collaboration with another team or person.`,
      explanation: "Surfaces cross-team contribution and breadth of evidence.",
      required: true,
    },
    {
      position: 4,
      questionType: "single_choice" as const,
      text: "Which company value does this work best demonstrate?",
      explanation: "Maps evidence to company values for the review.",
      required: false,
    },
    {
      position: 5,
      questionType: "long_text" as const,
      text: "What is one area related to this topic you want to grow in next period?",
      explanation: "Provides balanced, forward-looking growth input.",
      required: false,
    },
  ];

  return {
    title: `${input.period} ${topic} Evidence Survey`,
    purpose,
    privacyMode: "named_review_evidence",
    questions,
  };
}

export async function runQuestionnaireAgent(input: QuestionnaireInput) {
  const parsed = questionnaireInputSchema.parse(input);
  return generateStructured({
    agentName: "questionnaireAgent",
    instruction: QUESTIONNAIRE_PROMPT,
    input: parsed,
    schema: questionnaireOutputSchema,
    mock: mockQuestionnaire,
  });
}
