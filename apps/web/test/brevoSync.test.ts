import { describe, expect, it } from "vitest";
import {
  ALL_STUDENTS_KEY,
  alternateEmail,
  contactAttributes,
  desiredListKeys,
  emailsToRemove,
  isEligible,
  preferredEmail,
  programmeAttr,
  readUnsubscribe,
  yearAttr,
  type BrevoListKey,
  type SyncUserData,
} from "@/lib/brevo/contacts";
import { STUDY_PROGRAMMES, STUDY_YEARS } from "@/lib/profile";

const YEAR = 2026;

/** Een geschikt lid: actief, dit academiejaar bevestigd, studeert nog. */
function user(overrides: Partial<SyncUserData> = {}): SyncUserData {
  return {
    name: "Jan Peeters",
    firstName: "Jan",
    lastName: "Peeters",
    email: "r0123456@kuleuven.be",
    personalEmail: null,
    emailPreference: "UNIVERSITY",
    active: true,
    isStudent: true,
    notAtFaculty: false,
    studyConfirmedYear: YEAR,
    mailCategories: [],
    mailUnsubscribedAt: null,
    studyYears: [],
    studyProgrammes: [],
    ...overrides,
  };
}

describe("isEligible", () => {
  it("accepts an active, confirmed, still-studying member", () => {
    expect(isEligible(user(), YEAR)).toBe(true);
  });

  it("rejects inactive, non-student, or stale confirmations", () => {
    expect(isEligible(user({ active: false }), YEAR)).toBe(false);
    expect(isEligible(user({ isStudent: false }), YEAR)).toBe(false);
    expect(isEligible(user({ studyConfirmedYear: YEAR - 1 }), YEAR)).toBe(false);
    expect(isEligible(user({ studyConfirmedYear: null }), YEAR)).toBe(false);
  });

  it("rejects a member who unsubscribed through an email, like listWhere", () => {
    expect(isEligible(user({ mailUnsubscribedAt: new Date() }), YEAR)).toBe(false);
    // Ook met categorieën aangevinkt: de uitschrijving gaat voor.
    expect(
      desiredListKeys(
        user({ mailUnsubscribedAt: new Date(), mailCategories: ["FEEST"] }),
        YEAR,
      ),
    ).toEqual([]);
  });
});

describe("readUnsubscribe", () => {
  /** Lijst-ID's zoals `getBrevoListMap()` ze teruggeeft. */
  const keyByListId = new Map<number, BrevoListKey>([
    [181, ALL_STUDENTS_KEY],
    [182, "FEEST"],
    [183, "CAREER"],
  ]);

  it("reads nothing from a contact that did not unsubscribe", () => {
    expect(readUnsubscribe({ emailBlacklisted: false, listUnsubscribed: [] }, keyByListId)).toEqual({
      global: false,
      categories: [],
    });
  });

  it("treats a blacklisted contact as unsubscribed from everything", () => {
    expect(readUnsubscribe({ emailBlacklisted: true, listUnsubscribed: [] }, keyByListId)).toEqual({
      global: true,
      categories: [],
    });
  });

  it("treats leaving 'alle studenten' as leaving everything: there is no opt-in for it", () => {
    expect(
      readUnsubscribe({ emailBlacklisted: false, listUnsubscribed: [181, 182] }, keyByListId),
    ).toEqual({ global: true, categories: [] });
  });

  it("maps a per-list unsubscribe onto the matching categories", () => {
    expect(
      readUnsubscribe({ emailBlacklisted: false, listUnsubscribed: [182, 183] }, keyByListId),
    ).toEqual({ global: false, categories: ["FEEST", "CAREER"] });
  });

  it("ignores lists the site does not manage", () => {
    // Brevo bevat ook handmatige lijsten (jobfair, oude jaargangen); een
    // uitschrijving daar zegt niets over de opt-ins van de site.
    expect(
      readUnsubscribe({ emailBlacklisted: false, listUnsubscribed: [999] }, keyByListId),
    ).toEqual({ global: false, categories: [] });
  });
});

