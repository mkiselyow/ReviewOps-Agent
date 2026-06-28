import { usingAgentService, validateEvidence } from "../agentClient";
import { runEvidenceValidatorAgent } from "./evidenceValidatorAgent";
import { runValuesMapperAgent } from "./valuesMapperAgent";

/**
 * Validate one piece of evidence and compute the confidence-gated routing
 * decision. Uses the Python service when `AGENT_SERVICE_URL` is set, else the
 * in-process TS agents. Shared by the questionnaire-response loop and the
 * standalone employee-evidence flow.
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
  if (usingAgentService()) {
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

  // TS fallback (offline / unit tests).
  const v = await runEvidenceValidatorAgent({
    answerText: input.answerText,
    questionText: input.questionText,
    period: input.period,
    roleExpectations: input.roleExpectations,
    companyValues: input.companyValues,
  });
  const m = await runValuesMapperAgent({
    summary: v.output.summary,
    impact: v.output.impact,
    companyValues: input.companyValues,
    goals: input.goals,
    roleExpectations: input.roleExpectations,
  });
  const confidence = m.output.confidence;
  const isWeak = v.output.isWeak;
  const qualityScore = v.output.qualityScore;
  // The TS validator has no model-confidence field, so route on quality score.
  const auto = qualityScore >= CONFIDENCE_THRESHOLD && !isWeak;
  return {
    summary: v.output.summary,
    impact: v.output.impact,
    mappedValue: v.output.mappedValue,
    qualityScore,
    confidence,
    isWeak,
    followUpQuestion: v.output.followUpQuestion,
    missingFields: v.output.missingFields,
    companyValue: m.output.companyValue ?? v.output.mappedValue,
    goalId: m.output.goalId,
    status: auto ? "auto_approved" : "pending_review",
    routedReason: auto
      ? `quality ${qualityScore.toFixed(2)} >= ${CONFIDENCE_THRESHOLD} and not weak`
      : `quality ${qualityScore.toFixed(2)} < ${CONFIDENCE_THRESHOLD} or weak -> manager review`,
  };
}
