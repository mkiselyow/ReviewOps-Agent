import { describe, it, expect, beforeEach, vi } from "vitest";
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
import { orchestrateResponseSubmission } from "../src/server/agents/orchestrator";
import { PermissionError } from "../src/server/auth/permissions";

vi.mock("../src/server/agentClient", async () => await import("./agentClientMock"));

const STRONG_ANSWER =
  "I refactored the shared tooltip component and helped Mark integrate it in billing. This reduced duplicated UI logic and closed two layout bugs. Evidence: PR-123, BUG-45.";

function tokenFromLink(link: string): string {
  return link.split("/").pop()!;
}

describe("survey flow", () => {
  beforeEach(reseed);

  it("blocks creating assignments for an employee outside the team", async () => {
    const q = await createQuestionnaire(USERS.maria, { title: "T", period: "2026-Q2" });
    await approveQuestionnaire(USERS.maria, q.id);
    await expect(
      createSurveyAssignments(USERS.maria, q.id, [USERS.olek]),
    ).rejects.toThrow(PermissionError);
  });

  it("requires approval before assignments can be created", async () => {
    const q = await createQuestionnaire(USERS.maria, { title: "T", period: "2026-Q2" });
    // Not approved yet.
    await expect(
      createSurveyAssignments(USERS.maria, q.id, [USERS.anna]),
    ).rejects.toThrow(PermissionError);
  });

  it("stores responses submitted via a token", async () => {
    const q = await createQuestionnaire(
      USERS.maria,
      { title: "T", period: "2026-Q2" },
      [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
    );
    await approveQuestionnaire(USERS.maria, q.id);
    const [anna] = await createSurveyAssignments(USERS.maria, q.id, [USERS.anna]);
    const token = tokenFromLink(anna.link);
    const questionId = (await getQuestions(q.id))[0].id;

    expect((await getResponsesForAssignment(anna.assignmentId)).length).toBe(0);

    const { responses } = await submitResponseByToken(token, [
      { questionId, answerText: "I shipped the billing refactor." },
    ]);
    expect(responses.length).toBe(1);
    expect((await getResponsesForAssignment(anna.assignmentId)).length).toBe(1);
  });

  it("rejects an answer for a question from another survey", async () => {
    const q = await createQuestionnaire(
      USERS.maria,
      { title: "T", period: "2026-Q2" },
      [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
    );
    await approveQuestionnaire(USERS.maria, q.id);
    const [anna] = await createSurveyAssignments(USERS.maria, q.id, [USERS.anna]);
    const token = tokenFromLink(anna.link);
    await expect(
      submitResponseByToken(token, [
        { questionId: "not-a-question-in-this-survey", answerText: "x" },
      ]),
    ).rejects.toThrow();
  });

  it("a manager cannot read another manager's questionnaire results", async () => {
    const q = await createQuestionnaire(USERS.nora, { title: "Nora's", period: "2026-Q2" });
    await approveQuestionnaire(USERS.nora, q.id);
    await expect(getQuestionnaireResults(USERS.maria, q.id)).rejects.toThrow(
      PermissionError,
    );
  });

  it("results show only THIS questionnaire's evidence, not seed/other evidence (#5/#6)", async () => {
    const q = await createQuestionnaire(
      USERS.maria,
      { title: "Scoped", period: "2026-Q2" },
      [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
    );
    await approveQuestionnaire(USERS.maria, q.id);
    const [anna] = await createSurveyAssignments(USERS.maria, q.id, [USERS.anna]);

    // Anna has seed evidence for 2026-Q2, but a fresh questionnaire shows none.
    let results = await getQuestionnaireResults(USERS.maria, q.id);
    let row = results.respondents.find((r) => r.respondentId === USERS.anna)!;
    expect(row.evidence.length).toBe(0);

    // After Anna responds, exactly one questionnaire-derived evidence item shows.
    const token = anna.link.split("/").pop()!;
    const questionId = (await getQuestions(q.id))[0].id;
    await orchestrateResponseSubmission(token, [
      { questionId, answerText: STRONG_ANSWER, visibility: "allow_for_review" },
    ]);
    results = await getQuestionnaireResults(USERS.maria, q.id);
    row = results.respondents.find((r) => r.respondentId === USERS.anna)!;
    expect(row.evidence.length).toBe(1);
  });

  it("evidenceValidation=false stores plain responses, skips evidence (#3)", async () => {
    const q = await createQuestionnaire(
      USERS.maria,
      { title: "Pulse", period: "2026-Q2", evidenceValidation: false },
      [{ position: 0, questionType: "long_text", text: "How are things going?" }],
    );
    await approveQuestionnaire(USERS.maria, q.id);
    const [anna] = await createSurveyAssignments(USERS.maria, q.id, [USERS.anna]);
    const token = anna.link.split("/").pop()!;
    const questionId = (await getQuestions(q.id))[0].id;

    const result = await orchestrateResponseSubmission(token, [
      { questionId, answerText: STRONG_ANSWER, visibility: "allow_for_review" },
    ]);
    expect(result.validations.length).toBe(0); // no scoring/follow-ups
    expect((await getResponsesForAssignment(anna.assignmentId)).length).toBe(1); // stored
    const row = (await getQuestionnaireResults(USERS.maria, q.id)).respondents.find(
      (r) => r.respondentId === USERS.anna,
    )!;
    expect(row.evidence.length).toBe(0); // no evidence card created
  });
});
