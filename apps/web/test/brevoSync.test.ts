import { describe, expect, it, vi } from "vitest";

// `lib/mailinglists.ts` is server-only en praat met prisma; de ZIP-opbouw zelf is
// pure functie-werk, dus de client volstaat als lege huls.
vi.mock("@vtk/db", () => ({ prisma: { user: { findMany: vi.fn() } } }));

import { getDictionary } from "@vtk/i18n";
import {
  ALL_STUDENTS_KEY,
  BREVO_LIST_KEYS,
  CAREER_LIST_SEGMENTS,
  alternateEmail,
  careerListKey,
  contactAttributes,
  desiredListKeys,
  emailsToRemove,
  isCareerListKey,
  isEligible,
  preferredEmail,
  programmeAttr,
  readUnsubscribe,
  unsubscribedEmails,
  yearAttr,
  type BrevoListKey,
  type SyncUserData,
} from "@/lib/brevo/contacts";
import { CAREER_SEGMENTS, type CareerSegment } from "@/lib/careerLists";
import { careerZipEntries, type Recipient } from "@/lib/mailinglists";
import { MAIL_CATEGORIES, STUDY_PROGRAMMES, STUDY_YEARS } from "@/lib/profile";

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

/** Bestandsnaam-veilige slug, los herbouwd zodat de test de export niet napraat. */
function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Het pad dat dit deel in de ZIP-export heeft. */
function zipEntryName(segment: CareerSegment): string {
  const group = segment.key.slice(segment.key.lastIndexOf(":") + 1);
  if (segment.programme === null) return `jaren/${group}.csv`;
  const label = getDictionary("nl").onboarding.programmes[segment.programme];
  return `richtingen/${slugify(label)}/${group}.csv`;
}

