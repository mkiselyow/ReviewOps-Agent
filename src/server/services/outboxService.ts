import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { outbox, questionnaires, type OutboxMessage } from "../db/schema";
import { getUserById } from "./hrisService";

/**
 * Mock outbox service. Stands in for Slack/email delivery (roadmap item).
 * Records the personal survey links that were "sent" so the demo can re-open
 * them later.
 */

export async function recordDelivery(entry: {
  questionnaireId: string;
  respondentId: string;
  assignmentId: string;
  link: string;
  channel?: string;
}): Promise<OutboxMessage> {
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

export async function getOutboxForManager(managerId: string): Promise<OutboxView[]> {
  const myQuestionnaires = await db
    .select()
    .from(questionnaires)
    .where(eq(questionnaires.createdByManagerId, managerId))
    .all();
  const ids = myQuestionnaires.map((q) => q.id);
  if (ids.length === 0) return [];

  const rows = await db
    .select()
    .from(outbox)
    .where(inArray(outbox.questionnaireId, ids))
    .orderBy(desc(outbox.createdAt))
    .all();

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      respondentName:
        (await getUserById(row.respondentId))?.displayName ?? row.respondentId,
      questionnaireTitle:
        myQuestionnaires.find((q) => q.id === row.questionnaireId)?.title ??
        row.questionnaireId,
    })),
  );
}
