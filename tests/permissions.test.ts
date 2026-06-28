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

  it("manager can view a direct report", () => {
    const anna = getUserById(USERS.anna)!;
    expect(canManagerViewEmployee(USERS.maria, anna)).toBe(true);
  });

  it("manager cannot view an employee outside their team", () => {
    const olek = getUserById(USERS.olek)!;
    expect(canManagerViewEmployee(USERS.maria, olek)).toBe(false);
    expect(() => assertManagerCanViewEmployee(USERS.maria, olek)).toThrow(
      PermissionError,
    );
  });

  it("evidence service blocks access to an outside-team employee (403)", () => {
    expect(() => getEmployeeEvidence(USERS.maria, USERS.olek)).toThrow(
      PermissionError,
    );
    try {
      getEmployeeEvidence(USERS.maria, USERS.olek);
    } catch (err) {
      expect((err as PermissionError).statusCode).toBe(403);
    }
  });

  it("an employee can access their own data but not a peer's", () => {
    const anna = getUserById(USERS.anna)!;
    const mark = getUserById(USERS.mark)!;
    expect(canAccessEmployeeData({ id: USERS.anna }, anna)).toBe(true);
    expect(canAccessEmployeeData({ id: USERS.anna }, mark)).toBe(false);
  });

  it("the other manager (Nora) can view Olek, Maria cannot", () => {
    const olek = getUserById(USERS.olek)!;
    expect(canManagerViewEmployee(USERS.nora, olek)).toBe(true);
    expect(canManagerViewEmployee(USERS.maria, olek)).toBe(false);
  });
});
