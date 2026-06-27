import { defineConfig } from "drizzle-kit";
import "dotenv/config";

// DATABASE_URL is in the form "file:./data/reviewops.sqlite".
// drizzle-kit's better-sqlite3 driver expects a filesystem path.
const dbUrl = process.env.DATABASE_URL ?? "file:./data/reviewops.sqlite";
const dbPath = dbUrl.startsWith("file:") ? dbUrl.slice("file:".length) : dbUrl;

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: dbPath,
  },
});
