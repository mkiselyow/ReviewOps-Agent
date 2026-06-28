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
import { upsertEvidenceFromResponse } from "../services/evidenceService";
import { generateReviewContext, saveReviewDraft } from "../services/reviewService";
import { runQuestionnaireAgent } from "./questionnaireAgent";
import { runQuestionnaireSafetyAgent, type SafetyOutput } from "./questionnaireSafetyAgent";
import { runEvidenceValidatorAgent, type ValidatorOutput } from "./evidenceValidatorAgent";
import { runValuesMapperAgent } from "./valuesMapperAgent";
import { runReviewDraftAgent } from "./reviewDraftAgent";
import { runFairnessGroundingAgent, type FairnessOutput } from "./fairnessGroundingAgent";
import { runPrivacyFilterAgent } from "./privacyFilterAgent";
import {
  usingAgentService,
  generateQuestionnaire,
  validateEvidence,
  generateReview,
  type ClientReviewContext,
} from "../agentClient";

const LONG_FORM_TYPES = new Set(["long_text", "short_text", "evidence_link"]);

/**
 * Orchestrator: routes each workflow through the specialized agents and the
 * permission-checked services, and combines their outputs (see
 * docs/ARCHITECTURE.md §2).
 */

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

  let title: string;
  let purpose: string;
  let privacyMode: string;
  let genQuestions: {
    position: number;
    questionType: string;
    text: string;
    explanation: string;
    required: boolean;
  }[];
  let safetyResult: SafetyOutput;
  let source: string;

  if (usingAgentService()) {
    // Hybrid: the Python ADK 2.0 service runs questionnaire -> safety.
    const r = await generateQuestionnaire({
      topic: input.topic,
      period: input.period,
      purpose: input.purpose,
      roleTitle: input.roleTitle,
      companyValues,
      roleExpectations,
      notes: input.notes,
    });
    title = r.title;
    purpose = r.purpose;
    privacyMode = r.privacyMode;
    genQuestions = r.questions;
    safetyResult = {
      decision: r.safety.decision,
      riskyQuestions: r.safety.riskyQuestions.map((x) => ({
        position: x.position,
        text: "",
        reason: x.reason,
        saferAlternative: x.saferAlternative,
      })),
      notes: r.safety.notes,
    };
    source = "gemini";
  } else {
    // Fallback: in-process TS agents (used by unit tests, no service needed).
    const generated = await runQuestionnaireAgent({
      topic: input.topic,
      purpose: input.purpose,
      period: input.period,
      roleTitle: input.roleTitle,
      companyValues,
      roleExpectations,
      notes: input.notes,
    });
    const safety = await runQuestionnaireSafetyAgent({
      questions: generated.output.questions.map((q) => ({
        position: q.position,
        text: q.text,
      })),
    });
    title = generated.output.title;
    purpose = generated.output.purpose;
    privacyMode = generated.output.privacyMode;
    genQuestions = generated.output.questions;
    safetyResult = safety.output;
    source = generated.source;
  }

  // Persist as a draft regardless; the manager reviews safety before approving.
  const questionnaire = createQuestionnaire(
    managerId,
    {
      title,
      purpose,
      period: input.period,
      privacyMode,
      evidenceValidation: input.evidenceValidation ?? true,
    },
    genQuestions,
  );

  return {
    questionnaire,
    questions: getQuestions(questionnaire.id),
    safety: safetyResult,
    source,
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

    let summary: string;
    let impact: string | null;
    let mappedValue: string | null;
    let qualityScore: number;
    let confidence: number;
    let isWeak: boolean;
    let followUpQuestion: string | null;
    let missingFields: string[];
    let companyValue: string | null;
    let goalId: string | null;

    if (usingAgentService()) {
      // Python service runs evidence validator -> values mapper -> routing.
      const ev = await validateEvidence({
        answerText,
        questionText,
        period,
        roleExpectations,
        companyValues,
        goals: goals.map((g) => g.title),
      });
      summary = ev.summary;
      impact = ev.impact;
      mappedValue = ev.mappedValue;
      qualityScore = ev.qualityScore;
      confidence = ev.confidence;
      isWeak = ev.isWeak;
      followUpQuestion = ev.followUpQuestion;
      missingFields = ev.missingFields;
      companyValue = ev.companyValue ?? ev.mappedValue;
      goalId = goals.find((g) => g.title === ev.goal)?.id ?? null;
    } else {
      const validation = await runEvidenceValidatorAgent({
        answerText,
        questionText,
        period,
        roleExpectations,
        companyValues,
      });
      const mapped = await runValuesMapperAgent({
        summary: validation.output.summary,
        impact: validation.output.impact,
        companyValues,
        goals,
        roleExpectations,
      });
      summary = validation.output.summary;
      impact = validation.output.impact;
      mappedValue = validation.output.mappedValue;
      qualityScore = validation.output.qualityScore;
      confidence = mapped.output.confidence;
      isWeak = validation.output.isWeak;
      followUpQuestion = validation.output.followUpQuestion;
      missingFields = validation.output.missingFields;
      companyValue = mapped.output.companyValue ?? validation.output.mappedValue;
      goalId = mapped.output.goalId;
    }

    // Consent carries through: the evidence inherits the response visibility,
    // so only answers the employee allowed for review become review-usable.
    upsertEvidenceFromResponse(resp.id, {
      employeeId: assignment.respondentId,
      sourceType: "questionnaire_response",
      sourceId: resp.id,
      summary,
      impact,
      period,
      companyValue,
      goalId,
      qualityScore,
      confidence,
      visibility: resp.visibility,
    });

    validations.push({
      questionId: resp.questionId,
      responseId: resp.id,
      validation: { summary, impact, mappedValue, qualityScore, missingFields, isWeak, followUpQuestion },
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

  let bodyMarkdown: string;
  let fairnessData: FairnessData;
  let source: string;

  if (usingAgentService()) {
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
    bodyMarkdown = r.markdown;
    fairnessData = r.fairness;
    source = "gemini";
  } else {
    const draft = await runReviewDraftAgent(privacy.output);
    bodyMarkdown = draft.output.markdown;
    const fairness = await runFairnessGroundingAgent({
      markdown: `${heading}\n${bodyMarkdown}`,
      evidenceIds,
    });
    fairnessData = fairness.output;
    source = draft.source;
  }

  const markdown = `${heading}\n${bodyMarkdown}`;
  const grounding = {
    removedCategories: privacy.removedCategories,
    evidenceCount: evidenceIds.length,
    source,
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
