export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function exportFileName(employeeName: string, period: string): string {
  return `review-${slugify(employeeName)}-${slugify(period)}.md`;
}

/**
 * Appends an approval + fairness footer to an approved review draft so the
 * exported file is self-describing.
 */
export function withApprovalFooter(
  markdown: string,
  opts: {
    approvedBy: string;
    approvedAt: string;
    fairnessWarnings?: string[];
  },
): string {
  const lines: string[] = [markdown.trimEnd(), "", "---", ""];
  lines.push(`**Manager approval:** approved by ${opts.approvedBy} on ${opts.approvedAt}`);
  if (opts.fairnessWarnings && opts.fairnessWarnings.length > 0) {
    lines.push("");
    lines.push("**Fairness & grounding notes considered before approval:**");
    for (const w of opts.fairnessWarnings) lines.push(`- ${w}`);
  } else {
    lines.push("");
    lines.push("**Fairness & grounding:** no outstanding warnings at approval time.");
  }
  lines.push("");
  return lines.join("\n");
}
