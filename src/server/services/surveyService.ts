import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import {
  questionnaires,
  questions,
  surveyAssignments,
  responses,
  type Questionnaire,
  type Question,
  type SurveyAssignment,
  type Response,
  type EvidenceItem,
} from "../db/schema";
import { getUserById } from "./hrisService";
import { recordDelivery } from "./outboxService";
import { getEvidenceByResponseIds } from "./evidenceService";
import { assertOwnsQuestionnaire } from "../auth/rbac";
import {
  assertManagerCanViewEmployee,
  assertTokenUsable,
  NotFoundError,
  PermissionError,
} from "../auth/permissions";
import { generateToken, hashToken } from "../utils/crypto";
import { tokenExpiryIso, isoNow, deadlineToExpiryIso } from "../utils/dates";

export type NewQuestionInput = {
  position: number;
  questionType: string;
  text: string;
  options?: string[] | null;
  required?: boolean;
  evidenceRequired?: boolean;
  section?: string | null;
  optIn?: boolean;
  explanation?: string | null;
};

export async function createQuestionnaire(
  managerId: string,
  input: {
    title: string;
    purpose?: string | null;
    period: string;
    deadline?: string | null;
    privacyMode?: string;
    evidenceValidation?: boolean;
    safetyJson?: string | null;
    scaleLegendJson?: string | null;
    genInputJson?: string | null;
  },
  questionList: NewQuestionInput[] = [],
): Promise<Questionnaire> {
  const created = await db
    .insert(questionnaires)
    .values({
      createdByManagerId: managerId,
      title: input.title,
      purpose: input.purpose ?? null,
      period: input.period,
      deadline: input.deadline ?? null,
      privacyMode: input.privacyMode ?? "named_review_evidence",
      evidenceValidation: input.evidenceValidation ?? true,
      safetyJson: input.safetyJson ?? null,
      scaleLegendJson: input.scaleLegendJson ?? null,
      genInputJson: input.genInputJson ?? null,
      status: "draft",
    })
    .returning()
    .get();

  if (questionList.length > 0) {
    await addQuestions(created.id, questionList);
  }
  return created;
}

/**
 * Replace ALL questions of a draft questionnaire (used by regenerate). Ownership
 * + draft-status are enforced; deleting questions is safe because assignments
 * are only created after approval.
 */
export async function replaceQuestions(
  managerId: string,
  questionnaireId: string,
  questionList: NewQuestionInput[],
  patch: {
    title?: string;
    purpose?: string | null;
    privacyMode?: string;
    safetyJson?: string | null;
    scaleLegendJson?: string | null;
    genInputJson?: string | null;
  } = {},
): Promise<Questionnaire> {
  const q = await getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, q);
  if (q.status !== "draft") {
    throw new PermissionError("Only draft questionnaires can be edited", 409);
  }
  await db.delete(questions).where(eq(questions.questionnaireId, questionnaireId)).run();
  await addQuestions(questionnaireId, questionList);
  return db
    .update(questionnaires)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.purpose !== undefined ? { purpose: patch.purpose } : {}),
      ...(patch.privacyMode !== undefined ? { privacyMode: patch.privacyMode } : {}),
      ...(patch.safetyJson !== undefined ? { safetyJson: patch.safetyJson } : {}),
      ...(patch.scaleLegendJson !== undefined
        ? { scaleLegendJson: patch.scaleLegendJson }
        : {}),
      ...(patch.genInputJson !== undefined ? { genInputJson: patch.genInputJson } : {}),
    })
    .where(eq(questionnaires.id, questionnaireId))
    .returning()
    .get();
}

export async function addQuestions(
  questionnaireId: string,
  questionList: NewQuestionInput[],
): Promise<Question[]> {
  if (questionList.length === 0) return [];
  return db
    .insert(questions)
    .values(
      questionList.map((q) => ({
        questionnaireId,
        position: q.position,
        questionType: q.questionType,
        text: q.text,
        optionsJson: q.options && q.options.length > 0 ? JSON.stringify(q.options) : null,
        required: q.required ?? true,
        evidenceRequired: q.evidenceRequired ?? false,
        section: q.section ?? null,
        optIn: q.optIn ?? false,
        explanation: q.explanation ?? null,
      })),
    )
    .returning()
    .all();
}

export async function getQuestionnaire(id: string): Promise<Questionnaire | null> {
  return (
    (await db.select().from(questionnaires).where(eq(questionnaires.id, id)).get()) ?? null
  );
}

export async function getQuestions(questionnaireId: string): Promise<Question[]> {
  return db
    .select()
    .from(questions)
    .where(eq(questions.questionnaireId, questionnaireId))
    .orderBy(questions.position)
    .all();
}

