import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/**
 * Drizzle database client backed by better-sqlite3.
 *
 * A single connection is cached on globalThis so Next.js hot-reload (and
 * repeated imports in scripts/tests) reuse one handle instead of opening a
 * new file lock each time.
 */

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/reviewops.sqlite";
  const raw = url.startsWith("file:") ? url.slice("file:".length) : url;
  return resolve(process.cwd(), raw);
}

function createDb() {
  const dbPath = resolveDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

type DbClient = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { __reviewopsDb?: DbClient };

export const db: DbClient = globalForDb.__reviewopsDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__reviewopsDb = db;
}

export { schema };
