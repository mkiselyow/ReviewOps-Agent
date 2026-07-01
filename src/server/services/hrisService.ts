import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { users, goals, type User, type Goal } from "../db/schema";

/**
 * Mock HRIS connector. The mock HRIS is the source of truth for identity,
 * manager relationships, roles, teams, and official goals
 * (see docs/ARCHITECTURE.md §7).
 */

export async function getUserById(id: string): Promise<User | null> {
  return (await db.select().from(users).where(eq(users.id, id)).get()) ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return (await db.select().from(users).where(eq(users.email, email)).get()) ?? null;
}

export async function listAllUsers(): Promise<User[]> {
  return db.select().from(users).all();
}

export async function getDirectReports(managerId: string): Promise<User[]> {
  return db.select().from(users).where(eq(users.managerId, managerId)).all();
}

export async function isManager(userId: string): Promise<boolean> {
  return (await getDirectReports(userId)).length > 0;
}

export async function getEmployeeProfile(employeeId: string): Promise<User | null> {
  return getUserById(employeeId);
}

export async function getEmployeeGoals(
  employeeId: string,
  period?: string,
): Promise<Goal[]> {
  const where = period
    ? and(eq(goals.employeeId, employeeId), eq(goals.period, period))
    : eq(goals.employeeId, employeeId);
  return db.select().from(goals).where(where).all();
}

// --- Static reference data read from seed markdown files ---------------------

function readMarkdownSections(
  relPath: string,
): { heading: string; body: string }[] {
  const full = resolve(process.cwd(), relPath);
  const text = readFileSync(full, "utf-8");
  const sections: { heading: string; body: string }[] = [];
  const parts = text.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : part.slice(nl + 1)).trim();
    sections.push({ heading, body });
  }
  return sections;
}

export type CompanyValue = { name: string; description: string };

export function getCompanyValues(): CompanyValue[] {
  return readMarkdownSections("data/seed/company-values.md").map((s) => ({
    name: s.heading,
    description: s.body.replace(/\s+/g, " ").trim(),
  }));
}

export function getCompanyValueNames(): string[] {
  return getCompanyValues().map((v) => v.name);
}

/**
 * Returns the bulleted role expectations for a role title, or a generic set if
 * the exact role is not defined.
 */
export function getRoleExpectations(roleTitle: string): string[] {
  const sections = readMarkdownSections("data/seed/role-expectations.md");
  const match =
    sections.find((s) => s.heading.toLowerCase() === roleTitle.toLowerCase()) ??
    sections.find((s) =>
      roleTitle.toLowerCase().includes(s.heading.toLowerCase().split(" ")[0]),
    );
  if (!match) {
    return [
      "Reliable delivery of work",
      "Ownership of outcomes",
      "Collaboration across the team",
      "Quality and craft",
    ];
  }
  return match.body
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}
