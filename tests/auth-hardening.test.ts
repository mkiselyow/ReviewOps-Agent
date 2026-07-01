import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { reseed } from "./helpers";
import {
  signSessionValue,
  verifySessionValue,
} from "../src/server/auth/mockSession";
import { rateLimit, __resetRateLimits } from "../src/server/rateLimit";
import { listDemoUsers } from "../src/server/services/hrisService";
import { seedDatabase } from "../src/server/db/seed";
import { db } from "../src/server/db";
import { users, questionnaires } from "../src/server/db/schema";

describe("signed sessions (anti-forgery)", () => {
  it("round-trips a signed value", () => {
    const signed = signSessionValue("u_maria");
    expect(signed).toContain(".");
    expect(verifySessionValue(signed)).toBe("u_maria");
  });

  it("rejects a plaintext (unsigned) cookie — the old forgeable format", () => {
    expect(verifySessionValue("u_maria")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const signed = signSessionValue("u_maria");
    expect(verifySessionValue(signed + "x")).toBeNull();
  });

  it("rejects a swapped uid under someone else's signature", () => {
    const signed = signSessionValue("u_anna");
    const sig = signed.slice(signed.lastIndexOf(".") + 1);
    // Attacker keeps a valid-looking signature but swaps the uid to the manager.
    expect(verifySessionValue(`u_maria.${sig}`)).toBeNull();
  });

  it("handles empty / undefined", () => {
    expect(verifySessionValue(undefined)).toBeNull();
    expect(verifySessionValue("")).toBeNull();
  });
});

describe("rate limiter", () => {
  beforeEach(() => __resetRateLimits());

  it("allows up to max then blocks within the window", () => {
    const key = "test:key";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    expect(rateLimit(key, 3, 60_000).allowed).toBe(false);
  });

  it("keys are independent", () => {
    expect(rateLimit("a", 1, 60_000).allowed).toBe(true);
    expect(rateLimit("a", 1, 60_000).allowed).toBe(false);
    expect(rateLimit("b", 1, 60_000).allowed).toBe(true);
  });
});

describe("demo/real user separation", () => {
  beforeEach(reseed);

  it("listDemoUsers returns only test users (the login switcher list)", async () => {
    const demo = await listDemoUsers();
    expect(demo.length).toBeGreaterThan(0);
    expect(demo.every((u) => u.isTestUser)).toBe(true);
  });

  it("hides a real (non-test) user from the switcher", async () => {
    await db
      .insert(users)
      .values({
        id: "u_real_mgr",
        email: "real.manager@example.com",
        displayName: "Real Manager",
        roleTitle: "Engineering Manager",
        department: "Engineering",
        managerId: null,
        employmentStatus: "active",
        isHrAdmin: false,
        isTestUser: false,
      })
      .run();
    const demo = await listDemoUsers();
    expect(demo.find((u) => u.id === "u_real_mgr")).toBeUndefined();
  });
});

describe("seed wipe guard (protect real data)", () => {
  beforeEach(reseed);
  afterEach(() => {
    delete process.env.SEED_FORCE;
  });

  it("refuses to reseed when a real manager's questionnaire exists", async () => {
    await db
      .insert(users)
      .values({
        id: "u_real_mgr",
        email: "real.manager@example.com",
        displayName: "Real Manager",
        roleTitle: "Engineering Manager",
        department: "Engineering",
        managerId: null,
        employmentStatus: "active",
        isHrAdmin: false,
        isTestUser: false,
      })
      .run();
    await db
      .insert(questionnaires)
      .values({ createdByManagerId: "u_real_mgr", title: "Real cycle", period: "2026-Q2" })
      .run();

    await expect(seedDatabase()).rejects.toThrow(/Refusing to reseed/);

    // SEED_FORCE overrides.
    process.env.SEED_FORCE = "1";
    await expect(seedDatabase()).resolves.toHaveProperty("users");
  });
});

describe("agent shared secret", () => {
  const OLD = process.env.AGENT_SHARED_SECRET;
  afterEach(() => {
    if (OLD === undefined) delete process.env.AGENT_SHARED_SECRET;
    else process.env.AGENT_SHARED_SECRET = OLD;
    vi.unstubAllGlobals();
  });

  it("agentClient attaches X-Agent-Key when AGENT_SHARED_SECRET is set", async () => {
    process.env.AGENT_SHARED_SECRET = "s3cret";
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => ({
        ok: true,
        json: async () => ({
          questionnaire: {
            title: "t",
            purpose: "p",
            privacy_mode: "named_review_evidence",
            questions: [],
          },
          safety: { decision: "approved", risky_questions: [], notes: "" },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { generateQuestionnaire } = await import("../src/server/agentClient");
    await generateQuestionnaire({
      topic: "x",
      period: "2026-Q2",
      companyValues: [],
      roleExpectations: [],
    });

    const headers = fetchMock.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers["X-Agent-Key"]).toBe("s3cret");
  });
});
