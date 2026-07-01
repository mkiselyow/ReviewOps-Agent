import type {
  DirectoryConnector,
  DirectoryEmployee,
  Feedback,
  OneOnOneNote,
  PeerReview,
  PerformanceConnector,
  PerformanceGoal,
} from "./contracts";
import {
  FEEDBACK,
  ONE_ON_ONES,
  PEER_REVIEWS,
  PERFORMANCE_GOALS,
} from "./mockData";
import { getUserById, listAllUsers, getDirectReports } from "../services/hrisService";
import type { User } from "../db/schema";

export * from "./contracts";

// --- Mock directory: presents the internal HRIS users in BambooHR shape ------

function toDirectoryEmployee(u: User): DirectoryEmployee {
  const [firstName, ...rest] = u.displayName.split(" ");
  return {
    id: u.id,
    firstName,
    lastName: rest.join(" "),
    displayName: u.displayName,
    workEmail: u.email,
    jobTitle: u.roleTitle,
    department: u.department,
    supervisorId: u.managerId,
    status: u.employmentStatus === "active" ? "Active" : "Inactive",
    hireDate: null,
  };
}

class MockDirectoryConnector implements DirectoryConnector {
  readonly source = "mock";
  async listEmployees() {
    return (await listAllUsers()).map(toDirectoryEmployee);
  }
  async getEmployee(id: string) {
    const u = await getUserById(id);
    return u ? toDirectoryEmployee(u) : null;
  }
  async getReports(managerId: string) {
    return (await getDirectReports(managerId)).map(toDirectoryEmployee);
  }
}

// --- Mock performance: Lattice-shaped peer reviews / feedback / 1:1s ---------

function byCycle<T extends { cycle?: string; date?: string }>(
  rows: T[],
  cycle: string | undefined,
  cycleKey: (r: T) => string | undefined,
): T[] {
  if (!cycle) return rows;
  return rows.filter((r) => cycleKey(r) === cycle);
}

class MockPerformanceConnector implements PerformanceConnector {
  readonly source = "mock";
  async getPeerReviews(employeeId: string, cycle?: string): Promise<PeerReview[]> {
    return byCycle(
      PEER_REVIEWS.filter((r) => r.subjectEmployeeId === employeeId),
      cycle,
      (r) => r.cycle,
    );
  }
  async getFeedback(employeeId: string, cycle?: string): Promise<Feedback[]> {
    // Feedback is dated, not cycle-tagged; the cycle filter is a no-op here.
    void cycle;
    return FEEDBACK.filter((f) => f.toEmployeeId === employeeId);
  }
  async getOneOnOnes(
    managerId: string,
    employeeId: string,
  ): Promise<OneOnOneNote[]> {
    return ONE_ON_ONES.filter(
      (o) => o.managerId === managerId && o.employeeId === employeeId,
    );
  }
  async getGoals(employeeId: string, cycle?: string): Promise<PerformanceGoal[]> {
    return byCycle(
      PERFORMANCE_GOALS.filter((g) => g.employeeId === employeeId),
      cycle,
      (g) => g.cycle,
    );
  }
}

// Configured providers. Swap these for live BambooHR/Lattice (or MCP) clients
// later — callers depend only on the interfaces.
export const directory: DirectoryConnector = new MockDirectoryConnector();
export const performance: PerformanceConnector = new MockPerformanceConnector();

// --- Adapter: external signals -> review-grounding evidence ------------------

export type ReviewSignal = {
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
 * Pull a manager's connector data for one report and normalize it into
 * evidence-shaped, citeable grounding signals for the review draft. Peer
 * reviews / feedback / 1:1 highlights become additional grounded context the
 * review agent can reference by id.
 */
export async function gatherReviewSignals(
  managerId: string,
  employeeId: string,
  cycle: string,
): Promise<ReviewSignal[]> {
  const [peers, feedback, oneOnOnes] = await Promise.all([
    performance.getPeerReviews(employeeId, cycle),
    performance.getFeedback(employeeId, cycle),
    performance.getOneOnOnes(managerId, employeeId, cycle),
  ]);

  const signals: ReviewSignal[] = [];
  for (const p of peers) {
    signals.push({
      id: `peer:${p.id}`,
      summary: `Peer review — ${p.competency} (${p.rating}/5): “${p.comment}”`,
      impact: null,
      period: p.cycle,
      companyValue: null,
      goalId: null,
      qualityScore: p.rating / 5,
      sourceType: "mock_lattice",
    });
  }
  for (const f of feedback) {
    signals.push({
      id: `fb:${f.id}`,
      summary: `Feedback (${f.tags.join(", ")}): “${f.text}”`,
      impact: null,
      period: cycle,
      companyValue: null,
      goalId: null,
      qualityScore: null,
      sourceType: "mock_lattice",
    });
  }
  for (const o of oneOnOnes) {
    signals.push({
      id: `1on1:${o.id}`,
      summary: `1:1 note: ${o.summary}`,
      impact: null,
      period: cycle,
      companyValue: null,
      goalId: null,
      qualityScore: null,
      sourceType: "manager_note",
    });
  }
  return signals;
}
