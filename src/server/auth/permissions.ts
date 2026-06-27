/**
 * Access-control predicates and assertions.
 *
 * These are PURE functions that operate on plain objects. All
 * permission-sensitive decisions in the app go through this module BEFORE any
 * data reaches an agent or the model (see docs/ARCHITECTURE_AND_SECURITY.md §7).
 *
 * Security rule: never rely on an LLM prompt for access control.
 */

export class PermissionError extends Error {
  readonly statusCode: number;
  constructor(message = "Forbidden", statusCode = 403) {
    super(message);
    this.name = "PermissionError";
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class AuthError extends Error {
  readonly statusCode = 401;
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

type EmployeeRef = { id: string; managerId: string | null };
type ViewerRef = { id: string; isHrAdmin?: boolean };

/**
 * MVP manager scope: a manager may view an employee iff they are the
 * employee's direct manager.
 *
 *   canViewEmployee(managerId, employeeId) = employee.manager_id === managerId
 */
export function canManagerViewEmployee(
  managerId: string,
  employee: EmployeeRef,
): boolean {
  return employee.managerId === managerId;
}

/**
 * General data-access predicate used by services: a viewer may access an
 * employee's data if they are the employee themselves, the employee's direct
 * manager, or an HR admin.
 */
export function canAccessEmployeeData(
  viewer: ViewerRef,
  employee: EmployeeRef,
): boolean {
  if (viewer.id === employee.id) return true;
  if (viewer.isHrAdmin) return true;
  return canManagerViewEmployee(viewer.id, employee);
}

export function assertManagerCanViewEmployee(
  managerId: string,
  employee: EmployeeRef | null | undefined,
): asserts employee is EmployeeRef {
  if (!employee) throw new NotFoundError("Employee not found");
  if (!canManagerViewEmployee(managerId, employee)) {
    throw new PermissionError("Manager cannot access this employee");
  }
}

export function assertCanAccessEmployeeData(
  viewer: ViewerRef,
  employee: EmployeeRef | null | undefined,
): asserts employee is EmployeeRef {
  if (!employee) throw new NotFoundError("Employee not found");
  if (!canAccessEmployeeData(viewer, employee)) {
    throw new PermissionError("Not allowed to access this employee's data");
  }
}

// ---------------------------------------------------------------------------
// Token / assignment scope
// ---------------------------------------------------------------------------

type AssignmentRef = {
  id: string;
  status: string;
  expiresAt: string;
  respondentId: string;
};

export function isAssignmentExpired(
  assignment: AssignmentRef,
  now: Date = new Date(),
): boolean {
  if (assignment.status === "expired" || assignment.status === "revoked") {
    return true;
  }
  return new Date(assignment.expiresAt).getTime() <= now.getTime();
}

/**
 * A survey token grants access to exactly one assignment and never to manager
 * results. Throws if the token is missing, expired, or revoked.
 */
export function assertTokenUsable(
  assignment: AssignmentRef | null | undefined,
  now: Date = new Date(),
): asserts assignment is AssignmentRef {
  if (!assignment) throw new NotFoundError("Survey link not found");
  if (isAssignmentExpired(assignment, now)) {
    throw new PermissionError("This survey link has expired", 410);
  }
}
