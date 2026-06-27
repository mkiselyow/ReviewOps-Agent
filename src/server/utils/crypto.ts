import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Survey token helpers (see docs/ARCHITECTURE_AND_SECURITY.md §8).
 *
 * - tokens are cryptographically random
 * - only the SHA-256 hash is persisted on the assignment
 * - the raw token is returned once at creation and embedded in the link
 */

export function generateToken(): string {
  // 32 random bytes -> 43-char url-safe base64 string.
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two token hashes. */
export function safeEqualHash(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
