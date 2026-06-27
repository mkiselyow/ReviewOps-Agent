import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { reviewDrafts, type ReviewDraft, type EvidenceItem } from "../db/schema";
import {
  getUserById,
  getEmployeeGoals,
  getRoleExpectations,
  getCompanyValues,
} from "./hrisService";
import { getEvidenceForReview } from "./evidenceService";
import { assertManagerCanViewEmployee } from "../auth/permissions";
import { assertOwnsReviewDraft } from "../auth/rbac";
import { isoNow } from "../utils/dates";
import { exportFileName, withApprovalFooter } from "../utils/markdown";
import { writeMarkdownExport } from "./exportService";

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
  evidence: EvidenceItem[];
};

export function generateReviewContext(
  managerId: string,
  employeeId: string,
  period: string,
): ReviewContext {
  const employee = getUserById(employeeId);
  assertManagerCanViewEmployee(managerId, employee);

  return {
    employee: {
      id: employee.id,
      displayName: employee.displayName,
      roleTitle: employee.roleTitle,
      department: employee.department,
    },
    period,
    goals: getEmployeeGoals(employeeId, period).map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
    })),
    roleExpectations: getRoleExpectations(employee.roleTitle),
    companyValues: getCompanyValues(),
    // Consent gate: only evidence the employee allowed for review.
    evidence: getEvidenceForReview(managerId, employeeId, period),
  };
}

export function saveReviewDraft(
  managerId: string,
  input: {
    employeeId: string;
    period: string;
    markdown: string;
    groundingReport?: unknown;
    fairnessReport?: unknown;
  },
): ReviewDraft {
  assertManagerCanViewEmployee(managerId, getUserById(input.employeeId));
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

export function getReviewDraft(id: string): ReviewDraft | null {
  return db.select().from(reviewDrafts).where(eq(reviewDrafts.id, id)).get() ?? null;
}

export function listReviewDraftsByManager(managerId: string): ReviewDraft[] {
  return db
    .select()
    .from(reviewDrafts)
    .where(eq(reviewDrafts.managerId, managerId))
    .orderBy(desc(reviewDrafts.createdAt))
    .all();
}

export function updateReviewDraftMarkdown(
  managerId: string,
  draftId: string,
  markdown: string,
): ReviewDraft {
  const draft = getReviewDraft(draftId);
  assertOwnsReviewDraft(managerId, draft);
  return db
    .update(reviewDrafts)
    .set({ draftMarkdown: markdown })
    .where(eq(reviewDrafts.id, draftId))
    .returning()
    .get();
}

export function approveReviewDraft(managerId: string, draftId: string): ReviewDraft {
  const draft = getReviewDraft(draftId);
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

export function exportReviewMarkdown(
  managerId: string,
  draftId: string,
): ExportResult {
  const draft = getReviewDraft(draftId);
  assertOwnsReviewDraft(managerId, draft);
  if (draft.status !== "approved" && draft.status !== "exported") {
    throw new Error("Review draft must be approved before export");
  }

  const employee = getUserById(draft.employeeId);
  const manager = getUserById(managerId);
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
