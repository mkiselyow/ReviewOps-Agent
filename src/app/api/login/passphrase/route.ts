import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { setSessionUserId } from "@/server/auth/mockSession";
import { getUserById } from "@/server/services/hrisService";
import { logAudit } from "@/server/services/auditService";
import { AuthError, PermissionError } from "@/server/auth/permissions";
import { toErrorResponse, ok } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const bodySchema = z.object({ passphrase: z.string().min(1) });

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Passphrase sign-in for the REAL manager account (not shown in the demo
 * switcher). On success, starts a session for MANAGER_USER_ID. Throttled per
 * client to blunt brute-force attempts.
 */
export async function POST(req: Request) {
  try {
    const expected = process.env.MANAGER_PASSPHRASE;
    const managerId = process.env.MANAGER_USER_ID;
    if (!expected || !managerId) {
      throw new PermissionError("Passphrase sign-in is not configured");
    }

    // Throttle by client IP (best-effort behind proxies).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`passphrase:${ip}`, 10, 15 * 60_000).allowed) {
      throw new PermissionError("Too many attempts — try again later", 429);
    }

    const { passphrase } = bodySchema.parse(await req.json());

    if (!constantTimeEquals(passphrase, expected)) {
      logAudit({
        actorId: null,
        action: "access_denied",
        resourceType: "user",
        resourceId: managerId,
        metadata: { reason: "bad_passphrase" },
      });
      throw new AuthError("Incorrect passphrase");
    }

    const manager = await getUserById(managerId);
    if (!manager || manager.isTestUser) {
      // Misconfiguration guard: the target must be a real (non-test) user.
      throw new PermissionError("Manager account is not available");
    }

    await setSessionUserId(manager.id);
    logAudit({
      actorId: manager.id,
      action: "login",
      resourceType: "user",
      resourceId: manager.id,
      metadata: { method: "passphrase" },
    });
    return ok({
      id: manager.id,
      displayName: manager.displayName,
      roleTitle: manager.roleTitle,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
