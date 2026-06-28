import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

/** Delete all rows in dependency-safe order. */
export function clearDatabase(): void {
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
}

/** Reset and load the synthetic demo data. Returns the counts inserted. */
export function seedDatabase(): { users: number; goals: number; evidence: number } {
  const seedUsers = readJson<SeedUser[]>("data/seed/employees.json");
  const seedGoals = readJson<SeedGoal[]>("data/seed/goals.json");
  const seedEvidence = readJson<SeedEvidence[]>("data/seed/sample-evidence.json");

  clearDatabase();
  db.insert(users).values(seedUsers).run();
  db.insert(goals).values(seedGoals).run();
  db.insert(evidenceItems).values(seedEvidence).run();
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

  return { users: seedUsers.length, goals: seedGoals.length, evidence: seedEvidence.length };
}

// Run directly via `npm run seed` (but not when imported by tests).
const isDirectRun =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  console.log("Seeding ReviewOps Agent database...");
  const counts = seedDatabase();
  console.log(`  users:    ${counts.users}`);
  console.log(`  goals:    ${counts.goals}`);
  console.log(`  evidence: ${counts.evidence}`);
  console.log("Seed complete.");
}
