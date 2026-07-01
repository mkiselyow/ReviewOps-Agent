/**
 * Question-type groupings shared by the server normalizer and the client form.
 * Kept dependency-free (no DB import) so it is safe in client components.
 */

export const KNOWN_QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "rating",
  "number",
  "date",
  "email",
  "evidence_link",
  "attachment",
] as const;

/** Pick-from-options types: must carry `options`. */
export const CHOICE_TYPES = ["single_choice", "multi_choice", "rating"] as const;

/**
 * Free-text answer types where requesting/scoring evidence makes sense. Typed
 * inputs (number/date/email) and choices are NOT eligible — you can't attach a
 * PR to a date.
 */
export const EVIDENCE_ELIGIBLE_TYPES = ["long_text", "short_text"] as const;

export function isKnownType(t: string): boolean {
  return (KNOWN_QUESTION_TYPES as readonly string[]).includes(t);
}
export function isChoiceType(t: string): boolean {
  return (CHOICE_TYPES as readonly string[]).includes(t);
}
export function isEvidenceEligible(t: string): boolean {
  return (EVIDENCE_ELIGIBLE_TYPES as readonly string[]).includes(t);
}
