import { resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/server/db";

// Apply the Drizzle migrations to the in-memory test database once per worker.
// DATABASE_URL=:memory: and USE_MOCK_MODEL=true are set in vitest.config.ts.
migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
