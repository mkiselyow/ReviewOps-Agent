CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_id` text NOT NULL,
	`file_path` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text,
	`pii_scan_status` text DEFAULT 'pending' NOT NULL,
	`uploaded_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`resource_type` text,
	`resource_id` text,
	`metadata_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evidence_items` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`summary` text NOT NULL,
	`impact` text,
	`period` text NOT NULL,
	`company_value` text,
	`goal_id` text,
	`quality_score` real,
	`confidence` real,
	`visibility` text DEFAULT 'share_with_manager' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`period` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`questionnaire_id` text NOT NULL,
	`respondent_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`channel` text DEFAULT 'mock_link' NOT NULL,
	`link` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `questionnaires` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by_manager_id` text NOT NULL,
	`title` text NOT NULL,
	`purpose` text,
	`period` text NOT NULL,
	`privacy_mode` text DEFAULT 'named_review_evidence' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`approved_at` text,
	`sent_at` text,
	`closed_at` text
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`questionnaire_id` text NOT NULL,
	`position` integer NOT NULL,
	`question_type` text NOT NULL,
	`text` text NOT NULL,
	`options_json` text,
	`required` integer DEFAULT true NOT NULL,
	`explanation` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`question_id` text NOT NULL,
	`answer_text` text,
	`visibility` text DEFAULT 'share_with_manager' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`manager_id` text NOT NULL,
	`period` text NOT NULL,
	`draft_markdown` text NOT NULL,
	`grounding_report_json` text,
	`fairness_report_json` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`approved_at` text,
	`exported_at` text
);
--> statement-breakpoint
CREATE TABLE `survey_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`questionnaire_id` text NOT NULL,
	`respondent_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`opened_at` text,
	`submitted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `survey_assignments_token_hash_unique` ON `survey_assignments` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role_title` text NOT NULL,
	`department` text,
	`manager_id` text,
	`employment_status` text DEFAULT 'active' NOT NULL,
	`is_hr_admin` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);