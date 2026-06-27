import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 and @google/adk are server-only native/heavy deps.
  // Keep them external so they are not bundled into server chunks.
  serverExternalPackages: ["better-sqlite3", "@google/adk"],
};

export default nextConfig;