export async function listQuestionnairesByManager(
  managerId: string,
): Promise<Questionnaire[]> {
  return db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.createdByManagerId, managerId))
    .orderBy(desc(questionnaires.createdAt))
    .all();
}

export async function approveQuestionnaire(
  managerId: string,
  questionnaireId: string,
): Promise<Questionnaire> {
  const q = await getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, q);
  return db
    .update(questionnaires)
    .set({ status: "approved", approvedAt: isoNow() })
    .where(eq(questionnaires.id, questionnaireId))
    .returning()
    .get();
}

/**
 * Edit the questionnaire deadline and REOPEN outstanding survey links: every
 * assignment that hasn't been submitted has its `expiresAt` bumped to the new
 * deadline (end of day) — or the default token lifetime if the deadline is
 * cleared — so the employee's existing link works again. Submitted assignments
 * are left as-is. Used when a latecomer needs to still respond.
 */
export async function updateQuestionnaireDeadline(
  managerId: string,
  questionnaireId: string,
  deadline: string | null,
): Promise<{ questionnaire: Questionnaire; reopened: number }> {
  const q = await getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, q);

  const questionnaire = await db
    .update(questionnaires)
    .set({ deadline: deadline ?? null })
    .where(eq(questionnaires.id, questionnaireId))
    .returning()
    .get();

  const newExpiry = deadlineToExpiryIso(deadline) ?? tokenExpiryIso();
  const assignments = await getAssignmentsForQuestionnaire(questionnaireId);
  let reopened = 0;
  for (const a of assignments) {
    if (a.status === "submitted") continue;
    // Reset a previously expired/revoked link so it is usable again.
    const status = a.status === "expired" || a.status === "revoked" ? "pending" : a.status;
    await db
      .update(surveyAssignments)
      .set({ expiresAt: newExpiry, status })
      .where(eq(surveyAssignments.id, a.id))
      .run();
    reopened++;
  }
  return { questionnaire, reopened };
}

export type GeneratedLink = {
  assignmentId: string;
  respondentId: string;
  respondentName: string;
  link: string;
};

/**
 * Creates one assignment per respondent and a mock-outbox link. Enforces that
 * every respondent is a direct report of the manager BEFORE creating anything.
 * Only the token hash is stored on the assignment.
 */
export async function createSurveyAssignments(
  managerId: string,
  questionnaireId: string,
  respondentIds: string[],
): Promise<GeneratedLink[]> {
  const q = await getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, q);
  if (q.status !== "approved" && q.status !== "sent") {
    throw new PermissionError("Questionnaire must be approved before sending", 409);
  }

  // Validate scope for ALL respondents before mutating anything.
  const respondents = await Promise.all(
    respondentIds.map(async (id) => {
      const user = await getUserById(id);
      assertManagerCanViewEmployee(managerId, user);
      return user;
    }),
  );

  // If the questionnaire has a deadline in the future, links expire at the END of
  // that day; otherwise fall back to the default token lifetime.
  const deadlineIso = deadlineToExpiryIso(q.deadline);
  const futureDeadline =
    deadlineIso && new Date(deadlineIso).getTime() > Date.now() ? deadlineIso : null;

  const links: GeneratedLink[] = [];
  for (const respondent of respondents) {
    const token = generateToken();
    const assignment = await db
      .insert(surveyAssignments)
      .values({
        questionnaireId,
        respondentId: respondent.id,
        tokenHash: hashToken(token),
        expiresAt: futureDeadline ?? tokenExpiryIso(),
        status: "pending",
      })
      .returning()
      .get();

    const link = `/employee/survey/${token}`;
    await recordDelivery({
      questionnaireId,
      respondentId: respondent.id,
      assignmentId: assignment.id,
      link,
    });

    links.push({
      assignmentId: assignment.id,
      respondentId: respondent.id,
      respondentName: respondent.displayName,
      link,
    });
  }

  await db
    .update(questionnaires)
    .set({ status: "sent", sentAt: isoNow() })
    .where(eq(questionnaires.id, questionnaireId))
    .run();

  return links;
}

/** Resolve an assignment from a raw token. Respondent identity is derived here. */
export async function getAssignmentByToken(
  token: string,
): Promise<SurveyAssignment | null> {
  const hash = hashToken(token);
  return (
    (await db
      .select()
      .from(surveyAssignments)
      .where(eq(surveyAssignments.tokenHash, hash))
      .get()) ?? null
  );
}

export async function markAssignmentOpened(assignmentId: string): Promise<void> {
  const a = await db
    .select()
    .from(surveyAssignments)
    .where(eq(surveyAssignments.id, assignmentId))
    .get();
  if (a && a.status === "pending") {
    await db
      .update(surveyAssignments)
      .set({ status: "opened", openedAt: isoNow() })
      .where(eq(surveyAssignments.id, assignmentId))
      .run();
  }
}

