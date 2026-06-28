import {
  getCompanyValues,
  getCompanyValueNames,
  getEmployeeGoals,
  getEmployeeProfile,
  getRoleExpectations,
} from "../services/hrisService";
import {
  createQuestionnaire,
  getQuestionnaire,
  getQuestions,
  submitResponseByToken,
  getAssignmentByToken,
  type SubmittedAnswer,
} from "../services/surveyService";
import {
  upsertEvidenceFromResponse,
  createEvidenceItem,
} from "../services/evidenceService";
import { validateAndRoute } from "./evidenceValidation";
import { generateReviewContext, saveReviewDraft } from "../services/reviewService";
import { runPrivacyFilterAgent } from "./privacyFilterAgent";
import {
  generateQuestionnaire,
  generateReview,
  type ClientReviewContext,
} from "../agentClient";

const LONG_FORM_TYPES = new Set(["long_text", "short_text", "evidence_link"]);

/**
 * Orchestrator: gathers permission-checked, minimized context, calls the Python
 * ADK 2.0 agent service over REST (`agentClient`), and persists the results.
 * The deterministic privacy filter runs in TS before the call
 * (see docs/ARCHITECTURE.md §2). Requires AGENT_SERVICE_URL.
 */

/** Questionnaire safety review shape (from the service). */
type SafetyResult = {
  decision: "approved" | "needs_revision";
  riskyQuestions: { position: number; reason: string; saferAlternative: string }[];
  notes: string;
};

// --- 1. Questionnaire generation + safety -----------------------------------

export async function orchestrateQuestionnaireGeneration(
  managerId: string,
  input: {
    topic: string;
    purpose?: string;
    period: string;
    roleTitle?: string;
    notes?: string;
    evidenceValidation?: boolean;
  },
) {
  const companyValues = getCompanyValueNames();
  const roleExpectations = input.roleTitle ? getRoleExpectations(input.roleTitle) : [];

  // The Python ADK 2.0 service runs questionnaire -> safety.
  const r = await generateQuestionnaire({
    topic: input.topic,
    period: input.period,
    purpose: input.purpose,
    roleTitle: input.roleTitle,
    companyValues,
    roleExpectations,
    notes: input.notes,
  });
  const safetyResult: SafetyResult = {
    decision: r.safety.decision,
    riskyQuestions: r.safety.riskyQuestions,
    notes: r.safety.notes,
  };

  // Persist as a draft (with the safety report) for the manager to review.
  const questionnaire = createQuestionnaire(
    managerId,
    {
      title: r.title,
      purpose: r.purpose,
      period: input.period,
      privacyMode: r.privacyMode,
      evidenceValidation: input.evidenceValidation ?? true,
      safetyJson: JSON.stringify(safetyResult),
    },
    r.questions,
  );

  return {
    questionnaire,
    questions: getQuestions(questionnaire.id),
    safety: safetyResult,
    source: "gemini",
  };
}

// --- 2. Response submission + evidence validation ---------------------------

/** The subset of validation surfaced to the UI (both agent paths produce it). */
export type AnswerValidationData = {
  summary: string;
  impact: string | null;
  mappedValue: string | null;
  qualityScore: number;
  missingFields: string[];
  isWeak: boolean;
  followUpQuestion: string | null;
};

export type AnswerValidation = {
  questionId: string;
  responseId: string;
  validation: AnswerValidationData;
};

export async function orchestrateResponseSubmission(
  token: string,
  answers: SubmittedAnswer[],
): Promise<{ validations: AnswerValidation[] }> {
  const assignmentPre = getAssignmentByToken(token);
  // submitResponseByToken re-validates the token + expiry and resolves identity.
  const { assignment, responses } = submitResponseByToken(token, answers);

  const questionnaire = getQuestionnaire(assignment.questionnaireId);
  // Evidence validation can be disabled per questionnaire: store plain responses
  // and skip scoring / follow-ups / evidence-card creation.
  if (questionnaire && !questionnaire.evidenceValidation) {
    return { validations: [] };
  }
  const period = questionnaire?.period ?? "";
  const employee = getEmployeeProfile(assignment.respondentId);
  const roleExpectations = employee ? getRoleExpectations(employee.roleTitle) : [];
  const companyValues = getCompanyValueNames();
  const goals = getEmployeeGoals(assignment.respondentId, period).map((g) => ({
    id: g.id,
    title: g.title,
  }));
  const questions = getQuestions(assignment.questionnaireId);
  const typeById = new Map(questions.map((q) => [q.id, q.questionType]));
  const textById = new Map(questions.map((q) => [q.id, q.text]));

  const validations: AnswerValidation[] = [];

  for (const resp of responses) {
    const qType = typeById.get(resp.questionId) ?? "long_text";
    const answerText = resp.answerText ?? "";
    if (!LONG_FORM_TYPES.has(qType) || answerText.trim().length === 0) continue;
    const questionText = textById.get(resp.questionId) ?? "";

    const v = await validateAndRoute({
      answerText,
      questionText,
      period,
      roleExpectations,
      companyValues,
      goals,
    });

    // Consent carries through: the evidence inherits the response visibility,
    // so only answers the employee allowed for review become review-usable.
    upsertEvidenceFromResponse(resp.id, {
      employeeId: assignment.respondentId,
      sourceType: "questionnaire_response",
      sourceId: resp.id,
      summary: v.summary,
      impact: v.impact,
      period,
      companyValue: v.companyValue,
      goalId: v.goalId,
      qualityScore: v.qualityScore,
      confidence: v.confidence,
      visibility: resp.visibility,
    });

    validations.push({
      questionId: resp.questionId,
      responseId: resp.id,
      validation: {
        summary: v.summary,
        impact: v.impact,
        mappedValue: v.mappedValue,
        qualityScore: v.qualityScore,
        missingFields: v.missingFields,
        isWeak: v.isWeak,
        followUpQuestion: v.followUpQuestion,
      },
    });
  }

  void assignmentPre;
  return { validations };
}

