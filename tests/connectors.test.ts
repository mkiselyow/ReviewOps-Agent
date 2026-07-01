import { describe, it, expect, beforeEach } from "vitest";
import { reseed, USERS } from "./helpers";
import { directory, performance, gatherReviewSignals } from "../src/server/connectors";

describe("mock connectors", () => {
  beforeEach(reseed);

  it("directory presents HRIS users in BambooHR shape", async () => {
    const reports = await directory.getReports(USERS.maria);
    expect(reports.length).toBeGreaterThan(0);
    const anna = reports.find((e) => e.id === USERS.anna)!;
    expect(anna.displayName).toBe("Anna");
    expect(anna.workEmail).toContain("@");
    expect(anna.supervisorId).toBe(USERS.maria);
    expect(anna.status).toBe("Active");
  });

  it("performance connector returns Lattice-shaped peer reviews for a cycle", async () => {
    const peers = await performance.getPeerReviews(USERS.anna, "2026-Q2");
    expect(peers.length).toBe(2);
    expect(peers.every((p) => p.rating >= 1 && p.rating <= 5)).toBe(true);
    // a different cycle returns nothing
    expect((await performance.getPeerReviews(USERS.anna, "2025-Q1")).length).toBe(0);
  });

  it("gatherReviewSignals normalizes peer/feedback/1:1 into citeable evidence", async () => {
    const signals = await gatherReviewSignals(USERS.maria, USERS.anna, "2026-Q2");
    // 2 peer reviews + 1 feedback + 1 one-on-one
    expect(signals.length).toBe(4);
    expect(signals.some((s) => s.id.startsWith("peer:"))).toBe(true);
    expect(signals.some((s) => s.id.startsWith("fb:"))).toBe(true);
    expect(signals.some((s) => s.id.startsWith("1on1:"))).toBe(true);
    // peer ratings map to a 0..1 quality score
    const peer = signals.find((s) => s.id.startsWith("peer:"))!;
    expect(peer.qualityScore).toBeGreaterThan(0);
    expect(peer.qualityScore).toBeLessThanOrEqual(1);
  });
});
