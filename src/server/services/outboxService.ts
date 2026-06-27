import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { outbox, questionnaires, type OutboxMessage } from "../db/schema";
import { getUserById } from "./hrisService";

/**
 * Mock outbox service. Stands in for Slack/email delivery (roadmap item).
 * Records the personal survey links that were "sent" so the demo can re-open
 * them later.
 */

export function recordDelivery(entry: {
  questionnaireId: string;
  respondentId: string;
  assignmentId: string;
  link: string;
  channel?: string;
}): OutboxMessage {
  return db
    .insert(outbox)
    .values({
      questionnaireId: entry.questionnaireId,
      respondentId: entry.respondentId,
      assignmentId: entry.assignmentId,
      channel: entry.channel ?? "mock_link",
      link: entry.link,
      status: "queued",
    })
    .returning()
    .get();
}

export type OutboxView = OutboxMessage & {
  respondentName: string;
  questionnaireTitle: string;
};

export function getOutboxForManager(managerId: string): OutboxView[] {
  const myQuestionnaires = db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.createdByManagerId, managerId))
    .all();
  const ids = myQuestionnaires.map((q) => q.id);
  if (ids.length === 0) return [];

  return db
    .select()
    .from(outbox)
    .where(inArray(outbox.questionnaireId, ids))
    .orderBy(desc(outbox.createdAt))
    .all()
    .map((row) => ({
      ...row,
      respondentName: getUserById(row.respondentId)?.displayName ?? row.respondentId,
      questionnaireTitle:
        myQuestionnaires.find((q) => q.id === row.questionnaireId)?.title ??
        row.questionnaireId,
    }));
}
