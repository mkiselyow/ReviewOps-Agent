import { describe, it, expect, beforeEach, vi } from "vitest";
import { reseed, USERS } from "./helpers";
import { orchestrateResponseSubmission } from "../src/server/agents/orchestrator";

vi.mock("../src/server/agentClient", async () => await import("./agentClientMock"));
import {
  createQuestionnaire,
  approveQuestionnaire,
  createSurveyAssignments,
  getQuestions,
} from "../src/server/services/surveyService";
import {
  getEvidenceForReview,
  getEmployeeEvidence,
  getPendingEvidenceForManager,
  setEvidenceStatus,
} from "../src/server/services/evidenceService";
import { orchestrateEvidenceSubmission } from "../src/server/agents/orchestrator";

const WEAK = "I helped with frontend.";
const STRONG =
  "I refactored the shared tooltip component and helped Mark integrate it in the billing screen. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123 and BUG-45.";

function tokenFromLink(link: string): string {
  return link.split("/").pop()!;
}

describe("evidence validation", () => {
  beforeEach(reseed);

  it("end-to-end: weak answer is flagged then upgraded on resubmission, carrying consent", async () => {
    const q = createQuestionnaire(
      USERS.maria,
      { title: "Q2 Evidence", period: "2026-Q2" },
      [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
    );
    approveQuestionnaire(USERS.maria, q.id);
    const [anna] = createSurveyAssignments(USERS.maria, q.id, [USERS.anna]);
    const token = tokenFromLink(anna.link);
    const questionId = getQuestions(q.id)[0].id;

    // Weak submission with review consent.
    const first = await orchestrateResponseSubmission(token, [
      { questionId, answerText: WEAK, visibility: "allow_for_review" },
    ]);
    expect(first.validations[0].validation.isWeak).toBe(true);

    // Evidence carries the allow_for_review consent and is review-usable.
    const reviewable = getEvidenceForReview(USERS.maria, USERS.anna, "2026-Q2");
    const fromResponse = reviewable.find((e) => e.sourceType === "questionnaire_response");
    expect(fromResponse).toBeDefined();

    // Improve the answer; the SAME evidence card is upgraded, not duplicated.
    const second = await orchestrateResponseSubmission(token, [
      { questionId, answerText: STRONG, visibility: "allow_for_review" },
    ]);
    expect(second.validations[0].validation.isWeak).toBe(false);

    const after = getEmployeeEvidence(USERS.maria, USERS.anna, "2026-Q2").filter(
      (e) => e.sourceType === "questionnaire_response",
    );
    expect(after.length).toBe(1);
    expect(after[0].qualityScore ?? 0).toBeGreaterThanOrEqual(0.6);
  });

  it("standalone evidence: weak -> pending_review -> manager approves -> review-usable (#16)", async () => {
    const r = await orchestrateEvidenceSubmission(USERS.anna, {
      text: WEAK,
      period: "2026-Q2",
    });
    expect(r.evidence.status).toBe("pending_review");

    // shows in Maria's review queue
    expect(
      getPendingEvidenceForManager(USERS.maria).some((e) => e.id === r.evidence.id),
    ).toBe(true);

    // not yet usable for a review draft
    expect(
      getEvidenceForReview(USERS.maria, USERS.anna, "2026-Q2").some(
        (e) => e.id === r.evidence.id,
      ),
    ).toBe(false);

    // manager approves -> usable
    setEvidenceStatus(USERS.maria, r.evidence.id, "approved");
    expect(
      getEvidenceForReview(USERS.maria, USERS.anna, "2026-Q2").some(
        (e) => e.id === r.evidence.id,
      ),
    ).toBe(true);
  });

  it("standalone evidence: strong -> auto_approved -> immediately review-usable", async () => {
    const r = await orchestrateEvidenceSubmission(USERS.anna, {
      text: STRONG,
      period: "2026-Q2",
    });
    expect(r.evidence.status).toBe("auto_approved");
    expect(
      getEvidenceForReview(USERS.maria, USERS.anna, "2026-Q2").some(
        (e) => e.id === r.evidence.id,
      ),
    ).toBe(true);
  });
});