describe("desiredListKeys", () => {
  it("puts no one who is ineligible in any list", () => {
    expect(desiredListKeys(user({ active: false, mailCategories: ["FEEST"] }), YEAR)).toEqual([]);
  });

  it("always includes 'alle studenten' for an eligible member", () => {
    expect(desiredListKeys(user(), YEAR)).toEqual([ALL_STUDENTS_KEY]);
  });

  it("adds each opted-in category", () => {
    const keys = desiredListKeys(user({ mailCategories: ["FEEST", "SPORT"] }), YEAR);
    expect(keys).toContain(ALL_STUDENTS_KEY);
    expect(keys).toContain("FEEST");
    expect(keys).toContain("SPORT");
  });

  it("excludes CAREER for members who do not study at the faculty, like listWhere", () => {
    const keys = desiredListKeys(
      user({ mailCategories: ["CAREER", "FEEST"], notAtFaculty: true }),
      YEAR,
    );
    expect(keys).not.toContain("CAREER");
    // Andere categorieën en 'alle studenten' blijven: notAtFaculty raakt enkel Career.
    expect(keys).toContain("FEEST");
    expect(keys).toContain(ALL_STUDENTS_KEY);
  });

  it("includes CAREER for faculty members who opted in", () => {
    const keys = desiredListKeys(user({ mailCategories: ["CAREER"], notAtFaculty: false }), YEAR);
    expect(keys).toContain("CAREER");
  });
});

describe("preferredEmail / alternateEmail", () => {
  it("uses the personal address only when chosen and present", () => {
    expect(preferredEmail(user({ emailPreference: "UNIVERSITY", personalEmail: "jan@gmail.com" }))).toBe(
      "r0123456@kuleuven.be",
    );
    expect(preferredEmail(user({ emailPreference: "PERSONAL", personalEmail: "jan@gmail.com" }))).toBe(
      "jan@gmail.com",
    );
    // Voorkeur persoonlijk maar niets ingevuld: val terug op de login-mail.
    expect(preferredEmail(user({ emailPreference: "PERSONAL", personalEmail: null }))).toBe(
      "r0123456@kuleuven.be",
    );
  });

  it("returns the other address as the alternate, or null when there is none", () => {
    expect(alternateEmail(user({ emailPreference: "PERSONAL", personalEmail: "jan@gmail.com" }))).toBe(
      "r0123456@kuleuven.be",
    );
    expect(alternateEmail(user({ emailPreference: "UNIVERSITY", personalEmail: "jan@gmail.com" }))).toBe(
      "jan@gmail.com",
    );
    expect(alternateEmail(user({ emailPreference: "UNIVERSITY", personalEmail: null }))).toBeNull();
  });
});

describe("contactAttributes", () => {
  it("maps name plus one boolean per year and programme", () => {
    const attrs = contactAttributes(
      user({ studyYears: ["BACHELOR_2"], studyProgrammes: ["CIVIL"] }),
    );
    expect(attrs.FIRSTNAME).toBe("Jan");
    expect(attrs.LASTNAME).toBe("Peeters");
    expect(attrs[yearAttr("BACHELOR_2")]).toBe(true);
    expect(attrs[yearAttr("MASTER_1")]).toBe(false);
    expect(attrs[programmeAttr("CIVIL")]).toBe(true);
    expect(attrs[programmeAttr("CHEMICAL")]).toBe(false);
    // Naam + elke studiejaar-boolean + elke richting-boolean.
    expect(Object.keys(attrs)).toHaveLength(2 + STUDY_YEARS.length + STUDY_PROGRAMMES.length);
  });

  it("falls back to the display name when firstName/lastName are missing", () => {
    const attrs = contactAttributes(user({ firstName: null, lastName: null, name: "Jan Van Den Broeck" }));
    expect(attrs.FIRSTNAME).toBe("Jan");
    expect(attrs.LASTNAME).toBe("Van Den Broeck");
  });
});

describe("emailsToRemove", () => {
  it("returns the addresses present in Brevo but not desired, case-insensitively", () => {
    const current = ["Keep@Vtk.be", "drop@vtk.be", "STALE@vtk.be"];
    const desired = ["keep@vtk.be", "new@vtk.be"];
    expect(emailsToRemove(current, desired)).toEqual(["drop@vtk.be", "STALE@vtk.be"]);
  });

  it("removes nothing when every current address is desired", () => {
    expect(emailsToRemove(["a@vtk.be"], ["A@vtk.be"])).toEqual([]);
  });
});
