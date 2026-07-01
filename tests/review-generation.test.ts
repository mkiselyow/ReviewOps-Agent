import { describe, it, expect, beforeEach, vi } from "vitest";
import { reseed, USERS } from "./helpers";
import { orchestrateReviewGeneration } from "../src/server/agents/orchestrator";
import { generateReviewContext } from "../src/server/services/reviewService";
import { createEvidenceItem } from "../src/server/services/evidenceService";

vi.mock("../src/server/agentClient", async () => await import("./agentClientMock"));

describe("review generation", () => {
  beforeEach(reseed);

  it("produces a draft grounded in evidence + external signals", async () => {
    const result = await orchestrateReviewGeneration(USERS.maria, USERS.anna, "2026-Q2");
    // 2 consented seed evidence items + 4 connector signals (2 peer reviews,
    // 1 feedback, 1 one-on-one) for Anna in 2026-Q2.
    expect(result.grounding.evidenceCount).toBe(6);
    expect(result.draft.draftMarkdown).toContain("ev_anna_1");
    expect(result.draft.draftMarkdown).toContain("Evidence References");
    expect(result.fairness.grounded).toBe(true);
    // A connector-sourced peer review is cited too.
    expect(result.fairness.citedEvidence.some((id) => id.startsWith("peer:"))).toBe(true);
  });

  it("consent gate excludes non-consented evidence but folds in connector signals", async () => {
    // Add a non-consented evidence item for Anna in the same period.
    createEvidenceItem({
      employeeId: USERS.anna,
      sourceType: "manual_upload",
      summary: "Private note that should not be used for review.",
      period: "2026-Q2",
      visibility: "share_with_manager",
    });

    const ctx = await generateReviewContext(USERS.maria, USERS.anna, "2026-Q2");
    // The non-consented note is excluded...
    expect(ctx.evidence.some((e) => e.summary.includes("Private note"))).toBe(false);
    // ...and external signals (peer review / 1:1) are folded in.
    expect(ctx.evidence.some((e) => e.id.startsWith("peer:"))).toBe(true);
    expect(ctx.evidence.some((e) => e.id.startsWith("1on1:"))).toBe(true);
  });

  it("does not generate a review for an employee outside the team", async () => {
    await expect(
      orchestrateReviewGeneration(USERS.maria, USERS.olek, "2026-Q2"),
    ).rejects.toThrow();
  });
});
