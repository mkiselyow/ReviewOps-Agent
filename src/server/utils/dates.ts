export function isoNow(): string {
  return new Date().toISOString();
}

export function addHours(hours: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function tokenExpiryIso(from: Date = new Date()): string {
  const hours = Number(process.env.TOKEN_EXPIRY_HOURS ?? "168");
  return addHours(Number.isFinite(hours) ? hours : 168, from).toISOString();
}

/**
 * Turn a date-only deadline (e.g. "2026-07-03") into an expiry at the END of that
 * day (23:59:59.999 UTC), so a respondent can still submit ON the deadline day.
 * Returns null for an empty/invalid input.
 */
export function deadlineToExpiryIso(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Current period label, e.g. "2026-Q2". */
export function currentPeriod(from: Date = new Date()): string {
  const year = from.getUTCFullYear();
  const quarter = Math.floor(from.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}
