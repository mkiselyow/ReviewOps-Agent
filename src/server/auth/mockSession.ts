import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "../db/schema";
import { AuthError } from "./permissions";

/**
 * Mock session: the current user id is stored in a cookie. This is a stand-in
 * for real auth/SSO (explicitly out of MVP scope). It is NOT a security
 * boundary on its own — every sensitive action still runs through the
 * permission checks in permissions.ts / rbac.ts.
 */

const COOKIE = "reviewops_uid";

export async function setSessionUserId(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, userId, {
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
  return store.get(COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  return row ?? null;
}

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You must be logged in");
  return user;
}
