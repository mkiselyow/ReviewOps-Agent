/**
 * Privacy tools (see docs/ARCHITECTURE.md §4.1 / §7).
 *
 * Converts raw internal data into minimized, PII-redacted model context.
 * Rule: log the CATEGORIES removed, never the removed values.
 */

type RedactionRule = { category: string; pattern: RegExp; replacement: string };

const RULES: RedactionRule[] = [
  {
    category: "email",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    replacement: "[redacted-email]",
  },
  {
    category: "phone",
    pattern: /(?:\+?\d[\d\s().-]{7,}\d)/g,
    replacement: "[redacted-phone]",
  },
  {
    category: "national_id",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[redacted-id]",
  },
  {
    category: "credit_card",
    pattern: /\b(?:\d[ -]*?){13,16}\b/g,
    replacement: "[redacted-card]",
  },
  {
    category: "date_of_birth",
    pattern: /\b(?:DOB|date of birth|born)\b[:\s]*[0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4}/gi,
    replacement: "[redacted-dob]",
  },
  {
    category: "address",
    pattern:
      /\b\d{1,5}\s+[A-Za-z0-9.\s]{3,}\b(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|blvd|boulevard)\b/gi,
    replacement: "[redacted-address]",
  },
];

export type RedactionResult = { text: string; removedCategories: string[] };

export function redactPii(input: string | null | undefined): RedactionResult {
  if (!input) return { text: "", removedCategories: [] };
  let text = input;
  const removed = new Set<string>();
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      removed.add(rule.category);
      text = text.replace(rule.pattern, rule.replacement);
    }
    rule.pattern.lastIndex = 0;
  }
  return { text, removedCategories: [...removed] };
}

export type SanitizedEvidence = {
  id: string;
  summary: string;
  impact: string | null;
  period: string;
  companyValue: string | null;
  goalId: string | null;
  qualityScore: number | null;
};

export type RawReviewContext = {
  employee: { id: string; displayName: string; roleTitle: string };
  period: string;
  goals: { id: string; title: string; description: string | null }[];
  roleExpectations: string[];
  companyValues: { name: string; description: string }[];
  evidence: {
    id: string;
    summary: string;
    impact: string | null;
    period: string;
    companyValue: string | null;
    goalId: string | null;
    qualityScore: number | null;
  }[];
};

export type SanitizedReviewContext = {
  employee: { roleTitle: string; alias: string };
  period: string;
  goals: { id: string; title: string }[];
  roleExpectations: string[];
  companyValues: string[];
  evidence: SanitizedEvidence[];
};

/**
 * Minimize + redact a raw review context before it is sent to the model.
 * Drops identity fields (name, email, department), keeps only work-related
 * grounding, and redacts PII from free text.
 */
export function sanitizeContext(raw: RawReviewContext): {
  context: SanitizedReviewContext;
  removedCategories: string[];
} {
  const removed = new Set<string>(["display_name", "email", "department"]);

  const evidence: SanitizedEvidence[] = raw.evidence.map((e) => {
    const s = redactPii(e.summary);
    const i = redactPii(e.impact);
    s.removedCategories.forEach((c) => removed.add(c));
    i.removedCategories.forEach((c) => removed.add(c));
    return {
      id: e.id,
      summary: s.text,
      impact: e.impact ? i.text : null,
      period: e.period,
      companyValue: e.companyValue,
      goalId: e.goalId,
      qualityScore: e.qualityScore,
    };
  });

  return {
    context: {
      // Use a stable alias instead of the real name in the model context.
      employee: { roleTitle: raw.employee.roleTitle, alias: "the employee" },
      period: raw.period,
      goals: raw.goals.map((g) => ({ id: g.id, title: g.title })),
      roleExpectations: raw.roleExpectations,
      companyValues: raw.companyValues.map((v) => v.name),
      evidence,
    },
    removedCategories: [...removed],
  };
}

export function scanAttachmentMetadata(file: {
  fileName: string;
  contentType?: string | null;
}): { status: "clean" | "flagged"; reasons: string[] } {
  const reasons: string[] = [];
  const risky = /(salary|payroll|ssn|passport|medical|health|offer-letter)/i;
  if (risky.test(file.fileName)) reasons.push("filename suggests sensitive content");
  return { status: reasons.length ? "flagged" : "clean", reasons };
}
