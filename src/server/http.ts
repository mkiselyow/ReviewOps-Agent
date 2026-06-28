import { NextResponse } from "next/server";
import { requireCurrentUser } from "./auth/mockSession";
import {
  AuthError,
  NotFoundError,
  PermissionError,
} from "./auth/permissions";
import { logAudit } from "./services/auditService";
import type { User } from "./db/schema";

export async function requireManager(): Promise<User> {
  // Any logged-in user may act as a manager actor; scope is enforced per action.
  return requireCurrentUser();
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
