ALTER TABLE `questions` ADD `section` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `opt_in` integer DEFAULT false NOT NULL;