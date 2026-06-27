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

/** Current period label, e.g. "2026-Q2". */
export function currentPeriod(from: Date = new Date()): string {
  const year = from.getUTCFullYear();
  const quarter = Math.floor(from.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}
