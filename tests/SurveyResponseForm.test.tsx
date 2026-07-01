// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import SurveyResponseForm from "@/components/SurveyResponseForm";
import type { FormQuestion } from "@/lib/surveyForm";

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

const QUESTIONS: FormQuestion[] = [
  fq({ id: "g", questionType: "single_choice", options: ["Yes", "No"], optIn: true, section: "Skills", text: "Assess skills?" }),
  fq({ id: "react", questionType: "single_choice", options: ["NA", "L1", "L2", "L3", "L4", "L5"], section: "Skills", text: "React" }),
  fq({ id: "count", questionType: "number", text: "PRs merged" }),
  fq({ id: "when", questionType: "date", text: "Start date" }),
  fq({ id: "mail", questionType: "email", text: "Contact email" }),
  fq({ id: "tags", questionType: "multi_choice", options: ["a", "b", "c"], text: "Tags" }),
  fq({ id: "narr", questionType: "long_text", evidenceRequired: true, text: "Describe impact" }),
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ validations: [] }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function lastBody() {
  const call = fetchMock.mock.calls.at(-1)!;
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe("SurveyResponseForm rendering", () => {
  it("renders the right control for each question type", () => {
    const { container } = render(
      <SurveyResponseForm token="t" questions={QUESTIONS} initialAnswers={{}} />,
    );
    // typed inputs
    expect(screen.getByRole("spinbutton", { name: "PRs merged" })).toBeTruthy();
    expect(container.querySelector('input[type="date"]')).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Contact email" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Contact email" }) as HTMLInputElement).type).toBe("email");
    // textarea for long_text
    expect(screen.getByRole("textbox", { name: "Describe impact" }).tagName).toBe("TEXTAREA");
    // multi_choice -> checkboxes
    expect(within(screen.getByRole("group", { name: "Tags" })).getAllByRole("checkbox")).toHaveLength(3);
  });

  it("shows an evidence field only on the evidence-required text question", () => {
    render(<SurveyResponseForm token="t" questions={QUESTIONS} initialAnswers={{}} />);
    const evidenceFields = screen.getAllByRole("textbox", { name: /^Evidence for:/ });
    expect(evidenceFields).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Evidence for: Describe impact" })).toBeTruthy();
  });

  it("hides an opt-in section until its gate is answered Yes", () => {
    render(<SurveyResponseForm token="t" questions={QUESTIONS} initialAnswers={{}} />);
    expect(screen.queryByRole("radiogroup", { name: "React" })).toBeNull();

    const gate = screen.getByRole("radiogroup", { name: "Assess skills?" });
    fireEvent.click(within(gate).getByRole("radio", { name: "Yes" }));

    expect(screen.getByRole("radiogroup", { name: "React" })).toBeTruthy();
  });
});

describe("SurveyResponseForm submission", () => {
  it("composes a payload from typed input, choices, evidence; excludes opted-out", async () => {
    render(<SurveyResponseForm token="tok" questions={QUESTIONS} initialAnswers={{}} />);

    // typed inputs
    fireEvent.change(screen.getByRole("spinbutton", { name: "PRs merged" }), { target: { value: "42" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Contact email" }), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Describe impact" }), { target: { value: "shipped X" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Evidence for: Describe impact" }), { target: { value: "http://pr/1" } });

    // multi-choice: pick a and c
    const tags = screen.getByRole("group", { name: "Tags" });
    fireEvent.click(within(tags).getByRole("checkbox", { name: "a" }));
    fireEvent.click(within(tags).getByRole("checkbox", { name: "c" }));

    // opt in and choose a level
    const gate = screen.getByRole("radiogroup", { name: "Assess skills?" });
    fireEvent.click(within(gate).getByRole("radio", { name: "Yes" }));
    const react = screen.getByRole("radiogroup", { name: "React" });
    fireEvent.click(within(react).getByRole("radio", { name: "L3" }));

    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));
    await screen.findByText(/Thanks/);

    const body = lastBody();
    const byId: Record<string, string> = {};
    for (const a of body.answers) byId[a.questionId] = a.answerText;

    expect(byId["count"]).toBe("42");
    expect(byId["mail"]).toBe("a@b.com");
    expect(byId["tags"]).toBe("a | c");
    expect(byId["narr"]).toBe("shipped X\n\nEvidence: http://pr/1");
    expect(byId["g"]).toBe("Yes");
    expect(byId["react"]).toBe("L3");
    // the date question was left blank -> excluded
    expect(byId["when"]).toBeUndefined();
    expect(body.answers.every((a: { visibility: string }) => a.visibility === "allow_for_review")).toBe(true);
  });

  it("drops opted-out section answers from the payload", async () => {
    // Pre-answer the hidden skill, then leave the gate on No.
    render(
      <SurveyResponseForm token="tok" questions={QUESTIONS} initialAnswers={{ react: "L4" }} />,
    );
    const gate = screen.getByRole("radiogroup", { name: "Assess skills?" });
    fireEvent.click(within(gate).getByRole("radio", { name: "No" }));

    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));
    await screen.findByText(/Thanks/);

    const ids = lastBody().answers.map((a: { questionId: string }) => a.questionId);
    expect(ids).toContain("g");
    expect(ids).not.toContain("react"); // hidden -> excluded even though pre-answered
  });
});
