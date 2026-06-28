ALTER TABLE `questionnaires` ADD `evidence_validation` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `evidence_required` integer DEFAULT true NOT NULL;