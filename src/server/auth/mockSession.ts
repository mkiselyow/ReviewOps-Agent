import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "../db/schema";
import { AuthError } from "./permissions";

/**
 * Mock session: the current user id is stored in a cookie. This is a stand-in
 * for real auth/SSO (explicitly out of MVP scope). It is NOT a security
 * boundary on its own — every sensitive action still runs through the
 * permission checks in permissions.ts / rbac.ts.
 *
 * The cookie value is **HMAC-signed** with SESSION_SECRET so it cannot be
 * forged: a client cannot mint `reviewops_uid=<some-manager-id>` and be trusted
 * as that user. Only values this server signed (after a demo click or a valid
 * passphrase login) verify. Signing is transparent to callers.
 */

const COOKIE = "reviewops_uid";

let warnedDevSecret = false;
function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length > 0) return s;
  if (!warnedDevSecret) {
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] SESSION_SECRET is not set — using an insecure dev fallback. " +
        "Set SESSION_SECRET in any deployed environment.",
    );
    warnedDevSecret = true;
  }
  return "dev-insecure-session-secret";
}

/** `<uid>.<base64url(HMAC-SHA256(uid))>` */
export function signSessionValue(userId: string): string {
  const sig = createHmac("sha256", sessionSecret())
    .update(userId)
    .digest("base64url");
  return `${userId}.${sig}`;
}

/** Verify a signed cookie value; returns the uid or null if missing/tampered. */
export function verifySessionValue(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const idx = cookieValue.lastIndexOf(".");
  if (idx <= 0) return null; // no signature (e.g. legacy plaintext cookie)
  const uid = cookieValue.slice(0, idx);
  const provided = Buffer.from(cookieValue.slice(idx + 1));
  const expected = Buffer.from(
    createHmac("sha256", sessionSecret()).update(uid).digest("base64url"),
  );
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  return uid;
}

export async function setSessionUserId(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, signSessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return verifySessionValue(store.get(COOKIE)?.value);
}

export async function getCurrentUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const row = await db.select().from(users).where(eq(users.id, userId)).get();
  return row ?? null;
}

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You must be logged in");
  return user;
}
