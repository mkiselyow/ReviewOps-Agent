import { sanitizeContext, type RawReviewContext } from "../tools/privacyTools";

/**
 * Privacy Filter Agent.
 *
 * Unlike the other agents this is intentionally DETERMINISTIC and never calls
 * the model: privacy/data-minimization is a security control and must not
 * depend on an LLM. It minimizes the raw context and redacts PII before any
 * downstream agent (e.g. the Review Draft Agent) sees it.
 */
export function runPrivacyFilterAgent(raw: RawReviewContext) {
  const { context, removedCategories } = sanitizeContext(raw);
  return { output: context, removedCategories, source: "deterministic" as const };
}
