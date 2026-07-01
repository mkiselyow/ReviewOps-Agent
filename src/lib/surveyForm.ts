/**
 * Pure (React-free) logic for the survey response form, extracted so it can be
 * unit-tested in a node environment without a DOM. The component
 * (SurveyResponseForm) is a thin rendering layer over these functions.
 */

export type FormQuestion = {
  id: string;
  position: number;
  questionType: string;
  text: string;
  options: string[];
  required: boolean;
  evidenceRequired: boolean;
  section: string | null;
  optIn: boolean;
  explanation: string | null;
};

export type SubmitAnswer = {
  questionId: string;
  answerText: string;
  visibility: string;
};

export function isAffirmative(v: string | undefined): boolean {
  return (v ?? "").trim().toLowerCase().startsWith("yes");
}

/** Map of section name -> the id of its (first) opt-in gate question. */
export function buildGateBySection(questions: FormQuestion[]): Map<string, string> {
  const gates = new Map<string, string>();
  for (const q of questions) {
    if (q.section && q.optIn && !gates.has(q.section)) {
      gates.set(q.section, q.id);
    }
  }
  return gates;
}

/**
 * A question is visible unless it belongs to a section whose opt-in gate has not
 * been answered affirmatively. The gate itself is always visible.
 */
export function isQuestionVisible(
  q: FormQuestion,
  answers: Record<string, string>,
  gates: Map<string, string>,
): boolean {
  if (!q.section || q.optIn) return true;
  const gateId = gates.get(q.section);
  if (!gateId) return true;
  return isAffirmative(answers[gateId]);
}

/** Toggle one option in a `|`-delimited multi-choice answer string. */
export function toggleMultiValue(current: string, option: string): string {
  const set = new Set(
    (current ?? "").split("|").map((s) => s.trim()).filter(Boolean),
  );
  if (set.has(option)) set.delete(option);
  else set.add(option);
  return Array.from(set).join(" | ");
}

/**
 * Compose the stored answer text for a question: the base answer, plus an
 * appended evidence link when the question requires evidence and one was given.
 */
export function composeAnswer(
  q: FormQuestion,
  answers: Record<string, string>,
  evidence: Record<string, string>,
): string {
  const base = (answers[q.id] ?? "").trim();
  const link = (evidence[q.id] ?? "").trim();
  if (q.evidenceRequired && link) {
    return base ? `${base}\n\nEvidence: ${link}` : `Evidence: ${link}`;
  }
  return base;
}

/**
 * Build the submit payload: only visible questions with a non-empty composed
 * answer, carrying the chosen review-consent visibility. Hidden (opted-out)
 * questions are excluded entirely.
 */
export function buildSubmitPayload(
  questions: FormQuestion[],
  answers: Record<string, string>,
  evidence: Record<string, string>,
  allowReview: boolean,
): SubmitAnswer[] {
  const gates = buildGateBySection(questions);
  const visibility = allowReview ? "allow_for_review" : "share_with_manager";
  return questions
    .filter((q) => isQuestionVisible(q, answers, gates))
    .map((q) => ({
      questionId: q.id,
      answerText: composeAnswer(q, answers, evidence),
      visibility,
    }))
    .filter((a) => a.answerText.trim().length > 0);
}
