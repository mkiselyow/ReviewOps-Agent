import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { reviewDrafts, type ReviewDraft } from "../db/schema";
import {
  getUserById,
  getEmployeeGoals,
  getRoleExpectations,
  getCompanyValues,
} from "./hrisService";
import { getEvidenceForReview } from "./evidenceService";
import { gatherReviewSignals } from "../connectors";
import { assertManagerCanViewEmployee } from "../auth/permissions";
import { assertOwnsReviewDraft } from "../auth/rbac";
import { isoNow } from "../utils/dates";
import { exportFileName, withApprovalFooter } from "../utils/markdown";
import { writeMarkdownExport } from "./exportService";

/** A grounding item for the review: internal evidence OR an external signal. */
export type ReviewEvidenceLite = {
  id: string;
  summary: string;
  impact: string | null;
  period: string;
  companyValue: string | null;
  goalId: string | null;
  qualityScore: number | null;
  sourceType: string;
};

/**
 * Raw review context assembled from internal data. This is the INPUT to the
 * privacy filter; it must be sanitized before reaching the model.
 */
export type ReviewContext = {
  employee: {
    id: string;
    displayName: string;
    roleTitle: string;
    department: string | null;
  };
  period: string;
  goals: { id: string; title: string; description: string | null }[];
  roleExpectations: string[];
  companyValues: { name: string; description: string }[];
  evidence: ReviewEvidenceLite[];
};

export async function generateReviewContext(
  managerId: string,
  employeeId: string,
  period: string,
): Promise<ReviewContext> {
  const employee = await getUserById(employeeId);
  assertManagerCanViewEmployee(managerId, employee);

  // Consent gate: only evidence the employee allowed for review.
  const ownEvidence: ReviewEvidenceLite[] = (
    await getEvidenceForReview(managerId, employeeId, period)
  ).map((e) => ({
    id: e.id,
    summary: e.summary,
    impact: e.impact,
    period: e.period,
    companyValue: e.companyValue,
    goalId: e.goalId,
    qualityScore: e.qualityScore,
    sourceType: e.sourceType,
  }));

  // External HR signals (Lattice peer reviews / feedback / 1:1 notes) via the
  // connector. Official records the manager already has access to; still pass
  // through the privacy filter before the model.
  const signals = await gatherReviewSignals(managerId, employeeId, period);
  const goals = (await getEmployeeGoals(employeeId, period)).map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
  }));

  return {
    employee: {
      id: employee.id,
      displayName: employee.displayName,
      roleTitle: employee.roleTitle,
      department: employee.department,
    },
    period,
    goals,
    roleExpectations: getRoleExpectations(employee.roleTitle),
    companyValues: getCompanyValues(),
    evidence: [...ownEvidence, ...signals],
  };
}

export async function saveReviewDraft(
  managerId: string,
  input: {
    employeeId: string;
    period: string;
    markdown: string;
    groundingReport?: unknown;
    fairnessReport?: unknown;
  },
): Promise<ReviewDraft> {
  assertManagerCanViewEmployee(managerId, await getUserById(input.employeeId));
  return db
    .insert(reviewDrafts)
    .values({
      employeeId: input.employeeId,
      managerId,
      period: input.period,
      draftMarkdown: input.markdown,
      groundingReportJson: input.groundingReport
        ? JSON.stringify(input.groundingReport)
        : null,
      fairnessReportJson: input.fairnessReport
        ? JSON.stringify(input.fairnessReport)
        : null,
      status: "draft",
    })
    .returning()
    .get();
}

export async function getReviewDraft(id: string): Promise<ReviewDraft | null> {
  return (await db.select().from(reviewDrafts).where(eq(reviewDrafts.id, id)).get()) ?? null;
}

export async function listReviewDraftsByManager(
  managerId: string,
): Promise<ReviewDraft[]> {
  return db
    .select()
    .from(reviewDrafts)
    .where(eq(reviewDrafts.managerId, managerId))
    .orderBy(desc(reviewDrafts.createdAt))
    .all();
}

export async function updateReviewDraftMarkdown(
  managerId: string,
  draftId: string,
  markdown: string,
): Promise<ReviewDraft> {
  const draft = await getReviewDraft(draftId);
  assertOwnsReviewDraft(managerId, draft);
  return db
    .update(reviewDrafts)
    .set({ draftMarkdown: markdown })
    .where(eq(reviewDrafts.id, draftId))
    .returning()
    .get();
}

export async function approveReviewDraft(
  managerId: string,
  draftId: string,
): Promise<ReviewDraft> {
  const draft = await getReviewDraft(draftId);
  assertOwnsReviewDraft(managerId, draft);
  return db
    .update(reviewDrafts)
    .set({ status: "approved", approvedAt: isoNow() })
    .where(eq(reviewDrafts.id, draftId))
    .returning()
    .get();
}

export type ExportResult = {
  fileName: string;
  filePath: string;
  markdown: string;
};

export async function exportReviewMarkdown(
  managerId: string,
  draftId: string,
): Promise<ExportResult> {
  const draft = await getReviewDraft(draftId);
  assertOwnsReviewDraft(managerId, draft);
  if (draft.status !== "approved" && draft.status !== "exported") {
    throw new Error("Review draft must be approved before export");
  }

  const employee = await getUserById(draft.employeeId);
  const manager = await getUserById(managerId);
  const fairness = draft.fairnessReportJson
    ? (JSON.parse(draft.fairnessReportJson) as { warnings?: { message: string }[] })
    : null;

  const finalMarkdown = withApprovalFooter(draft.draftMarkdown, {
    approvedBy: manager?.displayName ?? managerId,
    approvedAt: draft.approvedAt ?? isoNow(),
    fairnessWarnings: fairness?.warnings?.map((w) => w.message),
  });

  const fileName = exportFileName(employee?.displayName ?? draft.employeeId, draft.period);
  const written = writeMarkdownExport(fileName, finalMarkdown);

  db.update(reviewDrafts)
    .set({ status: "exported", exportedAt: isoNow() })
    .where(eq(reviewDrafts.id, draftId))
    .run();

  return { ...written, markdown: finalMarkdown };
}
