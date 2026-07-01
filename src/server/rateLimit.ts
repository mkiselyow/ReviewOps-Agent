/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Used to protect expensive agent-backed endpoints (Gemini quota) from an
 * authenticated user spamming requests, and to throttle passphrase attempts.
 *
 * Scope caveat: state is per-process, so on serverless/Cloud Run with multiple
 * instances the effective limit is per-instance. That's acceptable here because
 * the agent's shared-secret already blocks unauthenticated callers entirely;
 * this is a secondary guard. A durable store (Upstash/Redis) is the roadmap
 * upgrade for a hard global limit.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Record a hit for `key` and report whether it is within `max` per `windowMs`.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }

  return {
    allowed: bucket.count <= max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/** Test helper: clear all counters. */
export function __resetRateLimits(): void {
  buckets.clear();
}
