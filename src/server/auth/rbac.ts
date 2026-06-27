/**
 * Role/action gates layered on top of the pure predicates in permissions.ts.
 *
 * These are also pure: callers pass the already-loaded entities. Services are
 * responsible for loading entities and then calling these assertions before
 * performing an action.
 */
import { PermissionError, NotFoundError } from "./permissions";

type QuestionnaireRef = { id: string; createdByManagerId: string };
type ReviewDraftRef = { id: string; managerId: string };

/**
 * Only the manager who created a questionnaire may approve it, view its
 * results, or create assignments for it.
 */
export function assertOwnsQuestionnaire(
  managerId: string,
  questionnaire: QuestionnaireRef | null | undefined,
): asserts questionnaire is QuestionnaireRef {
  if (!questionnaire) throw new NotFoundError("Questionnaire not found");
  if (questionnaire.createdByManagerId !== managerId) {
    throw new PermissionError("You do not own this questionnaire");
  }
}

/**
 * Only the manager who owns a review draft may approve or export it.
 */
export function assertOwnsReviewDraft(
  managerId: string,
  draft: ReviewDraftRef | null | undefined,
): asserts draft is ReviewDraftRef {
  if (!draft) throw new NotFoundError("Review draft not found");
  if (draft.managerId !== managerId) {
    throw new PermissionError("You do not own this review draft");
  }
}