describe("Career-deellijsten", () => {
  const career = (overrides: Partial<SyncUserData>) =>
    user({ mailCategories: ["CAREER"], ...overrides });

  it("beheert één Brevo-lijst per deel, naast de algemene Career-lijst", () => {
    // Zes jaargroepen plus 32 richting-delen (Architectuur 4, 7 bachelor+master-richtingen 3,
    // 7 masters-only richtingen 1, Algemene Bachelor 0); de algemene lijst is de
    // categorie `CAREER` zelf en telt hier dus niet mee.
    expect(CAREER_SEGMENTS).toHaveLength(6 + 32);

    const keys = CAREER_LIST_SEGMENTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every(isCareerListKey)).toBe(true);
    expect(keys).not.toContain("CAREER");
    expect(BREVO_LIST_KEYS).toHaveLength(1 + MAIL_CATEGORIES.length + CAREER_SEGMENTS.length);
  });

  it("zet een lid in elk deel dat bij zijn jaar en richting past", () => {
    const keys = desiredListKeys(
      career({ studyYears: ["BACHELOR_2"], studyProgrammes: ["CIVIL"] }),
      YEAR,
    );
    expect(keys).toContain("CAREER");
    expect(keys).toEqual(
      expect.arrayContaining([
        "CAREER:jaar:2de-bachelor",
        "CAREER:jaar:alle-bachelors",
        "CAREER:richting:civil:2de-bachelor",
      ]),
    );
    expect(keys).not.toContain("CAREER:jaar:3de-bachelor");
    expect(keys).not.toContain("CAREER:jaar:alle-masters");
    expect(keys).not.toContain("CAREER:richting:civil:masters");
    expect(keys).not.toContain("CAREER:richting:chemical:2de-bachelor");
  });

  it("combineert meerdere studiejaren en richtingen", () => {
    const keys = desiredListKeys(
      career({
        studyYears: ["BACHELOR_3", "MASTER_1"],
        studyProgrammes: ["CIVIL", "CHEMICAL"],
      }),
      YEAR,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "CAREER:jaar:3de-bachelor",
        "CAREER:jaar:alle-bachelors",
        "CAREER:jaar:1ste-master",
        "CAREER:jaar:alle-masters",
        "CAREER:richting:civil:3de-bachelor",
        "CAREER:richting:civil:masters",
        "CAREER:richting:chemical:3de-bachelor",
        "CAREER:richting:chemical:masters",
      ]),
    );
    expect(keys).not.toContain("CAREER:jaar:2de-master");
    expect(keys).not.toContain("CAREER:richting:civil:2de-bachelor");
  });

  it("geeft Architectuur als enige richting een 1ste-bachelor-deel, plus de overige 3 delen", () => {
    const ba1 = desiredListKeys(
      career({ studyYears: ["BACHELOR_1"], studyProgrammes: ["ARCHITECTURE"] }),
      YEAR,
    );
    expect(ba1.filter(isCareerListKey)).toEqual([
      "CAREER:jaar:alle-bachelors",
      "CAREER:richting:architecture:1ste-bachelor",
    ]);

    const ba2 = desiredListKeys(
      career({ studyYears: ["BACHELOR_2"], studyProgrammes: ["ARCHITECTURE"] }),
      YEAR,
    );
    expect(ba2).toContain("CAREER:richting:architecture:2de-bachelor");

    const ba3 = desiredListKeys(
      career({ studyYears: ["BACHELOR_3"], studyProgrammes: ["ARCHITECTURE"] }),
      YEAR,
    );
    expect(ba3).toContain("CAREER:richting:architecture:3de-bachelor");

    const ma = desiredListKeys(
      career({ studyYears: ["MASTER_1"], studyProgrammes: ["ARCHITECTURE"] }),
      YEAR,
    );
    expect(ma).toContain("CAREER:richting:architecture:masters");
  });

  it("plaatst de 7 masters-only richtingen uitsluitend in masters en niet in bachelor-delen", () => {
    const mastersOnly = [
      "CYBERSECURITY",
      "DIGITAL_HUMANITIES",
      "ENERGY",
      "ARTIFICIAL_INTELLIGENCE",
      "NANO",
      "URBANISM",
      "MATHEMATICAL",
    ] as const;

    for (const programme of mastersOnly) {
      const progSlug = programme.toLowerCase().replace(/_/g, "-");
      const segments = CAREER_SEGMENTS.filter((s) => s.programme === programme);
      expect(segments).toHaveLength(1);
      expect(segments[0].key).toBe(`richting:${progSlug}:masters`);

      // Bachelor-student in deze richting krijgt geen enkel richtingsdeel
      const baKeys = desiredListKeys(
        career({ studyYears: ["BACHELOR_2"], studyProgrammes: [programme] }),
        YEAR,
      );
      expect(baKeys.filter((k) => k.startsWith(`CAREER:richting:${progSlug}`))).toEqual([]);

      // Master-student krijgt wél het masters-deel
      const maKeys = desiredListKeys(
        career({ studyYears: ["MASTER_1"], studyProgrammes: [programme] }),
        YEAR,
      );
      expect(maKeys).toContain(`CAREER:richting:${progSlug}:masters`);
    }
  });

  it("kent Algemene Bachelor geen richtingsdelen toe, enkel de algemene lijst en jaargroepen", () => {
    expect(CAREER_SEGMENTS.filter((s) => s.programme === "COMMON_BACHELOR")).toEqual([]);

    const ba1 = desiredListKeys(
      career({ studyYears: ["BACHELOR_1"], studyProgrammes: ["COMMON_BACHELOR"] }),
      YEAR,
    );
    expect(ba1).toContain("CAREER");
    expect(ba1.filter(isCareerListKey)).toEqual(["CAREER:jaar:alle-bachelors"]);

    const ba2 = desiredListKeys(
      career({ studyYears: ["BACHELOR_2"], studyProgrammes: ["COMMON_BACHELOR"] }),
      YEAR,
    );
    expect(ba2).toContain("CAREER");
    expect(ba2.filter(isCareerListKey)).toEqual([
      "CAREER:jaar:2de-bachelor",
      "CAREER:jaar:alle-bachelors",
    ]);
  });

  it("kent een lid met zowel Architectuur 1ste bachelor als een andere richting de juiste combinatie toe", () => {
    const keys = desiredListKeys(
      career({
        studyYears: ["BACHELOR_1", "BACHELOR_2"],
        studyProgrammes: ["ARCHITECTURE", "CIVIL"],
      }),
      YEAR,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "CAREER",
        "CAREER:jaar:2de-bachelor",
        "CAREER:jaar:alle-bachelors",
        "CAREER:richting:architecture:1ste-bachelor",
        "CAREER:richting:architecture:2de-bachelor",
        "CAREER:richting:civil:2de-bachelor",
      ]),
    );
    expect(keys).not.toContain("CAREER:richting:civil:1ste-bachelor");
    expect(keys).not.toContain("CAREER:richting:architecture:3de-bachelor");
    expect(keys).not.toContain("CAREER:richting:civil:masters");
  });

  it("telt een 1ste bachelor in een gewone ingenieursrichting enkel via 'alle bachelors' mee", () => {
    const keys = desiredListKeys(
      career({ studyYears: ["BACHELOR_1"], studyProgrammes: ["CIVIL"] }),
      YEAR,
    );
    expect(keys.filter(isCareerListKey)).toEqual(["CAREER:jaar:alle-bachelors"]);
  });

  it("houdt wie niet aan de faculteit studeert uit élk deel", () => {
    const keys = desiredListKeys(
      career({
        notAtFaculty: true,
        mailCategories: ["CAREER", "FEEST"],
        studyYears: ["BACHELOR_2", "MASTER_1"],
        studyProgrammes: ["CIVIL"],
      }),
      YEAR,
    );
    expect(keys).not.toContain("CAREER");
    expect(keys.filter(isCareerListKey)).toEqual([]);
    expect(keys).toContain("FEEST");
  });

  it("geeft geen delen aan wie Career niet aanvinkte", () => {
    const keys = desiredListKeys(
      user({
        mailCategories: ["FEEST"],
        studyYears: ["BACHELOR_2"],
        studyProgrammes: ["CIVIL"],
      }),
      YEAR,
    );
    expect(keys.filter(isCareerListKey)).toEqual([]);
  });

  it("splitst exact zoals de ZIP-export", () => {
    const members = [
      career({ email: "arch1@vtk.be", studyYears: ["BACHELOR_1"], studyProgrammes: ["ARCHITECTURE"] }),
      career({ email: "common1@vtk.be", studyYears: ["BACHELOR_1"], studyProgrammes: ["COMMON_BACHELOR"] }),
      career({ email: "cyber1@vtk.be", studyYears: ["MASTER_1"], studyProgrammes: ["CYBERSECURITY"] }),
      career({ email: "ba2@vtk.be", studyYears: ["BACHELOR_2"], studyProgrammes: ["CIVIL"] }),
      career({
        email: "mix@vtk.be",
        studyYears: ["BACHELOR_3", "MASTER_1"],
        studyProgrammes: ["CIVIL", "CHEMICAL"],
      }),
      career({
        email: "ma2@vtk.be",
        studyYears: ["MASTER_2"],
        studyProgrammes: ["COMPUTER_SCIENCE"],
      }),
      career({ email: "ba1@vtk.be", studyYears: ["BACHELOR_1"], studyProgrammes: [] }),
    ];
    const recipients: Recipient[] = members.map((m) => ({
      firstname: "Jan",
      lastname: "Peeters",
      email: m.email,
      studyYears: m.studyYears,
      studyProgrammes: m.studyProgrammes,
    }));

    const entries = careerZipEntries(recipients, "nl");
    // Eén CSV voor de algemene lijst, daarna één per Brevo-deellijst, in dezelfde volgorde.
    expect(entries.map((e) => e.name)).toEqual([
      "career-algemeen.csv",
      ...CAREER_SEGMENTS.map(zipEntryName),
    ]);

    const inCsv = (name: string) =>
      members.filter((m) => entries.find((e) => e.name === name)!.content.includes(m.email));
    expect(inCsv("career-algemeen.csv").map((m) => m.email)).toEqual(
      members.filter((m) => desiredListKeys(m, YEAR).includes("CAREER")).map((m) => m.email),
    );
    for (const segment of CAREER_SEGMENTS) {
      const key = careerListKey(segment);
      expect(
        members.filter((m) => desiredListKeys(m, YEAR).includes(key)).map((m) => m.email),
      ).toEqual(inCsv(zipEntryName(segment)).map((m) => m.email));
    }
  });
});

