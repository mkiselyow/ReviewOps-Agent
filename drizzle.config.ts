import { defineConfig } from "drizzle-kit";
import "dotenv/config";

// Two targets behind one config:
//  - Turso/libSQL when TURSO_DATABASE_URL is set (prod / Vercel).
//  - local file-based SQLite otherwise (dev + tests).
const tursoUrl = process.env.TURSO_DATABASE_URL;

export default tursoUrl
  ? defineConfig({
      dialect: "turso",
      schema: "./src/server/db/schema.ts",
      out: "./drizzle",
      dbCredentials: {
        url: tursoUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
      },
    })
  : defineConfig({
      dialect: "sqlite",
      schema: "./src/server/db/schema.ts",
      out: "./drizzle",
      dbCredentials: {
        // DATABASE_URL is "file:./data/reviewops.sqlite"; strip the scheme.
        url: (process.env.DATABASE_URL ?? "file:./data/reviewops.sqlite").replace(
          /^file:/,
          "",
        ),
      },
    });
