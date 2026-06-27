import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./index";
import {
  users,
  goals,
  evidenceItems,
  auditLogs,
  questionnaires,
  questions,
  surveyAssignments,
  responses,
  reviewDrafts,
  attachments,
  outbox,
} from "./schema";

function readJson<T>(relPath: string): T {
  const full = resolve(process.cwd(), relPath);
  return JSON.parse(readFileSync(full, "utf-8")) as T;
}

type SeedUser = {
  id: string;
  email: string;
  displayName: string;
  roleTitle: string;
  department: string | null;
  managerId: string | null;
  employmentStatus: string;
  isHrAdmin: boolean;
};

type SeedGoal = {
  id: string;
  employeeId: string;
  title: string;
  description: string | null;
  period: string;
  status: string;
};

type SeedEvidence = {
  id: string;
  employeeId: string;
  sourceType: string;
  sourceId: string | null;
  summary: string;
  impact: string | null;
  period: string;
  companyValue: string | null;
  goalId: string | null;
  qualityScore: number | null;
  confidence: number | null;
  visibility: string;
};

function main() {
  const seedUsers = readJson<SeedUser[]>("data/seed/employees.json");
  const seedGoals = readJson<SeedGoal[]>("data/seed/goals.json");
  const seedEvidence = readJson<SeedEvidence[]>("data/seed/sample-evidence.json");

  console.log("Seeding ReviewOps Agent database...");

  // Clear in dependency-safe order (idempotent reseed).
  db.delete(attachments).run();
  db.delete(reviewDrafts).run();
  db.delete(outbox).run();
  db.delete(responses).run();
  db.delete(surveyAssignments).run();
  db.delete(questions).run();
  db.delete(questionnaires).run();
  db.delete(evidenceItems).run();
  db.delete(goals).run();
  db.delete(auditLogs).run();
  db.delete(users).run();

  db.insert(users).values(seedUsers).run();
  console.log(`  users:    ${seedUsers.length}`);

  db.insert(goals).values(seedGoals).run();
  console.log(`  goals:    ${seedGoals.length}`);

  db.insert(evidenceItems).values(seedEvidence).run();
  console.log(`  evidence: ${seedEvidence.length}`);

  db.insert(auditLogs)
    .values({
      actorId: "system",
      action: "seed",
      resourceType: "database",
      resourceId: null,
      metadataJson: JSON.stringify({
        users: seedUsers.length,
        goals: seedGoals.length,
        evidence: seedEvidence.length,
      }),
    })
    .run();

  console.log("Seed complete.");
}

main();
