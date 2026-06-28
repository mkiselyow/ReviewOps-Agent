import { randomUUID } from "node:crypto";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * SQLite schema for ReviewOps Agent (see docs/ARCHITECTURE.md §5).
 *
 * Conventions:
 * - ids are UUID strings
 * - timestamps are ISO-8601 text strings (UTC)
 * - enum-like columns store text; the allowed values are exported as const
 *   arrays and re-validated with Zod at the service/agent boundary.
 */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const createdAt = () =>
  text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

const updatedAt = () =>
  text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

// ---------------------------------------------------------------------------
// Enum value sets
// ---------------------------------------------------------------------------

export const QUESTIONNAIRE_STATUSES = [
  "draft",
  "approved",
  "sent",
  "closed",
  "archived",
] as const;

export const PRIVACY_MODES = [
  "named_review_evidence",
  "anonymous_team_pulse",
  "confidential_hr_only",
] as const;

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "rating",
  "evidence_link",
  "attachment",
] as const;

export const ASSIGNMENT_STATUSES = [
  "pending",
  "opened",
  "submitted",
  "expired",
  "revoked",
] as const;

export const RESPONSE_VISIBILITY = [
  "private_draft",
  "share_with_manager",
  "allow_for_review",
  "anonymous_aggregate",
] as const;

export const EVIDENCE_SOURCE_TYPES = [
  "questionnaire_response",
  "manual_upload",
  "manager_note",
  "mock_github",
  "mock_lattice",
] as const;

export const EVIDENCE_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "auto_approved",
] as const;

export const REVIEW_STATUSES = [
  "draft",
  "needs_revision",
  "approved",
  "exported",
] as const;

export const PII_SCAN_STATUSES = ["pending", "clean", "flagged"] as const;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  roleTitle: text("role_title").notNull(),
  department: text("department"),
  managerId: text("manager_id"),
  employmentStatus: text("employment_status").notNull().default("active"),
  isHrAdmin: integer("is_hr_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const goals = sqliteTable("goals", {
  id: id(),
  employeeId: text("employee_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  period: text("period").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const questionnaires = sqliteTable("questionnaires", {
  id: id(),
  createdByManagerId: text("created_by_manager_id").notNull(),
  title: text("title").notNull(),
  purpose: text("purpose"),
  period: text("period").notNull(),
  privacyMode: text("privacy_mode").notNull().default("named_review_evidence"),
  // When false, responses are stored as plain answers (no evidence validation,
  // scoring, follow-ups, or evidence cards).
  evidenceValidation: integer("evidence_validation", { mode: "boolean" })
    .notNull()
    .default(true),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  approvedAt: text("approved_at"),
  sentAt: text("sent_at"),
  closedAt: text("closed_at"),
});

export const questions = sqliteTable("questions", {
  id: id(),
  questionnaireId: text("questionnaire_id").notNull(),
  position: integer("position").notNull(),
  questionType: text("question_type").notNull(),
  text: text("text").notNull(),
  optionsJson: text("options_json"),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  // Whether this specific question expects a supporting artifact / evidence.
  evidenceRequired: integer("evidence_required", { mode: "boolean" })
    .notNull()
    .default(true),
  explanation: text("explanation"),
  createdAt: createdAt(),
});

export const surveyAssignments = sqliteTable("survey_assignments", {
  id: id(),
  questionnaireId: text("questionnaire_id").notNull(),
  respondentId: text("respondent_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: createdAt(),
  openedAt: text("opened_at"),
  submittedAt: text("submitted_at"),
});

export const responses = sqliteTable("responses", {
  id: id(),
  assignmentId: text("assignment_id").notNull(),
  questionId: text("question_id").notNull(),
  answerText: text("answer_text"),
  visibility: text("visibility").notNull().default("share_with_manager"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const evidenceItems = sqliteTable("evidence_items", {
  id: id(),
  employeeId: text("employee_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  summary: text("summary").notNull(),
  impact: text("impact"),
  period: text("period").notNull(),
  companyValue: text("company_value"),
  goalId: text("goal_id"),
  qualityScore: real("quality_score"),
  confidence: real("confidence"),
  visibility: text("visibility").notNull().default("share_with_manager"),
  // Review-routing state: high-confidence -> auto_approved; low -> pending_review
  // (manager approve/reject). Existing/seed evidence defaults to approved.
  status: text("status").notNull().default("approved"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const attachments = sqliteTable("attachments", {
  id: id(),
  evidenceId: text("evidence_id").notNull(),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  piiScanStatus: text("pii_scan_status").notNull().default("pending"),
  uploadedBy: text("uploaded_by"),
  createdAt: createdAt(),
});

export const reviewDrafts = sqliteTable("review_drafts", {
  id: id(),
  employeeId: text("employee_id").notNull(),
  managerId: text("manager_id").notNull(),
  period: text("period").notNull(),
  draftMarkdown: text("draft_markdown").notNull(),
  groundingReportJson: text("grounding_report_json"),
  fairnessReportJson: text("fairness_report_json"),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
  approvedAt: text("approved_at"),
  exportedAt: text("exported_at"),
});

/**
 * Mock outbox: records the personal survey links that were "delivered" to
 * respondents. For MVP this stands in for Slack/email delivery and lets the
 * demo re-open a link later. The survey_assignments row still stores only the
 * token hash; in real delivery the link is transmitted, not retained here.
 */
export const outbox = sqliteTable("outbox", {
  id: id(),
  questionnaireId: text("questionnaire_id").notNull(),
  respondentId: text("respondent_id").notNull(),
  assignmentId: text("assignment_id").notNull(),
  channel: text("channel").notNull().default("mock_link"),
  link: text("link").notNull(),
  status: text("status").notNull().default("queued"),
  createdAt: createdAt(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  metadataJson: text("metadata_json"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type Questionnaire = typeof questionnaires.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type SurveyAssignment = typeof surveyAssignments.$inferSelect;
export type Response = typeof responses.$inferSelect;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type ReviewDraft = typeof reviewDrafts.$inferSelect;
export type OutboxMessage = typeof outbox.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
