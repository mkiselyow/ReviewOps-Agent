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
 * Real-manager passphrase logins, read from env. Supports multiple managers:
 * MANAGER_PASSPHRASE / MANAGER_USER_ID (the first), then MANAGER_PASSPHRASE_2 /
 * MANAGER_USER_ID_2, _3, … Each passphrase maps to one real (non-test) manager.
 */
function managerLogins(): { passphrase: string; userId: string }[] {
  const keys: [string, string][] = [["MANAGER_PASSPHRASE", "MANAGER_USER_ID"]];
  for (let i = 2; i <= 9; i++) {
    keys.push([`MANAGER_PASSPHRASE_${i}`, `MANAGER_USER_ID_${i}`]);
  }
  const out: { passphrase: string; userId: string }[] = [];
  for (const [pk, uk] of keys) {
    const passphrase = process.env[pk];
    const userId = process.env[uk];
    if (passphrase && userId) out.push({ passphrase, userId });
  }
  return out;
}

/**
 * Passphrase sign-in for a REAL manager account (not shown in the demo
 * switcher). On success, starts a session for the matching manager. Throttled
 * per client to blunt brute-force attempts.
 */
export async function POST(req: Request) {
  try {
    const logins = managerLogins();
    if (logins.length === 0) {
      throw new PermissionError("Passphrase sign-in is not configured");
    }

    // Throttle by client IP (best-effort behind proxies).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(`passphrase:${ip}`, 10, 15 * 60_000).allowed) {
      throw new PermissionError("Too many attempts — try again later", 429);
    }

    const { passphrase } = bodySchema.parse(await req.json());

    // Compare against every configured passphrase (no early exit on match).
    let matchedId: string | null = null;
    for (const login of logins) {
      if (constantTimeEquals(passphrase, login.passphrase)) matchedId = login.userId;
    }
    if (!matchedId) {
      logAudit({
        actorId: null,
        action: "access_denied",
        resourceType: "user",
        resourceId: null,
        metadata: { reason: "bad_passphrase" },
      });
      throw new AuthError("Incorrect passphrase");
    }

    const manager = await getUserById(matchedId);
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
