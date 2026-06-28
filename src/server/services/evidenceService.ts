import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  evidenceItems,
  attachments,
  responses,
  type EvidenceItem,
} from "../db/schema";
import { getUserById } from "./hrisService";
import { assertManagerCanViewEmployee } from "../auth/permissions";
import { isoNow } from "../utils/dates";

export type EvidenceInput = {
  employeeId: string;
  sourceType: string;
  sourceId?: string | null;
  summary: string;
  impact?: string | null;
  period: string;
  companyValue?: string | null;
  goalId?: string | null;
  qualityScore?: number | null;
  confidence?: number | null;
  visibility?: string;
};

export function createEvidenceItem(input: EvidenceInput): EvidenceItem {
  return db
    .insert(evidenceItems)
    .values({
      employeeId: input.employeeId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      summary: input.summary,
      impact: input.impact ?? null,
      period: input.period,
      companyValue: input.companyValue ?? null,
      goalId: input.goalId ?? null,
      qualityScore: input.qualityScore ?? null,
      confidence: input.confidence ?? null,
      visibility: input.visibility ?? "share_with_manager",
    })
    .returning()
    .get();
}

/**
 * Create or update the evidence item derived from a single questionnaire
 * response (keyed by sourceId = responseId), so re-validating an improved
 * answer upgrades the same card instead of duplicating it.
 */
export function upsertEvidenceFromResponse(
  responseId: string,
  input: EvidenceInput,
): EvidenceItem {
  const existing = db
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
        summary: input.summary,
        impact: input.impact ?? null,
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

export function attachFile(
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

function listEvidence(employeeId: string, period?: string): EvidenceItem[] {
  const where = period
    ? and(eq(evidenceItems.employeeId, employeeId), eq(evidenceItems.period, period))
    : eq(evidenceItems.employeeId, employeeId);
  return db.select().from(evidenceItems).where(where).all();
}

/**
 * Manager-facing evidence for an employee. Enforces manager scope and hides
 * employee private drafts.
 */
export function getEmployeeEvidence(
  managerId: string,
  employeeId: string,
  period?: string,
): EvidenceItem[] {
  assertManagerCanViewEmployee(managerId, getUserById(employeeId));
  return listEvidence(employeeId, period).filter(
    (e) => e.visibility !== "private_draft",
  );
}

/**
 * Evidence usable as REVIEW input. Consent gate: only items the employee
 * explicitly marked `allow_for_review` may ground a review draft.
 */
export function getEvidenceForReview(
  managerId: string,
  employeeId: string,
  period?: string,
): EvidenceItem[] {
  assertManagerCanViewEmployee(managerId, getUserById(employeeId));
  return listEvidence(employeeId, period).filter(
    (e) => e.visibility === "allow_for_review",
  );
}

export function getResponseById(responseId: string) {
  return db.select().from(responses).where(eq(responses.id, responseId)).get() ?? null;
}

/**
 * Evidence derived from a specific set of questionnaire responses. Used by the
 * results page so a questionnaire only shows evidence from ITS responses — not
 * the employee's whole period of evidence (which would leak seed/other-survey
 * evidence into a fresh questionnaire).
 */
export function getEvidenceByResponseIds(
  managerId: string,
  employeeId: string,
  responseIds: string[],
): EvidenceItem[] {
  assertManagerCanViewEmployee(managerId, getUserById(employeeId));
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
