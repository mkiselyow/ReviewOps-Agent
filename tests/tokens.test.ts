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

async function setupAssignments() {
  const q = await createQuestionnaire(
    USERS.maria,
    { title: "T", period: "2026-Q2" },
    [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
  );
  await approveQuestionnaire(USERS.maria, q.id);
  const links = await createSurveyAssignments(USERS.maria, q.id, [USERS.anna, USERS.mark]);
  return { q, links };
}

describe("survey tokens", () => {
  beforeEach(reseed);

  it("stores only the token hash, never the raw token", async () => {
    const { links } = await setupAssignments();
    const raw = tokenFromLink(links[0].link);
    const stored = await getStoredTokenHash(links[0].assignmentId);
    expect(stored).toBeDefined();
    expect(stored).not.toBe(raw);
    expect(stored).toBe(hashToken(raw));
  });

  it("a token resolves to exactly one assignment", async () => {
    const { links } = await setupAssignments();
    const annaToken = tokenFromLink(links[0].link);
    const markToken = tokenFromLink(links[1].link);

    const annaAssignment = await getAssignmentByToken(annaToken);
    const markAssignment = await getAssignmentByToken(markToken);

    expect(annaAssignment?.respondentId).toBe(USERS.anna);
    expect(markAssignment?.respondentId).toBe(USERS.mark);
    expect(annaAssignment?.id).not.toBe(markAssignment?.id);
  });

  it("an unknown token resolves to nothing", async () => {
    await setupAssignments();
    expect(await getAssignmentByToken("not-a-real-token")).toBeNull();
  });

  it("an expired token cannot submit a response (410)", async () => {
    const { links } = await setupAssignments();
    const token = tokenFromLink(links[0].link);
    // Force expiry.
    await db
      .update(surveyAssignments)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(surveyAssignments.id, links[0].assignmentId))
      .run();

    const question = "q";
    await expect(
      submitResponseByToken(token, [{ questionId: question, answerText: "x" }]),
    ).rejects.toThrow(PermissionError);
  });

  it("respondent identity comes from the token, not request input", async () => {
    const { q, links } = await setupAssignments();
    const annaToken = tokenFromLink(links[0].link);
    const rows = await db
      .select()
      .from(surveyAssignments)
      .where(eq(surveyAssignments.questionnaireId, q.id))
      .all();
    expect(rows.length).toBe(2);
    const assignment = await getAssignmentByToken(annaToken);
    expect(assignment?.respondentId).toBe(USERS.anna);
  });
});
