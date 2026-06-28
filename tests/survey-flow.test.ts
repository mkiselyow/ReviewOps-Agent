import { describe, it, expect, beforeEach } from "vitest";
import { reseed, USERS } from "./helpers";
import {
  createQuestionnaire,
  approveQuestionnaire,
  createSurveyAssignments,
  submitResponseByToken,
  getResponsesForAssignment,
  getQuestionnaireResults,
  getQuestions,
} from "../src/server/services/surveyService";
import {
  runQuestionnaireAgent,
  questionnaireOutputSchema,
} from "../src/server/agents/questionnaireAgent";
import { orchestrateResponseSubmission } from "../src/server/agents/orchestrator";
import { PermissionError } from "../src/server/auth/permissions";

const STRONG_ANSWER =
  "I refactored the shared tooltip component and helped Mark integrate it in billing. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123, BUG-45.";

function tokenFromLink(link: string): string {
  return link.split("/").pop()!;
}

describe("survey flow", () => {
  beforeEach(reseed);

  it("questionnaire generation returns a valid schema with 5-7 questions", async () => {
    const result = await runQuestionnaireAgent({
      topic: "Q2 collaboration and ownership",
      period: "2026-Q2",
      companyValues: ["Own It", "Act with Speed"],
      roleExpectations: ["collaboration"],
    });
    const parsed = questionnaireOutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);
    expect(result.output.questions.length).toBeGreaterThanOrEqual(5);
    expect(result.output.questions.length).toBeLessThanOrEqual(7);
  });

  it("blocks creating assignments for an employee outside the team", () => {
    const q = createQuestionnaire(USERS.maria, { title: "T", period: "2026-Q2" });
    approveQuestionnaire(USERS.maria, q.id);
    expect(() =>
      createSurveyAssignments(USERS.maria, q.id, [USERS.olek]),
    ).toThrow(PermissionError);
  });

  it("requires approval before assignments can be created", () => {
    const q = createQuestionnaire(USERS.maria, { title: "T", period: "2026-Q2" });
    // Not approved yet.
    expect(() =>
      createSurveyAssignments(USERS.maria, q.id, [USERS.anna]),
    ).toThrow(PermissionError);
  });

  it("stores responses submitted via a token", () => {
    const q = createQuestionnaire(
      USERS.maria,
      { title: "T", period: "2026-Q2" },
      [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
    );
    approveQuestionnaire(USERS.maria, q.id);
    const [anna] = createSurveyAssignments(USERS.maria, q.id, [USERS.anna]);
    const token = tokenFromLink(anna.link);
    const questionId = getQuestions(q.id)[0].id;

    expect(getResponsesForAssignment(anna.assignmentId).length).toBe(0);

    const { responses } = submitResponseByToken(token, [
      { questionId, answerText: "I shipped the billing refactor." },
    ]);
    expect(responses.length).toBe(1);
    expect(getResponsesForAssignment(anna.assignmentId).length).toBe(1);
  });

  it("rejects an answer for a question from another survey", () => {
    const q = createQuestionnaire(
      USERS.maria,
      { title: "T", period: "2026-Q2" },
      [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
    );
    approveQuestionnaire(USERS.maria, q.id);
    const [anna] = createSurveyAssignments(USERS.maria, q.id, [USERS.anna]);
    const token = tokenFromLink(anna.link);
    expect(() =>
      submitResponseByToken(token, [
        { questionId: "not-a-question-in-this-survey", answerText: "x" },
      ]),
    ).toThrow();
  });

  it("a manager cannot read another manager's questionnaire results", () => {
    const q = createQuestionnaire(USERS.nora, { title: "Nora's", period: "2026-Q2" });
    approveQuestionnaire(USERS.nora, q.id);
    expect(() => getQuestionnaireResults(USERS.maria, q.id)).toThrow(PermissionError);
  });

  it("results show only THIS questionnaire's evidence, not seed/other evidence (#5/#6)", async () => {
    const q = createQuestionnaire(
      USERS.maria,
      { title: "Scoped", period: "2026-Q2" },
      [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
    );
    approveQuestionnaire(USERS.maria, q.id);
    const [anna] = createSurveyAssignments(USERS.maria, q.id, [USERS.anna]);

    // Anna has seed evidence for 2026-Q2, but a fresh questionnaire shows none.
    let results = getQuestionnaireResults(USERS.maria, q.id);
    let row = results.respondents.find((r) => r.respondentId === USERS.anna)!;
    expect(row.evidence.length).toBe(0);

    // After Anna responds, exactly one questionnaire-derived evidence item shows.
    const token = anna.link.split("/").pop()!;
    const questionId = getQuestions(q.id)[0].id;
    await orchestrateResponseSubmission(token, [
      { questionId, answerText: STRONG_ANSWER, visibility: "allow_for_review" },
    ]);
    results = getQuestionnaireResults(USERS.maria, q.id);
    row = results.respondents.find((r) => r.respondentId === USERS.anna)!;
    expect(row.evidence.length).toBe(1);
  });
});