// --- 3. Review draft generation + privacy + fairness ------------------------

export async function orchestrateReviewGeneration(
  managerId: string,
  employeeId: string,
  period: string,
) {
  // Consent-gated raw context (only allow_for_review evidence).
  const raw = generateReviewContext(managerId, employeeId, period);

  // Privacy filter BEFORE the model sees anything (deterministic).
  const privacy = runPrivacyFilterAgent({
    employee: { id: raw.employee.id, displayName: raw.employee.displayName, roleTitle: raw.employee.roleTitle },
    period: raw.period,
    goals: raw.goals,
    roleExpectations: raw.roleExpectations,
    companyValues: raw.companyValues,
    evidence: raw.evidence.map((e) => ({
      id: e.id,
      summary: e.summary,
      impact: e.impact,
      period: e.period,
      companyValue: e.companyValue,
      goalId: e.goalId,
      qualityScore: e.qualityScore,
    })),
  });

  const evidenceIds = raw.evidence.map((e) => e.id);
  // Add the real name only to the heading, after the model step.
  const heading = `# Performance Review — ${raw.employee.displayName} (${raw.employee.roleTitle})\n**Period:** ${period}\n`;

  // Python service runs privacy -> review draft -> fairness on the sanitized
  // context (alias only; the heading/name is added here, after the model).
  const ctx: ClientReviewContext = {
    employee: {
      role_title: privacy.output.employee.roleTitle,
      alias: privacy.output.employee.alias,
    },
    period: privacy.output.period,
    goals: privacy.output.goals,
    role_expectations: privacy.output.roleExpectations,
    company_values: privacy.output.companyValues,
    evidence: privacy.output.evidence.map((e) => ({
      id: e.id,
      summary: e.summary,
      impact: e.impact,
      period: e.period,
      company_value: e.companyValue,
      goal_id: e.goalId,
      quality_score: e.qualityScore,
    })),
  };
  const r = await generateReview(ctx);
  const bodyMarkdown = r.markdown;
  const fairnessData: FairnessData = r.fairness;

  const markdown = `${heading}\n${bodyMarkdown}`;
  const grounding = {
    removedCategories: privacy.removedCategories,
    evidenceCount: evidenceIds.length,
    source: "gemini",
  };

  const saved = saveReviewDraft(managerId, {
    employeeId,
    period,
    markdown,
    groundingReport: grounding,
    fairnessReport: fairnessData,
  });

  return { draft: saved, fairness: fairnessData, grounding };
}

/** Fairness report shape returned to the app (both agent paths produce it). */
type FairnessData = {
  grounded: boolean;
  warnings: { type: string; message: string; severity: "low" | "medium" | "high" }[];
  unsupportedClaims: number;
  citedEvidence: string[];
};

// --- 4. Standalone employee evidence submission -----------------------------

/**
 * An employee submits a piece of evidence directly (not via a questionnaire).
 * The validator scores it and the confidence gate routes it: high-confidence →
 * auto-approved; low → pending manager review.
 */
export async function orchestrateEvidenceSubmission(
  employeeId: string,
  input: { text: string; period: string; visibility?: string },
) {
  const employee = getEmployeeProfile(employeeId);
  const roleExpectations = employee ? getRoleExpectations(employee.roleTitle) : [];
  const companyValues = getCompanyValueNames();
  const goals = getEmployeeGoals(employeeId, input.period).map((g) => ({
    id: g.id,
    title: g.title,
  }));

  const v = await validateAndRoute({
    answerText: input.text,
    questionText: "Self-submitted success evidence",
    period: input.period,
    roleExpectations,
    companyValues,
    goals,
  });

  const evidence = createEvidenceItem({
    employeeId,
    sourceType: "manual_upload",
    summary: v.summary,
    impact: v.impact,
    period: input.period,
    companyValue: v.companyValue,
    goalId: v.goalId,
    qualityScore: v.qualityScore,
    confidence: v.confidence,
    visibility: input.visibility ?? "allow_for_review",
    status: v.status,
  });

  return { evidence, validation: v };
}
