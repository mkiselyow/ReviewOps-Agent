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
} from "../db/schema";
import { getUserById } from "./hrisService";
import { recordDelivery } from "./outboxService";
import { getEmployeeEvidence, getEvidenceByResponseIds } from "./evidenceService";
import { assertOwnsQuestionnaire } from "../auth/rbac";
import {
  assertManagerCanViewEmployee,
  assertTokenUsable,
  NotFoundError,
  PermissionError,
} from "../auth/permissions";
import { generateToken, hashToken } from "../utils/crypto";
import { tokenExpiryIso, isoNow } from "../utils/dates";

export type NewQuestionInput = {
  position: number;
  questionType: string;
  text: string;
  options?: string[] | null;
  required?: boolean;
  evidenceRequired?: boolean;
  explanation?: string | null;
};

export function createQuestionnaire(
  managerId: string,
  input: {
    title: string;
    purpose?: string | null;
    period: string;
    privacyMode?: string;
    evidenceValidation?: boolean;
  },
  questionList: NewQuestionInput[] = [],
): Questionnaire {
  const created = db
    .insert(questionnaires)
    .values({
      createdByManagerId: managerId,
      title: input.title,
      purpose: input.purpose ?? null,
      period: input.period,
      privacyMode: input.privacyMode ?? "named_review_evidence",
      evidenceValidation: input.evidenceValidation ?? true,
      status: "draft",
    })
    .returning()
    .get();

  if (questionList.length > 0) {
    addQuestions(created.id, questionList);
  }
  return created;
}

export function addQuestions(
  questionnaireId: string,
  questionList: NewQuestionInput[],
): Question[] {
  if (questionList.length === 0) return [];
  return db
    .insert(questions)
    .values(
      questionList.map((q) => ({
        questionnaireId,
        position: q.position,
        questionType: q.questionType,
        text: q.text,
        optionsJson: q.options ? JSON.stringify(q.options) : null,
        required: q.required ?? true,
        evidenceRequired: q.evidenceRequired ?? true,
        explanation: q.explanation ?? null,
      })),
    )
    .returning()
    .all();
}

export function getQuestionnaire(id: string): Questionnaire | null {
  return db.select().from(questionnaires).where(eq(questionnaires.id, id)).get() ?? null;
}

export function getQuestions(questionnaireId: string): Question[] {
  return db
    .select()
    .from(questions)
    .where(eq(questions.questionnaireId, questionnaireId))
    .orderBy(questions.position)
    .all();
}

export function listQuestionnairesByManager(managerId: string): Questionnaire[] {
  return db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.createdByManagerId, managerId))
    .orderBy(desc(questionnaires.createdAt))
    .all();
}

export function approveQuestionnaire(
  managerId: string,
  questionnaireId: string,
): Questionnaire {
  const q = getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, q);
  return db
    .update(questionnaires)
    .set({ status: "approved", approvedAt: isoNow() })
    .where(eq(questionnaires.id, questionnaireId))
    .returning()
    .get();
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
export function createSurveyAssignments(
  managerId: string,
  questionnaireId: string,
  respondentIds: string[],
): GeneratedLink[] {
  const q = getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, q);
  if (q.status !== "approved" && q.status !== "sent") {
    throw new PermissionError("Questionnaire must be approved before sending", 409);
  }

  // Validate scope for ALL respondents before mutating anything.
  const respondents = respondentIds.map((id) => {
    const user = getUserById(id);
    assertManagerCanViewEmployee(managerId, user);
    return user;
  });

  const links: GeneratedLink[] = [];
  for (const respondent of respondents) {
    const token = generateToken();
    const assignment = db
      .insert(surveyAssignments)
      .values({
        questionnaireId,
        respondentId: respondent.id,
        tokenHash: hashToken(token),
        expiresAt: tokenExpiryIso(),
        status: "pending",
      })
      .returning()
      .get();

    const link = `/employee/survey/${token}`;
    recordDelivery({
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

  db.update(questionnaires)
    .set({ status: "sent", sentAt: isoNow() })
    .where(eq(questionnaires.id, questionnaireId))
    .run();

  return links;
}

/** Resolve an assignment from a raw token. Respondent identity is derived here. */
export function getAssignmentByToken(token: string): SurveyAssignment | null {
  const hash = hashToken(token);
  return (
    db.select().from(surveyAssignments).where(eq(surveyAssignments.tokenHash, hash)).get() ??
    null
  );
}

export function markAssignmentOpened(assignmentId: string): void {
  const a = db
    .select()
    .from(surveyAssignments)
    .where(eq(surveyAssignments.id, assignmentId))
    .get();
  if (a && a.status === "pending") {
    db.update(surveyAssignments)
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
export function submitResponseByToken(
  token: string,
  answers: SubmittedAnswer[],
): { assignment: SurveyAssignment; responses: Response[] } {
  const assignment = getAssignmentByToken(token);
  assertTokenUsable(assignment);

  const validQuestionIds = new Set(
    getQuestions(assignment.questionnaireId).map((q) => q.id),
  );

  const saved: Response[] = [];
  for (const ans of answers) {
    if (!validQuestionIds.has(ans.questionId)) {
      throw new NotFoundError("Question does not belong to this survey");
    }
    const existing = db
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
      const updated = db
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
      const inserted = db
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

  const updatedAssignment = db
    .update(surveyAssignments)
    .set({ status: "submitted", submittedAt: isoNow() })
    .where(eq(surveyAssignments.id, assignment.id))
    .returning()
    .get();

  return { assignment: updatedAssignment, responses: saved };
}

export function getResponsesForAssignment(assignmentId: string): Response[] {
  return db
    .select()
    .from(responses)
    .where(eq(responses.assignmentId, assignmentId))
    .all();
}

export function getAssignmentsForQuestionnaire(
  questionnaireId: string,
): SurveyAssignment[] {
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
  evidence: ReturnType<typeof getEmployeeEvidence>;
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
export function getQuestionnaireResults(
  managerId: string,
  questionnaireId: string,
): QuestionnaireResults {
  const questionnaire = getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, questionnaire);

  const assignments = getAssignmentsForQuestionnaire(questionnaireId);
  const respondents: RespondentResult[] = assignments.map((a) => {
    const user = getUserById(a.respondentId);
    const responsesForA = getResponsesForAssignment(a.id);
    // Scope evidence to THIS questionnaire's responses (not the employee's whole
    // period), so a fresh questionnaire shows nothing until someone responds.
    const evidence = getEvidenceByResponseIds(
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
  });

  return { questionnaire, questions: getQuestions(questionnaireId), respondents };
}
