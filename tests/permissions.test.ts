import { describe, it, expect, beforeEach } from "vitest";
import { reseed, USERS } from "./helpers";
import {
  canManagerViewEmployee,
  canAccessEmployeeData,
  assertManagerCanViewEmployee,
  PermissionError,
} from "../src/server/auth/permissions";
import { getEmployeeEvidence } from "../src/server/services/evidenceService";
import { getUserById } from "../src/server/services/hrisService";

describe("access control", () => {
  beforeEach(reseed);

  it("manager can view a direct report", async () => {
    const anna = (await getUserById(USERS.anna))!;
    expect(canManagerViewEmployee(USERS.maria, anna)).toBe(true);
  });

  it("manager cannot view an employee outside their team", async () => {
    const olek = (await getUserById(USERS.olek))!;
    expect(canManagerViewEmployee(USERS.maria, olek)).toBe(false);
    expect(() => assertManagerCanViewEmployee(USERS.maria, olek)).toThrow(
      PermissionError,
    );
  });

  it("evidence service blocks access to an outside-team employee (403)", async () => {
    await expect(getEmployeeEvidence(USERS.maria, USERS.olek)).rejects.toBeInstanceOf(
      PermissionError,
    );
    try {
      await getEmployeeEvidence(USERS.maria, USERS.olek);
    } catch (err) {
      expect((err as PermissionError).statusCode).toBe(403);
    }
  });

  it("an employee can access their own data but not a peer's", async () => {
    const anna = (await getUserById(USERS.anna))!;
    const mark = (await getUserById(USERS.mark))!;
    expect(canAccessEmployeeData({ id: USERS.anna }, anna)).toBe(true);
    expect(canAccessEmployeeData({ id: USERS.anna }, mark)).toBe(false);
  });

  it("the other manager (Nora) can view Olek, Maria cannot", async () => {
    const olek = (await getUserById(USERS.olek))!;
    expect(canManagerViewEmployee(USERS.nora, olek)).toBe(true);
    expect(canManagerViewEmployee(USERS.maria, olek)).toBe(false);
  });
});
