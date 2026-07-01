import {
  isChoiceType,
  isEvidenceEligible,
  isKnownType,
} from "../../lib/questionTypes";
import type { NewQuestionInput } from "../services/surveyService";

/** The loosely-typed question shape the agent service returns. */
export type RawGeneratedQuestion = {
  position: number;
  questionType: string;
  text: string;
  options?: string[] | null;
  explanation?: string | null;
  required?: boolean;
  evidenceRequired?: boolean;
  section?: string | null;
  optIn?: boolean;
};

/**
 * Enforce question invariants on the (LLM-produced) agent output BEFORE it is
 * persisted, so the data layer — not the model — guarantees them:
 *
 * - Unknown question types degrade to `short_text`.
 * - Only choice/rating types keep `options`; a choice with < 2 options is not a
 *   usable control, so it degrades to `short_text`.
 * - `evidence_required` is allowed ONLY on free-text types (long/short_text);
 *   it is stripped from choices, typed inputs (number/date/email), links, etc.
 * - `opt_in` (a section's yes/no gate) is valid only on a `single_choice` with
 *   options; otherwise it is cleared.
 *
 * Returns rows ready for `addQuestions`, re-numbered from position 0.
 */
export function normalizeGeneratedQuestions(
  questions: RawGeneratedQuestion[],
): NewQuestionInput[] {
  return questions.map((q, i) => {
    let type = isKnownType(q.questionType) ? q.questionType : "short_text";
    let options = isChoiceType(type) ? (q.options ?? []).filter((o) => o.trim()) : [];

    // A choice/rating with fewer than 2 options is not a real control.
    if (isChoiceType(type) && options.length < 2) {
      type = "short_text";
      options = [];
    }

    const evidenceRequired = isEvidenceEligible(type) && Boolean(q.evidenceRequired);
    const optIn = type === "single_choice" && options.length >= 2 && Boolean(q.optIn);

    return {
      position: i,
      questionType: type,
      text: q.text,
      options: options.length > 0 ? options : null,
      required: q.required ?? true,
      evidenceRequired,
      section: q.section?.trim() ? q.section.trim() : null,
      optIn,
      explanation: q.explanation ?? null,
    };
  });
}
