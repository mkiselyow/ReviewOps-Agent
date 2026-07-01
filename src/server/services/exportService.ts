import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const EXPORT_DIR = "data/exports";

export function writeMarkdownExport(
  fileName: string,
  content: string,
): { fileName: string; filePath: string | null } {
  // Best-effort local write. On serverless (Vercel) the filesystem is read-only,
  // so this is expected to fail — the caller returns the markdown for the browser
  // to download instead. Never let a write error break the export.
  try {
    const dir = resolve(process.cwd(), EXPORT_DIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const absPath = resolve(dir, fileName);
    writeFileSync(absPath, content, "utf-8");
    return { fileName, filePath: `${EXPORT_DIR}/${fileName}` };
  } catch {
    return { fileName, filePath: null };
  }
}

export function listExports(): string[] {
  const dir = resolve(process.cwd(), EXPORT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md"));
}
