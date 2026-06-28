import { describe, it, expect, beforeEach, vi } from "vitest";
import { reseed, USERS } from "./helpers";
import { orchestrateReviewGeneration } from "../src/server/agents/orchestrator";
import { generateReviewContext } from "../src/server/services/reviewService";
import { createEvidenceItem } from "../src/server/services/evidenceService";

vi.mock("../src/server/agentClient", async () => await import("./agentClientMock"));

describe("review generation", () => {
  beforeEach(reseed);

  it("produces a draft grounded in evidence references", async () => {
    const result = await orchestrateReviewGeneration(USERS.maria, USERS.anna, "2026-Q2");
    // Seed has two allow_for_review evidence items for Anna in 2026-Q2.
    expect(result.grounding.evidenceCount).toBe(2);
    expect(result.draft.draftMarkdown).toContain("ev_anna_1");
    expect(result.draft.draftMarkdown).toContain("Evidence References");
    expect(result.fairness.grounded).toBe(true);
    expect(result.fairness.citedEvidence.length).toBeGreaterThan(0);
  });

  it("consent gate: only allow_for_review evidence reaches the review context", () => {
    // Add a non-consented evidence item for Anna in the same period.
    createEvidenceItem({
      employeeId: USERS.anna,
      sourceType: "manual_upload",
      summary: "Private note that should not be used for review.",
      period: "2026-Q2",
      visibility: "share_with_manager",
    });

    const ctx = generateReviewContext(USERS.maria, USERS.anna, "2026-Q2");
    // Still only the two allow_for_review seed items; the new one is excluded.
    expect(ctx.evidence.length).toBe(2);
    expect(ctx.evidence.every((e) => e.visibility === "allow_for_review")).toBe(true);
  });

  it("does not generate a review for an employee outside the team", async () => {
    await expect(
      orchestrateReviewGeneration(USERS.maria, USERS.olek, "2026-Q2"),
    ).rejects.toThrow();
  });
});
