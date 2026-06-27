import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const EXPORT_DIR = "data/exports";

export function writeMarkdownExport(
  fileName: string,
  content: string,
): { fileName: string; filePath: string } {
  const dir = resolve(process.cwd(), EXPORT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const absPath = resolve(dir, fileName);
  writeFileSync(absPath, content, "utf-8");
  return { fileName, filePath: `${EXPORT_DIR}/${fileName}` };
}

export function listExports(): string[] {
  const dir = resolve(process.cwd(), EXPORT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md"));
}
