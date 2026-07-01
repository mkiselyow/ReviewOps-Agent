import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

/**
 * Drizzle client with two backends behind ONE (async) API:
 *  - **Turso / libSQL** when `TURSO_DATABASE_URL` is set (serverless / prod on
 *    Vercel) — remote, asynchronous.
 *  - **better-sqlite3** otherwise (local dev + tests) — a synchronous file/memory
 *    DB, loaded lazily so it is never bundled on serverless.
 *
 * All callers `await` their queries; awaiting a synchronous better-sqlite3 result
 * is a harmless no-op, so the same code drives both drivers. The exported `db` is
 * typed as the async `LibSQLDatabase` and the better-sqlite3 handle is cast to it.
 */

const nodeRequire = createRequire(import.meta.url);

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/reviewops.sqlite";
  const raw = url.startsWith("file:") ? url.slice("file:".length) : url;
  if (raw === ":memory:") return ":memory:";
  return resolve(process.cwd(), raw);
}

function createDb(): LibSQLDatabase<typeof schema> {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    const client = createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return drizzleLibsql(client, { schema });
  }

  // Local/dev/tests: lazy-load better-sqlite3 so serverless bundles never see it.
  const Database = nodeRequire("better-sqlite3");
  const { drizzle: drizzleSqlite } = nodeRequire("drizzle-orm/better-sqlite3");
  const dbPath = resolveDbPath();
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzleSqlite(sqlite, { schema }) as unknown as LibSQLDatabase<typeof schema>;
}

type DbClient = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __reviewopsDb?: DbClient };

export const db: DbClient = globalForDb.__reviewopsDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__reviewopsDb = db;
}

export { schema };
