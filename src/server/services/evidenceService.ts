import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  evidenceItems,
  attachments,
  responses,
  type EvidenceItem,
} from "../db/schema";
import { getUserById, getDirectReports } from "./hrisService";
import { assertManagerCanViewEmployee } from "../auth/permissions";
import { isoNow } from "../utils/dates";

export type EvidenceInput = {
  employeeId: string;
  sourceType: string;
  sourceId?: string | null;
  sourceText?: string | null;
  summary: string;
  impact?: string | null;
  concern?: string | null;
  period: string;
  companyValue?: string | null;
  goalId?: string | null;
  qualityScore?: number | null;
  confidence?: number | null;
  visibility?: string;
  status?: string;
};

export async function createEvidenceItem(input: EvidenceInput): Promise<EvidenceItem> {
  return db
    .insert(evidenceItems)
    .values({
      employeeId: input.employeeId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceText: input.sourceText ?? null,
      summary: input.summary,
      impact: input.impact ?? null,
      concern: input.concern ?? null,
      period: input.period,
      companyValue: input.companyValue ?? null,
      goalId: input.goalId ?? null,
      qualityScore: input.qualityScore ?? null,
      confidence: input.confidence ?? null,
      visibility: input.visibility ?? "share_with_manager",
      status: input.status ?? "approved",
    })
    .returning()
    .get();
}

/** An employee's own evidence item by id (used by the improve-loop dedup). */
export async function getOwnEvidenceById(
  employeeId: string,
  evidenceId: string,
): Promise<EvidenceItem | null> {
  const ev = await db
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.id, evidenceId))
    .get();
  return ev && ev.employeeId === employeeId ? ev : null;
}

/**
 * Update an employee's OWN evidence in place (the improve-loop). Only allowed
 * while the item is still unreviewed (auto_approved / pending_review / draft);
 * once a manager has approved or rejected it, it is locked and this returns null
 * so the caller creates a fresh item instead.
 */
export async function updateOwnEvidence(
  employeeId: string,
  evidenceId: string,
  fields: Partial<EvidenceInput> & { status?: string },
): Promise<EvidenceItem | null> {
  const ev = await getOwnEvidenceById(employeeId, evidenceId);
  if (!ev) return null;
  const editable = ["auto_approved", "pending_review", "draft"];
  if (!editable.includes(ev.status)) return null; // manager-reviewed -> locked
  return db
    .update(evidenceItems)
    .set({
      sourceText: fields.sourceText ?? ev.sourceText,
      summary: fields.summary ?? ev.summary,
      impact: fields.impact ?? ev.impact,
      concern: fields.concern ?? ev.concern,
      companyValue: fields.companyValue ?? ev.companyValue,
      goalId: fields.goalId ?? ev.goalId,
      qualityScore: fields.qualityScore ?? ev.qualityScore,
      confidence: fields.confidence ?? ev.confidence,
      visibility: fields.visibility ?? ev.visibility,
      status: fields.status ?? ev.status,
      updatedAt: isoNow(),
    })
    .where(eq(evidenceItems.id, evidenceId))
    .returning()
    .get();
}

/**
 * Create or update the evidence item derived from a single questionnaire
 * response (keyed by sourceId = responseId), so re-validating an improved
 * answer upgrades the same card instead of duplicating it.
 */
export async function upsertEvidenceFromResponse(
  responseId: string,
  input: EvidenceInput,
): Promise<EvidenceItem> {
  const existing = await db
    .select()
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.sourceType, "questionnaire_response"),
        eq(evidenceItems.sourceId, responseId),
      ),
    )
    .get();

  if (existing) {
    return db
      .update(evidenceItems)
      .set({
        sourceText: input.sourceText ?? existing.sourceText,
        summary: input.summary,
        impact: input.impact ?? null,
        concern: input.concern ?? null,
        companyValue: input.companyValue ?? null,
        goalId: input.goalId ?? null,
        qualityScore: input.qualityScore ?? null,
        confidence: input.confidence ?? null,
        visibility: input.visibility ?? existing.visibility,
        updatedAt: isoNow(),
      })
      .where(eq(evidenceItems.id, existing.id))
      .returning()
      .get();
  }

  return createEvidenceItem({
    ...input,
    sourceType: "questionnaire_response",
    sourceId: responseId,
  });
}

