import { describe, it, expect, beforeEach } from "vitest";
import { reseed, USERS } from "./helpers";
import { runEvidenceValidatorAgent } from "../src/server/agents/evidenceValidatorAgent";
import { runQuestionnaireSafetyAgent } from "../src/server/agents/questionnaireSafetyAgent";
import { orchestrateResponseSubmission } from "../src/server/agents/orchestrator";
import {
  createQuestionnaire,
  approveQuestionnaire,
  createSurveyAssignments,
  getQuestions,
} from "../src/server/services/surveyService";
import {
  getEvidenceForReview,
  getEmployeeEvidence,
} from "../src/server/services/evidenceService";

const WEAK = "I helped with frontend.";
const STRONG =
  "I refactored the shared tooltip component and helped Mark integrate it in the billing screen. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123 and BUG-45.";

function tokenFromLink(link: string): string {
  return link.split("/").pop()!;
}

describe("evidence validation", () => {
  beforeEach(reseed);

  it("flags a vague answer and returns a follow-up question", async () => {
    const r = await runEvidenceValidatorAgent({
      answerText: WEAK,
      questionText: "Describe a contribution.",
      period: "2026-Q2",
      companyValues: ["Own It"],
    });
    expect(r.output.isWeak).toBe(true);
    expect(r.output.qualityScore).toBeLessThan(0.6);
    expect(r.output.followUpQuestion).toBeTruthy();
    expect(r.output.missingFields.length).toBeGreaterThan(0);
  });

  it("accepts a specific, impact-backed answer", async () => {
    const r = await runEvidenceValidatorAgent({
      answerText: STRONG,
      questionText: "Describe a contribution.",
      period: "2026-Q2",
      companyValues: ["Own It"],
    });
    expect(r.output.isWeak).toBe(false);
    expect(r.output.qualityScore).toBeGreaterThanOrEqual(0.6);
    expect(r.output.followUpQuestion).toBeNull();
  });

  it("rejects a sensitive / protected-topic question", async () => {
    const r = await runQuestionnaireSafetyAgent({
      questions: [
        { position: 0, text: "Describe a concrete example of ownership." },
        { position: 1, text: "What is your religion and family situation?" },
      ],
    });
    expect(r.output.decision).toBe("needs_revision");
    expect(r.output.riskyQuestions.length).toBeGreaterThan(0);
    expect(r.output.riskyQuestions[0].saferAlternative).toBeTruthy();
  });

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
});
