import {
  getCompanyValues,
  getCompanyValueNames,
  getEmployeeGoals,
  getEmployeeProfile,
  getRoleExpectations,
} from "../services/hrisService";
import {
  createQuestionnaire,
  replaceQuestions,
  getQuestionnaire,
  getQuestions,
  submitResponseByToken,
  getAssignmentByToken,
  type SubmittedAnswer,
} from "../services/surveyService";
import { assertOwnsQuestionnaire } from "../auth/rbac";
import { PermissionError } from "../auth/permissions";
import {
  upsertEvidenceFromResponse,
  createEvidenceItem,
  updateOwnEvidence,
} from "../services/evidenceService";
import { validateAndRoute } from "./evidenceValidation";
import { generateReviewContext, saveReviewDraft } from "../services/reviewService";
import { runPrivacyFilterAgent } from "./privacyFilterAgent";
import { normalizeGeneratedQuestions } from "./normalizeQuestions";
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

/** A human-readable concern from a validation result (shown to the manager). */
function concernFrom(v: {
  isWeak: boolean;
  missingFields: string[];
  followUpQuestion: string | null;
}): string | null {
  if (!v.isWeak) return null;
  const parts: string[] = [];
  if (v.missingFields?.length) parts.push(`Missing: ${v.missingFields.join(", ")}`);
  if (v.followUpQuestion) parts.push(v.followUpQuestion);
  return parts.join(" — ") || "Low-confidence / weak evidence.";
}

// --- 1. Questionnaire generation + safety -----------------------------------

/** The stored generation request, replayed (with extra feedback) on regenerate. */
export type QuestionnaireGenInput = {
  topic: string;
  purpose?: string;
  period: string;
  deadline?: string;
  roleTitle?: string;
  notes?: string;
  evidenceValidation?: boolean;
};

/** Run the agent + normalize; returns the pieces both create and regenerate persist. */
async function runQuestionnaireAgent(gen: QuestionnaireGenInput) {
  const companyValues = getCompanyValueNames();
  const roleExpectations = gen.roleTitle ? getRoleExpectations(gen.roleTitle) : [];

  // The Python ADK 2.0 service runs questionnaire -> safety. The manager's
  // "validate evidence" toggle doubles as the per-question evidence gate.
  const r = await generateQuestionnaire({
    topic: gen.topic,
    period: gen.period,
    purpose: gen.purpose,
    roleTitle: gen.roleTitle,
    companyValues,
    roleExpectations,
    notes: gen.notes,
    requireEvidence: gen.evidenceValidation ?? true,
  });
  let safety: SafetyResult = {
    decision: r.safety.decision,
    riskyQuestions: r.safety.riskyQuestions,
    notes: r.safety.notes,
  };
  // Hard-refuse: if the request was dominated by prohibited topics, the agent
  // refuses (no questions). Force needs_revision deterministically and surface
  // the reason — never let a refused request be reported as approved.
  if (r.refused || (r.questions.length === 0 && r.refusalReason)) {
    safety = {
      decision: "needs_revision",
      riskyQuestions: safety.riskyQuestions,
      notes: r.refusalReason || safety.notes || "Request asked for prohibited topics.",
    };
  }
  // Enforce question invariants deterministically before persisting (the model
  // output is untrusted: strip evidence from non-text fields, drop empty
  // choices, clear stray gates). See normalizeQuestions.
  const questions = normalizeGeneratedQuestions(r.questions);
  return { r, safety, questions };
}

export async function orchestrateQuestionnaireGeneration(
  managerId: string,
  input: QuestionnaireGenInput,
) {
  const { r, safety, questions } = await runQuestionnaireAgent(input);

  // Persist as a draft (with the safety report + scale legend) for the manager
  // to review. The generation input is kept so the draft can be regenerated.
  const questionnaire = await createQuestionnaire(
    managerId,
    {
      title: r.title,
      purpose: r.purpose,
      period: input.period,
      deadline: input.deadline ?? null,
      privacyMode: r.privacyMode,
      evidenceValidation: input.evidenceValidation ?? true,
      safetyJson: JSON.stringify(safety),
      scaleLegendJson: JSON.stringify(r.scaleLegend),
      genInputJson: JSON.stringify(input),
    },
    questions,
  );

  return {
    questionnaire,
    questions: await getQuestions(questionnaire.id),
    safety,
    source: "gemini",
  };
}

/**
 * Re-generate a DRAFT questionnaire's questions, applying the manager's
 * free-text feedback on top of the original request. Replaces the draft's
 * questions in place (same id), so the preview URL is stable. Ownership +
 * draft-status are enforced.
 */