export async function attachFile(
  evidenceId: string,
  file: {
    fileName: string;
    filePath: string;
    contentType?: string | null;
    uploadedBy?: string | null;
    piiScanStatus?: string;
  },
) {
  return db
    .insert(attachments)
    .values({
      evidenceId,
      fileName: file.fileName,
      filePath: file.filePath,
      contentType: file.contentType ?? null,
      uploadedBy: file.uploadedBy ?? null,
      piiScanStatus: file.piiScanStatus ?? "pending",
    })
    .returning()
    .get();
}

async function listEvidence(
  employeeId: string,
  period?: string,
): Promise<EvidenceItem[]> {
  const where = period
    ? and(eq(evidenceItems.employeeId, employeeId), eq(evidenceItems.period, period))
    : eq(evidenceItems.employeeId, employeeId);
  return db.select().from(evidenceItems).where(where).all();
}

/**
 * Manager-facing evidence for an employee. Enforces manager scope and hides
 * employee private drafts.
 */
export async function getEmployeeEvidence(
  managerId: string,
  employeeId: string,
  period?: string,
): Promise<EvidenceItem[]> {
  assertManagerCanViewEmployee(managerId, await getUserById(employeeId));
  return (await listEvidence(employeeId, period)).filter(
    (e) => e.visibility !== "private_draft",
  );
}

/**
 * Evidence usable as REVIEW input. Consent gate: only items the employee
 * explicitly marked `allow_for_review` may ground a review draft.
 */
export async function getEvidenceForReview(
  managerId: string,
  employeeId: string,
  period?: string,
): Promise<EvidenceItem[]> {
  assertManagerCanViewEmployee(managerId, await getUserById(employeeId));
  // Consent gate + only approved/auto-approved evidence may ground a review
  // (pending_review / rejected evidence is excluded until a manager approves).
  return (await listEvidence(employeeId, period)).filter(
    (e) =>
      e.visibility === "allow_for_review" &&
      (e.status === "approved" || e.status === "auto_approved"),
  );
}

/** Pending-review evidence across a manager's direct reports (the review queue). */
export async function getPendingEvidenceForManager(
  managerId: string,
): Promise<(EvidenceItem & { employeeName: string })[]> {
  const reports = await getDirectReports(managerId);
  const ids = reports.map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(evidenceItems)
    .where(
      and(
        inArray(evidenceItems.employeeId, ids),
        eq(evidenceItems.status, "pending_review"),
      ),
    )
    .all();
  return rows.map((e) => ({
    ...e,
    employeeName: reports.find((r) => r.id === e.employeeId)?.displayName ?? e.employeeId,
  }));
}

/** Manager approve/reject of a pending evidence item (permission-checked). */
export async function setEvidenceStatus(
  managerId: string,
  evidenceId: string,
  status: "approved" | "rejected",
): Promise<EvidenceItem> {
  const ev = await db
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.id, evidenceId))
    .get();
  assertManagerCanViewEmployee(managerId, ev ? await getUserById(ev.employeeId) : null);
  return db
    .update(evidenceItems)
    .set({ status, updatedAt: isoNow() })
    .where(eq(evidenceItems.id, evidenceId))
    .returning()
    .get();
}

/** An employee's own evidence (all statuses) — for the employee dashboard. */
export async function getOwnEvidence(employeeId: string): Promise<EvidenceItem[]> {
  return listEvidence(employeeId);
}

export async function getResponseById(responseId: string) {
  return (
    (await db.select().from(responses).where(eq(responses.id, responseId)).get()) ??
    null
  );
}

/**
 * Evidence derived from a specific set of questionnaire responses. Used by the
 * results page so a questionnaire only shows evidence from ITS responses — not
 * the employee's whole period of evidence (which would leak seed/other-survey
 * evidence into a fresh questionnaire).
 */
export async function getEvidenceByResponseIds(
  managerId: string,
  employeeId: string,
  responseIds: string[],
): Promise<EvidenceItem[]> {
  assertManagerCanViewEmployee(managerId, await getUserById(employeeId));
  if (responseIds.length === 0) return [];
  return db
    .select()
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.sourceType, "questionnaire_response"),
        inArray(evidenceItems.sourceId, responseIds),
      ),
    )
    .all();
}
