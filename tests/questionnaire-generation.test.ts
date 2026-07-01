import { describe, it, expect, beforeEach, vi } from "vitest";
import { reseed, USERS } from "./helpers";

// Mock the agent client. generateQuestionnaire returns a deliberately
// invalid-shaped questionnaire so we can prove the orchestrator normalizes it;
// when the notes carry a manager revision request it returns a different set so
// we can prove regenerate replays feedback.
vi.mock("../src/server/agentClient", () => ({
  usingAgentService: () => true,
  generateQuestionnaire: async (input: { topic?: string; notes?: string }) => {
    // Hard-refuse when the request is dominated by protected topics.
    if (/health|religion|marriage|political/i.test(input.topic ?? "")) {
      return {
        title: "Refused",
        purpose: "P",
        privacyMode: "named_review_evidence",
        refused: true,
        refusalReason: "Request asked for protected topics (health, religion).",
        scaleLegend: [],
        questions: [],
        safety: { decision: "needs_revision", riskyQuestions: [], notes: "" },
      };
    }
    const revised = (input.notes ?? "").includes("[Manager revision request]");
    return {
      title: revised ? "Revised matrix" : "Skill matrix",
      purpose: "P",
      privacyMode: "named_review_evidence",
      refused: false,
      refusalReason: "",
      scaleLegend: [{ label: "L1 - Awareness", description: "basic awareness" }],
      questions: revised
        ? [
            { position: 0, questionType: "long_text", text: "Revised question", options: [], explanation: "", required: true, evidenceRequired: false, section: null, optIn: false },
          ]
        : [
            { position: 0, questionType: "single_choice", text: "React", options: ["L1", "L2"], explanation: "", required: true, evidenceRequired: true, section: "Skills", optIn: false },
            { position: 1, questionType: "number", text: "PRs", options: [], explanation: "", required: true, evidenceRequired: true, section: null, optIn: false },
            { position: 2, questionType: "single_choice", text: "bad", options: ["only"], explanation: "", required: true, evidenceRequired: false, section: null, optIn: true },
            { position: 3, questionType: "long_text", text: "Describe", options: [], explanation: "", required: true, evidenceRequired: true, section: null, optIn: false },
          ],
      safety: { decision: "approved", riskyQuestions: [], notes: "" },
    };
  },
  generateReview: async () => ({
    markdown: "",
    evidenceReferences: [],
    fairness: { grounded: false, warnings: [], unsupportedClaims: 0, citedEvidence: [] },
  }),
}));

import {
  orchestrateQuestionnaireGeneration,
  orchestrateQuestionnaireRegeneration,
} from "../src/server/agents/orchestrator";
import {
  getQuestionnaire,
  getQuestions,
  approveQuestionnaire,
} from "../src/server/services/surveyService";
import { PermissionError } from "../src/server/auth/permissions";

describe("questionnaire generation", () => {
  beforeEach(reseed);

  it("normalizes agent output: strips bad evidence, degrades bad choices, keeps valid", async () => {
    const r = await orchestrateQuestionnaireGeneration(USERS.maria, {
      topic: "Frontend skill matrix",
      period: "2026-Q2",
      evidenceValidation: true,
    });
    const qs = await getQuestions(r.questionnaire.id);
    const byText = Object.fromEntries(qs.map((q) => [q.text, q]));

    expect(byText["React"].questionType).toBe("single_choice");
    expect(byText["React"].evidenceRequired).toBe(false); // choice can't carry evidence
    expect(byText["PRs"].evidenceRequired).toBe(false); // number can't carry evidence
    expect(byText["bad"].questionType).toBe("short_text"); // single-option -> degraded
    expect(byText["bad"].optIn).toBe(false);
    expect(byText["Describe"].evidenceRequired).toBe(true); // legit free-text kept
  });

  it("hard-refuses a request dominated by protected topics (needs_revision, no questions)", async () => {
    const r = await orchestrateQuestionnaireGeneration(USERS.maria, {
      topic: "ask about employees' health, religion, and marriage status",
      period: "2026-Q2",
    });
    expect(r.safety.decision).toBe("needs_revision");
    expect(r.safety.notes).toMatch(/protected topics/i);
    // no substitute questions were persisted
    expect((await getQuestions(r.questionnaire.id)).length).toBe(0);
  });

  it("persists the scale legend and the generation input for later regeneration", async () => {
    const r = await orchestrateQuestionnaireGeneration(USERS.maria, {
      topic: "Frontend skill matrix",
      period: "2026-Q2",
      notes: "two sections",
      evidenceValidation: true,
    });
    const row = (await getQuestionnaire(r.questionnaire.id))!;
    expect(JSON.parse(row.scaleLegendJson!)[0].label).toBe("L1 - Awareness");
    expect(JSON.parse(row.genInputJson!).topic).toBe("Frontend skill matrix");
  });

  it("regenerates a draft in place, applying manager feedback", async () => {
    const r = await orchestrateQuestionnaireGeneration(USERS.maria, {
      topic: "Frontend skill matrix",
      period: "2026-Q2",
      evidenceValidation: true,
    });
    expect((await getQuestions(r.questionnaire.id)).length).toBe(4);

    const again = await orchestrateQuestionnaireRegeneration(
      USERS.maria,
      r.questionnaire.id,
      "make it a single open question",
    );
    // same questionnaire id, questions replaced by the revised set
    expect(again.questionnaire.id).toBe(r.questionnaire.id);
    const qs = await getQuestions(r.questionnaire.id);
    expect(qs.length).toBe(1);
    expect(qs[0].text).toBe("Revised question");
  });

  it("refuses to regenerate a non-draft questionnaire", async () => {
    const r = await orchestrateQuestionnaireGeneration(USERS.maria, {
      topic: "x",
      period: "2026-Q2",
    });
    await approveQuestionnaire(USERS.maria, r.questionnaire.id);
    await expect(
      orchestrateQuestionnaireRegeneration(USERS.maria, r.questionnaire.id, "change it"),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
