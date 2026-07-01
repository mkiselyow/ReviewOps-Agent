import { resolve } from "node:path";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/server/db";

// Apply the Drizzle migrations to the in-memory test database once per worker.
// DATABASE_URL=:memory: and USE_MOCK_MODEL=true are set in vitest.config.ts.
// Tests always run on better-sqlite3 (no TURSO_DATABASE_URL), so the async-typed
// `db` is actually a sync better-sqlite3 handle here — cast for the migrator.
migrate(db as unknown as BetterSQLite3Database, {
  migrationsFolder: resolve(process.cwd(), "drizzle"),
});
