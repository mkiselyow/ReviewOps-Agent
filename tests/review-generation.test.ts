import { describe, it, expect, beforeEach } from "vitest";
import { reseed, USERS } from "./helpers";
import { orchestrateReviewGeneration } from "../src/server/agents/orchestrator";
import { runFairnessGroundingAgent } from "../src/server/agents/fairnessGroundingAgent";
import { generateReviewContext } from "../src/server/services/reviewService";
import { createEvidenceItem } from "../src/server/services/evidenceService";

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

  it("flags an unsupported claim and vague praise", async () => {
    const markdown = [
      "## Achievements",
      "- Did a great job leading the project",
      "",
      "## Evidence References",
      "- none",
    ].join("\n");
    const r = await runFairnessGroundingAgent({
      markdown,
      evidenceIds: ["ev_anna_1"],
    });
    expect(r.output.unsupportedClaims).toBeGreaterThan(0);
    expect(r.output.grounded).toBe(false);
    expect(r.output.warnings.some((w) => w.type === "unsupported_claim")).toBe(true);
  });

  it("recognizes UUID-style evidence citations (not just slug ids)", async () => {
    const uuid = "e1fdc75e-4fe6-4e4e-8985-f2190a27d024";
    const markdown = [
      "## Achievements",
      `- Shipped the billing refactor [${uuid}]`,
      "",
      "## Evidence References",
      `- [${uuid}] Shipped the billing refactor`,
    ].join("\n");
    const r = await runFairnessGroundingAgent({ markdown, evidenceIds: [uuid] });
    expect(r.output.unsupportedClaims).toBe(0);
    expect(r.output.citedEvidence).toContain(uuid);
    expect(r.output.grounded).toBe(true);
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
