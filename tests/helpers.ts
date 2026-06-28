import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { surveyAssignments } from "../src/server/db/schema";
import { seedDatabase } from "../src/server/db/seed";

/** Reset to the synthetic demo dataset before each test. */
export function reseed() {
  seedDatabase();
}

/** Demo user ids (see data/seed/employees.json). */
export const USERS = {
  maria: "u_maria", // Engineering Manager
  anna: "u_anna", // Maria's direct report
  mark: "u_mark", // Maria's direct report
  julia: "u_julia", // Maria's direct report
  nora: "u_nora", // Another manager
  olek: "u_olek", // Nora's report (outside Maria's team)
} as const;

/** Read the stored token hash for an assignment (to assert raw token is not stored). */
export function getStoredTokenHash(assignmentId: string): string | undefined {
  return db
    .select()
    .from(surveyAssignments)
    .where(eq(surveyAssignments.id, assignmentId))
    .get()?.tokenHash;
}
