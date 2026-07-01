import { describe, it, expect } from "vitest";
import {
  type FormQuestion,
  buildGateBySection,
  buildSubmitPayload,
  composeAnswer,
  isQuestionVisible,
  toggleMultiValue,
} from "../src/lib/surveyForm";

function fq(o: Partial<FormQuestion> & { id: string }): FormQuestion {
  return {
    position: 0,
    questionType: "long_text",
    text: "Q",
    options: [],
    required: true,
    evidenceRequired: false,
    section: null,
    optIn: false,
    explanation: null,
    ...o,
  };
}

describe("toggleMultiValue", () => {
  it("adds and removes options, keeping a ` | ` join", () => {
    expect(toggleMultiValue("", "A")).toBe("A");
    expect(toggleMultiValue("A", "B")).toBe("A | B");
    expect(toggleMultiValue("A | B", "A")).toBe("B");
  });
});

describe("opt-in visibility", () => {
  const gate = fq({ id: "g", questionType: "single_choice", options: ["Yes", "No"], optIn: true, section: "S" });
  const child = fq({ id: "c", questionType: "single_choice", options: ["L1", "L2"], section: "S" });
  const ungrouped = fq({ id: "u" });
  const questions = [gate, child, ungrouped];

  it("hides section children until the gate is answered yes", () => {
    const gates = buildGateBySection(questions);
    expect(isQuestionVisible(child, {}, gates)).toBe(false);
    expect(isQuestionVisible(child, { g: "No" }, gates)).toBe(false);
    expect(isQuestionVisible(child, { g: "Yes" }, gates)).toBe(true);
    // the gate itself and ungrouped questions are always visible
    expect(isQuestionVisible(gate, {}, gates)).toBe(true);
    expect(isQuestionVisible(ungrouped, {}, gates)).toBe(true);
  });
});

describe("composeAnswer", () => {
  it("appends an evidence link only when evidence is required", () => {
    const q = fq({ id: "q", evidenceRequired: true });
    expect(composeAnswer(q, { q: "did work" }, { q: "http://pr/1" })).toBe(
      "did work\n\nEvidence: http://pr/1",
    );
    // no link given -> base only
    expect(composeAnswer(q, { q: "did work" }, {})).toBe("did work");
    // evidence not required -> link ignored
    const q2 = fq({ id: "q", evidenceRequired: false });
    expect(composeAnswer(q2, { q: "did work" }, { q: "http://pr/1" })).toBe("did work");
  });
});

describe("buildSubmitPayload", () => {
  const questions = [
    fq({ id: "g", questionType: "single_choice", options: ["Yes", "No"], optIn: true, section: "S" }),
    fq({ id: "skill", questionType: "single_choice", options: ["L1", "L2"], section: "S" }),
    fq({ id: "multi", questionType: "multi_choice", options: ["a", "b", "c"] }),
    fq({ id: "narr", questionType: "long_text", evidenceRequired: true }),
    fq({ id: "blank", questionType: "short_text" }),
  ];

  it("excludes hidden (opted-out) questions and empty answers, composes evidence", () => {
    const answers = {
      g: "No", // section opted out -> skill hidden
      skill: "L2", // hidden, must be dropped even though answered
      multi: "a | c",
      narr: "shipped it",
      // blank: omitted -> empty -> dropped
    };
    const evidence = { narr: "http://pr/9" };
    const payload = buildSubmitPayload(questions, answers, evidence, true);
    const ids = payload.map((p) => p.questionId);

    expect(ids).not.toContain("skill"); // hidden
    expect(ids).not.toContain("blank"); // empty
    expect(ids).toContain("g");
    expect(payload.find((p) => p.questionId === "multi")!.answerText).toBe("a | c");
    expect(payload.find((p) => p.questionId === "narr")!.answerText).toBe(
      "shipped it\n\nEvidence: http://pr/9",
    );
    expect(payload.every((p) => p.visibility === "allow_for_review")).toBe(true);
  });

  it("reveals the section and carries share_with_manager when review consent is off", () => {
    const payload = buildSubmitPayload(
      questions,
      { g: "Yes", skill: "L1" },
      {},
      false,
    );
    const ids = payload.map((p) => p.questionId);
    expect(ids).toContain("skill"); // revealed
    expect(payload.every((p) => p.visibility === "share_with_manager")).toBe(true);
  });
});
