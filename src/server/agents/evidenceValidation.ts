import { validateEvidence } from "../agentClient";

/**
 * Validate one piece of evidence and surface the confidence-gated routing
 * decision computed by the Python agent service. Shared by the
 * questionnaire-response loop and the standalone employee-evidence flow.
 */

export const CONFIDENCE_THRESHOLD = 0.7;

export type EvidenceValidation = {
  summary: string;
  impact: string | null;
  mappedValue: string | null;
  qualityScore: number;
  confidence: number;
  isWeak: boolean;
  followUpQuestion: string | null;
  missingFields: string[];
  companyValue: string | null;
  goalId: string | null;
  status: "auto_approved" | "pending_review";
  routedReason: string;
};

export async function validateAndRoute(input: {
  answerText: string;
  questionText: string;
  period: string;
  roleExpectations: string[];
  companyValues: string[];
  goals: { id: string; title: string }[];
}): Promise<EvidenceValidation> {
  const ev = await validateEvidence({
    answerText: input.answerText,
    questionText: input.questionText,
    period: input.period,
    roleExpectations: input.roleExpectations,
    companyValues: input.companyValues,
    goals: input.goals.map((g) => g.title),
  });
  return {
    summary: ev.summary,
    impact: ev.impact,
    mappedValue: ev.mappedValue,
    qualityScore: ev.qualityScore,
    confidence: ev.confidence,
    isWeak: ev.isWeak,
    followUpQuestion: ev.followUpQuestion,
    missingFields: ev.missingFields,
    companyValue: ev.companyValue ?? ev.mappedValue,
    goalId: input.goals.find((g) => g.title === ev.goal)?.id ?? null,
    status: ev.status,
    routedReason: ev.routedReason,
  };
}
