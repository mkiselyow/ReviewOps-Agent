import { desc } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, type AuditLog } from "../db/schema";

export type AuditAction =
  | "login"
  | "questionnaire_created"
  | "questionnaire_approved"
  | "assignments_created"
  | "response_submitted"
  | "evidence_validated"
  | "review_draft_generated"
  | "review_approved"
  | "review_exported"
  | "access_denied";

export function logAudit(entry: {
  actorId: string | null;
  action: AuditAction;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  db.insert(auditLogs)
    .values({
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
    })
    .run();
}

export function listAudit(limit = 100): AuditLog[] {
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .all();
}
