import { describe, expect, it, vi } from "vitest";
import {
  kulStudentFromProfile,
  syncKulStudent,
} from "../../../packages/auth/src/logins/kul-student";

/**
 * Wie telt als KU Leuven-student voor een SSO-client met `kulRequirement:
 * STUDENT` (Burgieclan). De vorm van het profiel volgt een echte login: `sub`
 * is de accountnaam met `@kuleuven.be` erachter.
 */
describe("kulStudentFromProfile", () => {
  const student = { sub: "r0939342@kuleuven.be" };

  it("accepts an r-number account with a student.kuleuven.be address", () => {
    expect(kulStudentFromProfile(student, "voornaam.naam@student.kuleuven.be")).toBe(true);
  });

  it("is case-insensitive on the account name and the address", () => {
    expect(kulStudentFromProfile({ sub: "R0939342@KULEUVEN.BE" }, "Voornaam.Naam@Student.KULeuven.be")).toBe(true);
  });

  it("refuses staff: a u-number with a kuleuven.be address", () => {
    expect(kulStudentFromProfile({ sub: "u0012345@kuleuven.be" }, "voornaam.naam@kuleuven.be")).toBe(false);
  });

  it("refuses an r-number whose address is not on student.kuleuven.be", () => {
    expect(kulStudentFromProfile(student, "voornaam.naam@kuleuven.be")).toBe(false);
    expect(kulStudentFromProfile(student, "iemand@student.kuleuven.be.example.com")).toBe(false);
    expect(kulStudentFromProfile(student, undefined)).toBe(false);
  });

  it("refuses when any account claim names a u-number", () => {
    expect(
      kulStudentFromProfile(
        { sub: "r0939342@kuleuven.be", preferred_username: "u0012345" },
        "voornaam.naam@student.kuleuven.be",
      ),
    ).toBe(false);
  });

  it("ignores an opaque sub and reads the account name from uid", () => {
    expect(
      kulStudentFromProfile(
        { sub: "AbC123opaque", uid: "r0939342" },
        "voornaam.naam@student.kuleuven.be",
      ),
    ).toBe(true);
  });

  it("refuses when no claim carries a KU Leuven account name", () => {
    expect(kulStudentFromProfile({ sub: "AbC123opaque" }, "voornaam.naam@student.kuleuven.be")).toBe(false);
  });

  it("does not take an r-number from an unrelated claim", () => {
    // `profileRNumber` in kul.ts scant elke claim voor het r-nummer; dat is
    // goed voor het invullen van het profiel, maar zegt niet met welk account
    // iemand inlogde.
    expect(
      kulStudentFromProfile(
        { sub: "u0012345@kuleuven.be", note: "r0939342" },
        "voornaam.naam@student.kuleuven.be",
      ),
    ).toBe(false);
  });
});

describe("syncKulStudent", () => {
  it("updates only an opposite or not-yet-checked stored value", async () => {
    const changedAt = new Date("2026-11-20T10:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await expect(syncKulStudent("user-1", true, changedAt, updateMany)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", OR: [{ kulStudent: false }, { kulStudentChangedAt: null }] },
      data: { kulStudent: true, kulStudentChangedAt: changedAt },
    });
  });

  it("reports no change when nothing matched", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(syncKulStudent("user-1", false, new Date(), updateMany)).resolves.toBe(false);
  });
});
