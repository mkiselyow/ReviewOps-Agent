import { describe, it, expect } from "vitest";
import {
  normalizeGeneratedQuestions,
  type RawGeneratedQuestion,
} from "../src/server/agents/normalizeQuestions";

function q(overrides: Partial<RawGeneratedQuestion>): RawGeneratedQuestion {
  return {
    position: 0,
    questionType: "long_text",
    text: "Q",
    ...overrides,
  };
}

describe("normalizeGeneratedQuestions", () => {
  it("keeps evidence_required only on free-text types", () => {
    const out = normalizeGeneratedQuestions([
      q({ questionType: "long_text", evidenceRequired: true }),
      q({ questionType: "short_text", evidenceRequired: true }),
      q({ questionType: "single_choice", options: ["a", "b"], evidenceRequired: true }),
      q({ questionType: "number", evidenceRequired: true }),
      q({ questionType: "date", evidenceRequired: true }),
      q({ questionType: "email", evidenceRequired: true }),
      q({ questionType: "evidence_link", evidenceRequired: true }),
    ]);
    expect(out.map((o) => o.evidenceRequired)).toEqual([
      true, // long_text
      true, // short_text
      false, // single_choice
      false, // number
      false, // date
      false, // email
      false, // evidence_link
    ]);
  });

  it("strips options from non-choice types and keeps them for choices", () => {
    const out = normalizeGeneratedQuestions([
      q({ questionType: "single_choice", options: ["L1", "L2", "L3"] }),
      q({ questionType: "long_text", options: ["nope"] as string[] }),
      q({ questionType: "number", options: ["1", "2"] as string[] }),
    ]);
    expect(out[0].options).toEqual(["L1", "L2", "L3"]);
    expect(out[1].options).toBeNull();
    expect(out[2].options).toBeNull();
  });

  it("degrades a choice with fewer than 2 options to short_text", () => {
    const out = normalizeGeneratedQuestions([
      q({ questionType: "single_choice", options: ["only one"] }),
      q({ questionType: "rating", options: [] }),
    ]);
    expect(out[0].questionType).toBe("short_text");
    expect(out[0].options).toBeNull();
    expect(out[1].questionType).toBe("short_text");
  });

  it("degrades unknown question types to short_text", () => {
    const out = normalizeGeneratedQuestions([
      q({ questionType: "slider" }),
      q({ questionType: "" }),
    ]);
    expect(out.every((o) => o.questionType === "short_text")).toBe(true);
  });

  it("keeps opt_in only on a single_choice with options", () => {
    const out = normalizeGeneratedQuestions([
      q({ questionType: "single_choice", options: ["Yes", "No"], optIn: true, section: "A" }),
      q({ questionType: "long_text", optIn: true, section: "A" }),
      q({ questionType: "single_choice", options: ["x"], optIn: true }),
      q({ questionType: "multi_choice", options: ["a", "b"], optIn: true }),
    ]);
    expect(out[0].optIn).toBe(true);
    expect(out[1].optIn).toBe(false); // not single_choice
    expect(out[2].optIn).toBe(false); // degraded (one option)
    expect(out[3].optIn).toBe(false); // multi_choice can't be a gate
  });

  it("re-numbers positions and trims empty sections to null", () => {
    const out = normalizeGeneratedQuestions([
      q({ position: 5, section: "  " }),
      q({ position: 9, section: " Frameworks " }),
    ]);
    expect(out.map((o) => o.position)).toEqual([0, 1]);
    expect(out[0].section).toBeNull();
    expect(out[1].section).toBe("Frameworks");
  });

  it("drops blank option strings before counting", () => {
    const out = normalizeGeneratedQuestions([
      q({ questionType: "single_choice", options: ["A", "  ", "B"] }),
    ]);
    expect(out[0].options).toEqual(["A", "B"]);
    expect(out[0].questionType).toBe("single_choice");
  });
});
