import { describe, it, expect, beforeEach } from "vitest";
import { reseed, USERS } from "./helpers";
import {
  createQuestionnaire,
  approveQuestionnaire,
  createSurveyAssignments,
  submitResponseByToken,
  getQuestions,
} from "../src/server/services/surveyService";
import {
  getManagerReminderViews,
  sendReminders,
  isOverdue,
} from "../src/server/services/remindersService";
import { getOutboxForManager } from "../src/server/services/outboxService";

const tok = (link: string) => link.split("/").pop()!;

async function setup(deadline: string) {
  const q = await createQuestionnaire(
    USERS.maria,
    { title: "Q2 pulse", period: "2026-Q2", deadline },
    [{ position: 0, questionType: "long_text", text: "How's it going?" }],
  );
  await approveQuestionnaire(USERS.maria, q.id);
  const links = await createSurveyAssignments(USERS.maria, q.id, [
    USERS.anna,
    USERS.mark,
    USERS.julia,
  ]);
  return { q, links };
}

describe("reminders / nudges", () => {
  beforeEach(reseed);

  it("isOverdue reflects a past deadline", () => {
    expect(isOverdue("2020-01-01")).toBe(true);
    expect(isOverdue("2999-01-01")).toBe(false);
    expect(isOverdue(null)).toBe(false);
  });

  it("reports completion + overdue and lists outstanding respondents", async () => {
    const { q, links } = await setup("2020-01-01"); // past -> overdue
    let view = (await getManagerReminderViews(USERS.maria)).find(
      (v) => v.questionnaireId === q.id,
    )!;
    expect(view.total).toBe(3);
    expect(view.submitted).toBe(0);
    expect(view.outstanding).toBe(3);
    expect(view.overdue).toBe(true);

    // Anna submits -> outstanding drops to 2.
    const anna = links.find((l) => l.respondentId === USERS.anna)!;
    await submitResponseByToken(tok(anna.link), [
      { questionId: (await getQuestions(q.id))[0].id, answerText: "going well" },
    ]);
    view = (await getManagerReminderViews(USERS.maria)).find(
      (v) => v.questionnaireId === q.id,
    )!;
    expect(view.submitted).toBe(1);
    expect(view.outstanding).toBe(2);
    expect(view.targets.map((t) => t.respondentId).sort()).toEqual(
      [USERS.mark, USERS.julia].sort(),
    );
  });

  it("nudges only outstanding respondents and does not double-nudge", async () => {
    const { q, links } = await setup("2999-01-01");
    const anna = links.find((l) => l.respondentId === USERS.anna)!;
    await submitResponseByToken(tok(anna.link), [
      { questionId: (await getQuestions(q.id))[0].id, answerText: "done" },
    ]);

    const first = await sendReminders(USERS.maria, q.id);
    expect(first.sent).toBe(2); // mark + julia (anna already submitted)
    expect(first.skipped).toBe(0);

    // reminder rows landed in the outbox
    const reminders = (await getOutboxForManager(USERS.maria)).filter(
      (o) => o.channel === "reminder",
    );
    expect(reminders.length).toBe(2);

    // immediate re-send is de-duped within the window
    const second = await sendReminders(USERS.maria, q.id);
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(2);
  });
});
