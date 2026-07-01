import { desc } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, type AuditLog } from "../db/schema";

export type AuditAction =
  | "login"
  | "questionnaire_created"
  | "questionnaire_regenerated"
  | "questionnaire_approved"
  | "assignments_created"
  | "reminders_sent"
  | "response_submitted"
  | "evidence_validated"
  | "evidence_submitted"
  | "evidence_reviewed"
  | "review_draft_generated"
  | "review_approved"
  | "review_exported"
  | "access_denied";

export async function logAudit(entry: {
  actorId: string | null;
  action: AuditAction;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db
    .insert(auditLogs)
    .values({
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
    })
    .run();
}

export async function listAudit(limit = 100): Promise<AuditLog[]> {
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .all();
}
