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

  // Persist as a draft regardless; the manager reviews safety before approving.
  const questionnaire = createQuestionnaire(
    managerId,
    {
      title: generated.output.title,
      purpose: generated.output.purpose,
      period: input.period,
      privacyMode: generated.output.privacyMode,
      evidenceValidation: input.evidenceValidation ?? true,
    },
    generated.output.questions,
  );

  return {
    questionnaire,
    questions: getQuestions(questionnaire.id),
    safety: safety.output as SafetyOutput,
    source: generated.source,
  };
}

// --- 2. Response submission + evidence validation ---------------------------

export type AnswerValidation = {
  questionId: string;
  responseId: string;
  validation: ValidatorOutput;
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

    const validation = await runEvidenceValidatorAgent({
      answerText,
      questionText: textById.get(resp.questionId) ?? "",
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

    // Consent carries through: the evidence inherits the response visibility,
    // so only answers the employee allowed for review become review-usable.
    upsertEvidenceFromResponse(resp.id, {
      employeeId: assignment.respondentId,
      sourceType: "questionnaire_response",
      sourceId: resp.id,
      summary: validation.output.summary,
      impact: validation.output.impact,
      period,
      companyValue: mapped.output.companyValue ?? validation.output.mappedValue,
      goalId: mapped.output.goalId,
      qualityScore: validation.output.qualityScore,
      confidence: mapped.output.confidence,
      visibility: resp.visibility,
    });

    validations.push({
      questionId: resp.questionId,
      responseId: resp.id,
      validation: validation.output,
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

  const draft = await runReviewDraftAgent(privacy.output);

  // Add the real name only to the heading, after the model step.
  const heading = `# Performance Review — ${raw.employee.displayName} (${raw.employee.roleTitle})\n**Period:** ${period}\n`;
  const markdown = `${heading}\n${draft.output.markdown}`;

  const evidenceIds = raw.evidence.map((e) => e.id);
  const fairness = await runFairnessGroundingAgent({ markdown, evidenceIds });

  const grounding = {
    removedCategories: privacy.removedCategories,
    evidenceCount: evidenceIds.length,
    source: draft.source,
  };

  const saved = saveReviewDraft(managerId, {
    employeeId,
    period,
    markdown,
    groundingReport: grounding,
    fairnessReport: fairness.output as FairnessOutput,
  });

  return {
    draft: saved,
    fairness: fairness.output as FairnessOutput,
    grounding,
  };
}