describe("uitschrijven per Career-deel", () => {
  const part = careerListKey(CAREER_SEGMENTS[0]);
  const keyByListId = new Map<number, BrevoListKey>([
    [181, ALL_STUDENTS_KEY],
    [183, "CAREER"],
    [184, part],
  ]);

  it("vinkt bij de algemene Career-lijst de opt-in af, zoals vroeger", () => {
    expect(
      readUnsubscribe({ emailBlacklisted: false, listUnsubscribed: [183] }, keyByListId),
    ).toEqual({ global: false, categories: ["CAREER"] });
  });

  it("laat een uitschrijving voor één deel de opt-in ongemoeid", () => {
    // Er is op de site geen vinkje per deel, dus er valt niets af te vinken: het
    // lid wil de andere career-mails nog. De uitschrijving blijft een feit in
    // Brevo en de sync duwt dat adres niet terug in dat ene deel.
    expect(
      readUnsubscribe({ emailBlacklisted: false, listUnsubscribed: [184] }, keyByListId),
    ).toEqual({ global: false, categories: [] });
  });

  it("blijft globaal bij een blacklist of 'alle studenten', ook met een deel erbij", () => {
    expect(
      readUnsubscribe({ emailBlacklisted: true, listUnsubscribed: [184] }, keyByListId),
    ).toEqual({ global: true, categories: [] });
    expect(
      readUnsubscribe({ emailBlacklisted: false, listUnsubscribed: [181, 184] }, keyByListId),
    ).toEqual({ global: true, categories: [] });
  });

  it("geeft per lijst de adressen die zich er apart voor uitschreven", () => {
    const contacts = [
      { email: "Weg@vtk.be", listUnsubscribed: [184] },
      { email: "blijft@vtk.be", listUnsubscribed: [183] },
      { email: "niets@vtk.be", listUnsubscribed: [] },
    ];
    expect(unsubscribedEmails(contacts, 184)).toEqual(new Set(["weg@vtk.be"]));
    expect(unsubscribedEmails(contacts, 183)).toEqual(new Set(["blijft@vtk.be"]));
    expect(unsubscribedEmails(contacts, 999)).toEqual(new Set());
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