export async function orchestrateQuestionnaireRegeneration(
  managerId: string,
  questionnaireId: string,
  feedback: string,
) {
  const existing = await getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, existing);
  if (existing.status !== "draft") {
    throw new PermissionError("Only draft questionnaires can be refined", 409);
  }

  const base: QuestionnaireGenInput = existing.genInputJson
    ? JSON.parse(existing.genInputJson)
    : {
        topic: existing.title,
        purpose: existing.purpose ?? undefined,
        period: existing.period,
        evidenceValidation: existing.evidenceValidation,
      };

  // Accumulate feedback into the notes so successive refinements stack.
  const notes = [base.notes, `\n\n[Manager revision request]: ${feedback}`]
    .filter(Boolean)
    .join("");
  const gen: QuestionnaireGenInput = { ...base, notes };

  const { r, safety, questions } = await runQuestionnaireAgent(gen);

  const questionnaire = await replaceQuestions(managerId, questionnaireId, questions, {
    title: r.title,
    purpose: r.purpose,
    privacyMode: r.privacyMode,
    safetyJson: JSON.stringify(safety),
    scaleLegendJson: JSON.stringify(r.scaleLegend),
    genInputJson: JSON.stringify(gen),
  });

  return {
    questionnaire,
    questions: await getQuestions(questionnaireId),
    safety,
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
  const assignmentPre = await getAssignmentByToken(token);
  // submitResponseByToken re-validates the token + expiry and resolves identity.
  const { assignment, responses } = await submitResponseByToken(token, answers);

  const questionnaire = await getQuestionnaire(assignment.questionnaireId);
  // Evidence validation can be disabled per questionnaire: store plain responses
  // and skip scoring / follow-ups / evidence-card creation.
  if (questionnaire && !questionnaire.evidenceValidation) {
    return { validations: [] };
  }
  const period = questionnaire?.period ?? "";
  const employee = await getEmployeeProfile(assignment.respondentId);
  const roleExpectations = employee ? getRoleExpectations(employee.roleTitle) : [];
  const companyValues = getCompanyValueNames();
  const goals = (await getEmployeeGoals(assignment.respondentId, period)).map((g) => ({
    id: g.id,
    title: g.title,
  }));
  const questions = await getQuestions(assignment.questionnaireId);
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
    await upsertEvidenceFromResponse(resp.id, {
      employeeId: assignment.respondentId,
      sourceType: "questionnaire_response",
      sourceId: resp.id,
      sourceText: answerText,
      summary: v.summary,
      impact: v.impact,
      concern: concernFrom(v),
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
  // Consent-gated raw context (only allow_for_review evidence) + external
  // HR signals (peer reviews / feedback / 1:1s) via the connector layer.
  const raw = await generateReviewContext(managerId, employeeId, period);

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

  const saved = await saveReviewDraft(managerId, {
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
export type EvidenceSubmissionResult =
  | { status: "needs_confirmation"; validation: AnswerValidationData & { status: string } }
  | {
      status: "stored";
      evidence: Awaited<ReturnType<typeof createEvidenceItem>>;
      validation: AnswerValidationData & { status: string };
    };

export async function orchestrateEvidenceSubmission(
  employeeId: string,
  input: {
    text: string;
    period: string;
    visibility?: string;
    /** Set true to store weak evidence anyway (employee confirmed). */
    confirmWeak?: boolean;
    /** When iterating, the id of the unreviewed item to update in place. */
    evidenceId?: string;
  },
): Promise<EvidenceSubmissionResult> {
  const employee = await getEmployeeProfile(employeeId);
  const roleExpectations = employee ? getRoleExpectations(employee.roleTitle) : [];
  const companyValues = getCompanyValueNames();
  const goals = (await getEmployeeGoals(employeeId, input.period)).map((g) => ({
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

  // Confirm-before-store: don't persist weak evidence until the employee either
  // improves it or explicitly chooses to submit it for manager review.
  if (v.isWeak && !input.confirmWeak) {
    return { status: "needs_confirmation", validation: v };
  }

  const fields = {
    sourceText: input.text,
    summary: v.summary,
    impact: v.impact,
    concern: concernFrom(v),
    period: input.period,
    companyValue: v.companyValue,
    goalId: v.goalId,
    qualityScore: v.qualityScore,
    confidence: v.confidence,
    visibility: input.visibility ?? "allow_for_review",
    status: v.status,
  };

  // Dedup: while iterating, update the SAME unreviewed item instead of creating
  // a duplicate. Once a manager has approved/rejected, the item is locked and a
  // fresh submission becomes a new item.
  let evidence = input.evidenceId
    ? await updateOwnEvidence(employeeId, input.evidenceId, fields)
    : null;
  if (!evidence) {
    evidence = await createEvidenceItem({ employeeId, sourceType: "manual_upload", ...fields });
  }

  return { status: "stored", evidence, validation: v };
}