export type SubmittedAnswer = {
  questionId: string;
  answerText: string;
  visibility?: string;
};

/**
 * Submit (or re-submit) answers using ONLY the token. The respondent id always
 * comes from the assignment resolved by token, never from caller input.
 */
export async function submitResponseByToken(
  token: string,
  answers: SubmittedAnswer[],
): Promise<{ assignment: SurveyAssignment; responses: Response[] }> {
  const assignment = await getAssignmentByToken(token);
  assertTokenUsable(assignment);

  const validQuestionIds = new Set(
    (await getQuestions(assignment.questionnaireId)).map((q) => q.id),
  );

  const saved: Response[] = [];
  for (const ans of answers) {
    if (!validQuestionIds.has(ans.questionId)) {
      throw new NotFoundError("Question does not belong to this survey");
    }
    const existing = await db
      .select()
      .from(responses)
      .where(
        and(
          eq(responses.assignmentId, assignment.id),
          eq(responses.questionId, ans.questionId),
        ),
      )
      .get();

    if (existing) {
      const updated = await db
        .update(responses)
        .set({
          answerText: ans.answerText,
          visibility: ans.visibility ?? existing.visibility,
          updatedAt: isoNow(),
        })
        .where(eq(responses.id, existing.id))
        .returning()
        .get();
      saved.push(updated);
    } else {
      const inserted = await db
        .insert(responses)
        .values({
          assignmentId: assignment.id,
          questionId: ans.questionId,
          answerText: ans.answerText,
          visibility: ans.visibility ?? "share_with_manager",
        })
        .returning()
        .get();
      saved.push(inserted);
    }
  }

  const updatedAssignment = await db
    .update(surveyAssignments)
    .set({ status: "submitted", submittedAt: isoNow() })
    .where(eq(surveyAssignments.id, assignment.id))
    .returning()
    .get();

  return { assignment: updatedAssignment, responses: saved };
}

export async function getResponsesForAssignment(
  assignmentId: string,
): Promise<Response[]> {
  return db
    .select()
    .from(responses)
    .where(eq(responses.assignmentId, assignmentId))
    .all();
}

export async function getAssignmentsForQuestionnaire(
  questionnaireId: string,
): Promise<SurveyAssignment[]> {
  return db
    .select()
    .from(surveyAssignments)
    .where(eq(surveyAssignments.questionnaireId, questionnaireId))
    .all();
}

export type RespondentResult = {
  respondentId: string;
  respondentName: string;
  status: string;
  submittedAt: string | null;
  responses: Response[];
  evidence: EvidenceItem[];
  evidenceCount: number;
  weakEvidenceCount: number;
  averageQuality: number | null;
  mappedValues: string[];
};

export type QuestionnaireResults = {
  questionnaire: Questionnaire;
  questions: Question[];
  respondents: RespondentResult[];
};

/**
 * Manager results view. Enforces questionnaire ownership; each respondent is a
 * direct report (validated at assignment creation). Evidence is fetched through
 * the permission-checked evidence service.
 */
export async function getQuestionnaireResults(
  managerId: string,
  questionnaireId: string,
): Promise<QuestionnaireResults> {
  const questionnaire = await getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, questionnaire);

  const assignments = await getAssignmentsForQuestionnaire(questionnaireId);
  const respondents: RespondentResult[] = await Promise.all(
    assignments.map(async (a) => {
      const user = await getUserById(a.respondentId);
      const responsesForA = await getResponsesForAssignment(a.id);
      // Scope evidence to THIS questionnaire's responses (not the employee's whole
      // period), so a fresh questionnaire shows nothing until someone responds.
      const evidence = await getEvidenceByResponseIds(
        managerId,
        a.respondentId,
        responsesForA.map((r) => r.id),
      );
      const scored = evidence.filter((e) => e.qualityScore != null);
      const avg =
        scored.length > 0
          ? scored.reduce((sum, e) => sum + (e.qualityScore ?? 0), 0) / scored.length
          : null;
      const weak = evidence.filter(
        (e) => e.qualityScore != null && (e.qualityScore ?? 0) < 0.6,
      ).length;
      const mappedValues = [
        ...new Set(evidence.map((e) => e.companyValue).filter((v): v is string => !!v)),
      ];

      return {
        respondentId: a.respondentId,
        respondentName: user?.displayName ?? a.respondentId,
        status: a.status,
        submittedAt: a.submittedAt,
        responses: responsesForA,
        evidence,
        evidenceCount: evidence.length,
        weakEvidenceCount: weak,
        averageQuality: avg,
        mappedValues,
      };
    }),
  );

  return {
    questionnaire,
    questions: await getQuestions(questionnaireId),
    respondents,
  };
}
