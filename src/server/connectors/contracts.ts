/**
 * External HR-system data contracts.
 *
 * These shapes deliberately mirror real provider APIs so a mock can be swapped
 * for a live integration (BambooHR directory, Lattice performance) — or an MCP
 * server — behind the same interface, with only the provider implementation
 * changing. The rest of the app depends on these contracts, never on a vendor.
 *
 * Methods are async to match real HTTP/MCP providers (the mock just resolves
 * immediately).
 */

// --- Directory (BambooHR-shaped) --------------------------------------------

export type DirectoryEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  workEmail: string;
  jobTitle: string;
  department: string | null;
  supervisorId: string | null;
  status: "Active" | "Inactive";
  hireDate: string | null;
};

export interface DirectoryConnector {
  /** Provider id, e.g. "mock" | "bamboohr". */
  readonly source: string;
  listEmployees(): Promise<DirectoryEmployee[]>;
  getEmployee(id: string): Promise<DirectoryEmployee | null>;
  /** Direct reports of a manager (the org graph). */
  getReports(managerId: string): Promise<DirectoryEmployee[]>;
}

// --- Performance (Lattice-shaped) -------------------------------------------

export type PeerReview = {
  id: string;
  subjectEmployeeId: string;
  reviewerEmployeeId: string;
  cycle: string; // e.g. "2026-Q2"
  competency: string; // e.g. "Collaboration"
  rating: number; // 1..5
  comment: string;
  submittedAt: string;
};

export type Feedback = {
  id: string;
  toEmployeeId: string;
  fromEmployeeId: string;
  date: string;
  text: string;
  tags: string[];
};

export type OneOnOneNote = {
  id: string;
  managerId: string;
  employeeId: string;
  date: string;
  summary: string;
};

export type PerformanceGoal = {
  id: string;
  employeeId: string;
  title: string;
  status: string;
  cycle: string;
};

export interface PerformanceConnector {
  readonly source: string;
  getPeerReviews(employeeId: string, cycle?: string): Promise<PeerReview[]>;
  getFeedback(employeeId: string, cycle?: string): Promise<Feedback[]>;
  getOneOnOnes(
    managerId: string,
    employeeId: string,
    cycle?: string,
  ): Promise<OneOnOneNote[]>;
  getGoals(employeeId: string, cycle?: string): Promise<PerformanceGoal[]>;
}
