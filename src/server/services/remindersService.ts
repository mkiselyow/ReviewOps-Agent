import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { outbox, type Questionnaire } from "../db/schema";
import {
  getQuestionnaire,
  getAssignmentsForQuestionnaire,
  listQuestionnairesByManager,
} from "./surveyService";
import { getUserById } from "./hrisService";
import { recordDelivery } from "./outboxService";
import { assertOwnsQuestionnaire } from "../auth/rbac";

/**
 * Ambient/proactive layer: surface incomplete/overdue questionnaires and let the
 * manager nudge outstanding respondents. Reminders are written to the mock
 * outbox (channel "reminder") — the same delivery seam Slack/email would use.
 * Post-deploy, Cloud Scheduler can call `sendReminders` for each open
 * questionnaire to make this fully event-driven.
 */

// Don't re-nudge the same respondent within this window (no double-nudge).
const REMIND_WINDOW_MS = 12 * 60 * 60 * 1000;

export function isOverdue(deadline: string | null): boolean {
  return !!deadline && new Date(deadline).getTime() < Date.now();
}

export type ReminderTarget = {
  assignmentId: string;
  respondentId: string;
  respondentName: string;
  status: string;
};

export type QuestionnaireReminderView = {
  questionnaireId: string;
  title: string;
  deadline: string | null;
  overdue: boolean;
  total: number;
  submitted: number;
  outstanding: number;
  targets: ReminderTarget[];
};

async function buildView(q: Questionnaire): Promise<QuestionnaireReminderView> {
  const assignments = await getAssignmentsForQuestionnaire(q.id);
  const outstanding = assignments.filter((a) => a.status !== "submitted");
  return {
    questionnaireId: q.id,
    title: q.title,
    deadline: q.deadline,
    overdue: isOverdue(q.deadline) && outstanding.length > 0,
    total: assignments.length,
    submitted: assignments.length - outstanding.length,
    outstanding: outstanding.length,
    targets: await Promise.all(
      outstanding.map(async (a) => ({
        assignmentId: a.id,
        respondentId: a.respondentId,
        respondentName: (await getUserById(a.respondentId))?.displayName ?? a.respondentId,
        status: a.status,
      })),
    ),
  };
}

/** Completion + reminder view for every SENT questionnaire a manager owns. */
export async function getManagerReminderViews(
  managerId: string,
): Promise<QuestionnaireReminderView[]> {
  const sent = (await listQuestionnairesByManager(managerId)).filter(
    (q) => q.status === "sent",
  );
  return Promise.all(sent.map(buildView));
}

/**
 * Nudge every outstanding (not-submitted) respondent of a questionnaire. Writes a
 * "reminder" outbox row reusing the respondent's original survey link, skipping
 * anyone already nudged within REMIND_WINDOW_MS. Ownership enforced.
 */
export async function sendReminders(
  managerId: string,
  questionnaireId: string,
): Promise<{ sent: number; skipped: number }> {
  const q = await getQuestionnaire(questionnaireId);
  assertOwnsQuestionnaire(managerId, q);

  const outstanding = (await getAssignmentsForQuestionnaire(questionnaireId)).filter(
    (a) => a.status !== "submitted",
  );
  const now = Date.now();
  let sent = 0;
  let skipped = 0;

  for (const a of outstanding) {
    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.assignmentId, a.id))
      .orderBy(desc(outbox.createdAt))
      .all();
    const lastReminder = rows.find((r) => r.channel === "reminder");
    if (lastReminder && now - new Date(lastReminder.createdAt).getTime() < REMIND_WINDOW_MS) {
      skipped++;
      continue;
    }
    // Reuse the original delivery link (raw tokens are never stored elsewhere).
    const link = rows[0]?.link ?? "";
    await recordDelivery({
      questionnaireId,
      respondentId: a.respondentId,
      assignmentId: a.id,
      link,
      channel: "reminder",
    });
    sent++;
  }
  return { sent, skipped };
}
