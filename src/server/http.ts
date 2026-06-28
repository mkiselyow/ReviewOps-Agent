import { NextResponse } from "next/server";
import { requireCurrentUser } from "./auth/mockSession";
import {
  AuthError,
  NotFoundError,
  PermissionError,
} from "./auth/permissions";
import { logAudit } from "./services/auditService";
import { isManager } from "./services/hrisService";
import type { User } from "./db/schema";

/**
 * Require a logged-in user who is a manager (has at least one direct report).
 * Manager-only API actions (create/approve questionnaire, generate review) use
 * this; non-managers get a 403.
 */
export async function requireManager(): Promise<User> {
  const user = await requireCurrentUser();
  if (!isManager(user.id)) {
    throw new PermissionError("Manager access required");
  }
  return user;
}

/** Maps domain errors to HTTP responses and audits denied access. */
export function toErrorResponse(err: unknown, actorId?: string | null) {
  if (
    err instanceof PermissionError ||
    err instanceof NotFoundError ||
    err instanceof AuthError
  ) {
    if (err instanceof PermissionError) {
      logAudit({
        actorId: actorId ?? null,
        action: "access_denied",
        metadata: { message: err.message },
      });
    }
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 400 });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
