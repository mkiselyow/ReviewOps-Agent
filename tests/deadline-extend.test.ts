import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { reseed, USERS } from "./helpers";
import {
  createQuestionnaire,
  approveQuestionnaire,
  createSurveyAssignments,
  updateQuestionnaireDeadline,
  getAssignmentsForQuestionnaire,
  submitResponseByToken,
  getQuestions,
} from "../src/server/services/surveyService";
import { isAssignmentExpired } from "../src/server/auth/permissions";
import { deadlineToExpiryIso } from "../src/server/utils/dates";
import { db } from "../src/server/db";
import { surveyAssignments } from "../src/server/db/schema";

const tokenFromLink = (link: string) => link.split("/").pop()!;
function nextYearDate(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

describe("deadlineToExpiryIso", () => {
  it("is the end of the given UTC day; null for empty", () => {
    expect(deadlineToExpiryIso("2026-07-03")).toBe("2026-07-03T23:59:59.999Z");
    expect(deadlineToExpiryIso(null)).toBeNull();
    expect(deadlineToExpiryIso("")).toBeNull();
  });
});

describe("extend/reopen survey deadline", () => {
  beforeEach(reseed);

  it("reopens an expired link, leaves submitted ones, updates the deadline", async () => {
    const q = await createQuestionnaire(
      USERS.maria,
      { title: "T", period: "2026-Q2" },
      [{ position: 0, questionType: "long_text", text: "Describe a contribution." }],
    );
    await approveQuestionnaire(USERS.maria, q.id);
    const [anna, mark] = await createSurveyAssignments(USERS.maria, q.id, [
      USERS.anna,
      USERS.mark,
    ]);

    // Mark submits; Anna does not.
    const questionId = (await getQuestions(q.id))[0].id;
    await submitResponseByToken(tokenFromLink(mark.link), [
      { questionId, answerText: "I shipped the billing refactor." },
    ]);

    // Force Anna's link to be expired.
    await db
      .update(surveyAssignments)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(surveyAssignments.id, anna.assignmentId))
      .run();

    let all = await getAssignmentsForQuestionnaire(q.id);
    expect(isAssignmentExpired(all.find((a) => a.id === anna.assignmentId)!)).toBe(true);

    // Extend the deadline.
    const deadline = nextYearDate();
    const res = await updateQuestionnaireDeadline(USERS.maria, q.id, deadline);
    expect(res.reopened).toBe(1); // Anna only — Mark already submitted
    expect(res.questionnaire.deadline).toBe(deadline);

    all = await getAssignmentsForQuestionnaire(q.id);
    expect(isAssignmentExpired(all.find((a) => a.id === anna.assignmentId)!)).toBe(false);
    expect(all.find((a) => a.id === mark.assignmentId)!.status).toBe("submitted");
  });
});
