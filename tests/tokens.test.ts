import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { reseed, USERS, getStoredTokenHash } from "./helpers";
import { db } from "../src/server/db";
import { surveyAssignments } from "../src/server/db/schema";
import {
  createQuestionnaire,
  approveQuestionnaire,
  createSurveyAssignments,
  getAssignmentByToken,
  submitResponseByToken,
} from "../src/server/services/surveyService";
import { hashToken } from "../src/server/utils/crypto";
import { PermissionError } from "../src/server/auth/permissions";

function tokenFromLink(link: string): string {
  return link.split("/").pop()!;
}

function setupAssignments() {
  const q = createQuestionnaire(
    USERS.maria,
    { title: "T", period: "2026-Q2" },
    [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
  );
  approveQuestionnaire(USERS.maria, q.id);
  const links = createSurveyAssignments(USERS.maria, q.id, [USERS.anna, USERS.mark]);
  return { q, links };
}

describe("survey tokens", () => {
  beforeEach(reseed);

  it("stores only the token hash, never the raw token", () => {
    const { links } = setupAssignments();
    const raw = tokenFromLink(links[0].link);
    const stored = getStoredTokenHash(links[0].assignmentId);
    expect(stored).toBeDefined();
    expect(stored).not.toBe(raw);
    expect(stored).toBe(hashToken(raw));
  });

  it("a token resolves to exactly one assignment", () => {
    const { links } = setupAssignments();
    const annaToken = tokenFromLink(links[0].link);
    const markToken = tokenFromLink(links[1].link);

    const annaAssignment = getAssignmentByToken(annaToken);
    const markAssignment = getAssignmentByToken(markToken);

    expect(annaAssignment?.respondentId).toBe(USERS.anna);
    expect(markAssignment?.respondentId).toBe(USERS.mark);
    expect(annaAssignment?.id).not.toBe(markAssignment?.id);
  });

  it("an unknown token resolves to nothing", () => {
    setupAssignments();
    expect(getAssignmentByToken("not-a-real-token")).toBeNull();
  });

  it("an expired token cannot submit a response (410)", () => {
    const { links } = setupAssignments();
    const token = tokenFromLink(links[0].link);
    // Force expiry.
    db.update(surveyAssignments)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(surveyAssignments.id, links[0].assignmentId))
      .run();

    const question = "q";
    expect(() =>
      submitResponseByToken(token, [{ questionId: question, answerText: "x" }]),
    ).toThrow(PermissionError);
  });

  it("respondent identity comes from the token, not request input", () => {
    const { q, links } = setupAssignments();
    const annaToken = tokenFromLink(links[0].link);
    const questionId = db
      .select()
      .from(surveyAssignments)
      .where(eq(surveyAssignments.questionnaireId, q.id))
      .all();
    expect(questionId.length).toBe(2);
    const assignment = getAssignmentByToken(annaToken);
    expect(assignment?.respondentId).toBe(USERS.anna);
  });
});
