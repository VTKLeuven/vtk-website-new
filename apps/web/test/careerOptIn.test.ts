import { describe, expect, it } from "vitest";
import type { Locale } from "@vtk/i18n";
import {
  careerFitsStudy,
  careerHeading,
  careerOptInOpen,
  careerOptInUpdate,
  shouldAskCareerOptIn,
  withCareerCategory,
} from "@/lib/careerOptIn";
import { careerOptInCopy } from "@/lib/careerOptInCopy";
import { desiredListKeys } from "@/lib/brevo/contacts";

/** Wat het blok als titel toont, voor een taal en een profiel. */
function careerChoiceLabels(
  locale: Locale,
  user: { studyYears: string[]; studyProgrammes: string[] },
) {
  return { heading: careerHeading(careerOptInCopy(locale), user) };
}

const base = {
  isStudent: true,
  mailCategories: [] as string[],
  mailUnsubscribedAt: null as Date | null,
  notAtFaculty: false,
  studyProgrammes: ["ENERGY"] as string[],
  studyYears: ["MASTER_1"] as string[],
};

describe("shouldAskCareerOptIn", () => {
  it("vraagt het aan een student die Career nog niet aanduidde", () => {
    expect(shouldAskCareerOptIn(base)).toBe(true);
  });

  it("vraagt het niet opnieuw aan wie het ooit aanduidde", () => {
    // `mailCategories` is een voorkeur en geen jaarlijkse keuze: wie vorig jaar
    // ja zei, staat er nog in en hoort de vraag niet leeg terug te zien.
    expect(shouldAskCareerOptIn({ ...base, mailCategories: ["CAREER"] })).toBe(false);
    expect(shouldAskCareerOptIn({ ...base, mailCategories: ["FEEST", "CAREER"] })).toBe(false);
  });

  it("vraagt het niet aan wie zich via een mail uitschreef", () => {
    expect(shouldAskCareerOptIn({ ...base, mailUnsubscribedAt: new Date() })).toBe(false);
  });

  it("vraagt het niet zonder richting van ons", () => {
    // Career is per richting opgesplitst; zonder richting past het lid in geen
    // enkel deel en levert de aanduiding niets op.
    expect(shouldAskCareerOptIn({ ...base, studyProgrammes: [] })).toBe(false);
  });

  it("vraagt het niet aan een eerste bachelor", () => {
    // Daar zijn de career-activiteiten niet op gericht, de lijst heeft er geen
    // deel voor, en ze staan allemaal in de Algemene Bachelor.
    expect(
      shouldAskCareerOptIn({
        ...base,
        studyYears: ["BACHELOR_1"],
        studyProgrammes: ["COMMON_BACHELOR"],
      }),
    ).toBe(false);
    // Vanaf de tweede bachelor wel, en ook wie naast zijn eerste jaar al een
    // tweede aanduidde.
    expect(shouldAskCareerOptIn({ ...base, studyYears: ["BACHELOR_2"] })).toBe(true);
    expect(shouldAskCareerOptIn({ ...base, studyYears: ["BACHELOR_1", "BACHELOR_2"] })).toBe(true);
    // Zonder jaar weten we het niet; de algemene Career-lijst past dan nog.
    expect(shouldAskCareerOptIn({ ...base, studyYears: [] })).toBe(true);
  });

  it("vraagt het niet aan wie buiten de faculteit studeert", () => {
    // Die vallen sowieso uit de Career-lijst, dus het vinkje zou een belofte
    // doen die de sync niet nakomt. Deze test staat naast `desiredListKeys`
    // zodat de twee niet uiteen kunnen lopen.
    expect(shouldAskCareerOptIn({ ...base, notAtFaculty: true })).toBe(false);
    expect(
      desiredListKeys(
        {
          name: "Test",
          firstName: null,
          lastName: null,
          email: "test@vtk.be",
          personalEmail: null,
          emailPreference: "UNIVERSITY",
          active: true,
          isStudent: true,
          notAtFaculty: true,
          studyConfirmedYear: 2026,
          mailCategories: ["CAREER"],
          mailUnsubscribedAt: null,
          studyYears: ["MASTER_1"],
          studyProgrammes: ["ENERGY"],
        },
        2026,
      ),
    ).not.toContain("CAREER");
  });
});

describe("de regel volgt stap 1, niet het profiel van vorig jaar", () => {
  it("vraagt het aan wie vorig jaar eerste bachelor was en nu tweede aanduidt", () => {
    // Precies de groep die er dit jaar voor het eerst bij hoort. Op het oude
    // profiel (enkel BACHELOR_1) viel ze weg; op wat het lid nu invult niet.
    const lastYear = { ...base, studyYears: ["BACHELOR_1"], studyProgrammes: ["CIVIL"] };
    expect(careerFitsStudy(lastYear)).toBe(false);
    expect(careerFitsStudy({ ...lastYear, studyYears: ["BACHELOR_2"] })).toBe(true);
  });

  it("vraagt het niet wanneer het lid in stap 1 geen student meer is", () => {
    // Dan bewaart de bevestiging geen richting en geen jaar.
    expect(careerFitsStudy({ ...base, isStudent: false })).toBe(false);
  });

  it("splitst wat vastligt van wat meebeweegt", () => {
    // Career al aan of uitgeschreven via een mail: dat verandert stap 1 niet.
    expect(careerOptInOpen({ mailCategories: ["CAREER"], mailUnsubscribedAt: null })).toBe(false);
    expect(careerOptInOpen({ mailCategories: [], mailUnsubscribedAt: new Date() })).toBe(false);
    expect(careerOptInOpen({ mailCategories: ["FEEST"], mailUnsubscribedAt: null })).toBe(true);
    // En de volledige regel is het een én het ander.
    expect(shouldAskCareerOptIn({ ...base, notAtFaculty: true })).toBe(false);
    expect(shouldAskCareerOptIn(base)).toBe(true);
  });
});

describe("withCareerCategory", () => {
  it("voegt Career toe en laat de andere categorieën staan", () => {
    expect(withCareerCategory(["FEEST", "SPORT"])).toEqual(["FEEST", "SPORT", "CAREER"]);
  });

  it("schrijft niets wanneer Career er al in staat", () => {
    // Anders zou een tweede POST een duplicaat in de array zetten.
    expect(withCareerCategory(["CAREER"])).toBeNull();
  });
});

describe("careerOptInUpdate", () => {
  const now = new Date("2026-09-21T08:00:00Z");

  it("stempelt moment en herkomst wanneer Career aangaat", () => {
    expect(careerOptInUpdate([], ["CAREER"], "STUDY_CONFIRMATION", now)).toEqual({
      careerOptInAt: now,
      careerOptInSource: "STUDY_CONFIRMATION",
    });
  });

  it("wist beide wanneer Career uitgaat", () => {
    // Anders telt de admin herkomsten van wie niet meer op de lijst staat.
    expect(careerOptInUpdate(["CAREER", "FEEST"], ["FEEST"], "ACCOUNT", now)).toEqual({
      careerOptInAt: null,
      careerOptInSource: null,
    });
  });

  it("schrijft niets wanneer Career niet verandert", () => {
    // Een gewone profielopslag mag de herkomst van vorig jaar niet op vandaag
    // zetten, en mag er ook geen verzinnen voor wie Career niet aan heeft.
    expect(careerOptInUpdate(["CAREER"], ["CAREER", "SPORT"], "ACCOUNT", now)).toBeNull();
    expect(careerOptInUpdate(["SPORT"], ["FEEST"], "ACCOUNT", now)).toBeNull();
  });
});

describe("careerChoiceLabels", () => {
  it("zet jaar en richting in de titel", () => {
    const labels = careerChoiceLabels("nl", {
      studyYears: ["MASTER_2"],
      studyProgrammes: ["ENERGY"],
    });
    expect(labels.heading).toBe("Bedrijven zoeken 2de masters Energie");
  });

  it("laat het studiejaar weg wanneer er meerdere zijn", () => {
    const labels = careerChoiceLabels("nl", {
      studyYears: ["BACHELOR_2", "BACHELOR_3"],
      studyProgrammes: ["CIVIL"],
    });
    expect(labels.heading).toBe("Bedrijven zoeken studenten Bouwkunde");
  });

  it("kiest bij meerdere richtingen de eerste", () => {
    // "Studenten van jouw richtingen" is precies de vage zin die dit blok moet
    // vervangen; wie twee richtingen aanduidde, herkent zich in allebei.
    const labels = careerChoiceLabels("nl", {
      studyYears: ["MASTER_1"],
      studyProgrammes: ["ENERGY", "MECHANICAL"],
    });
    expect(labels.heading).toBe("Bedrijven zoeken 1ste masters Energie");
  });

  it("slaat de Algemene Bachelor over zolang er een echte richting naast staat", () => {
    const labels = careerChoiceLabels("nl", {
      studyYears: ["BACHELOR_3"],
      studyProgrammes: ["COMMON_BACHELOR", "CIVIL"],
    });
    expect(labels.heading).toBe("Bedrijven zoeken 3de bachelors Bouwkunde");
  });

  it("valt terug op het studiejaar wanneer er geen richting overblijft", () => {
    const labels = careerChoiceLabels("nl", {
      studyYears: ["BACHELOR_2"],
      studyProgrammes: ["COMMON_BACHELOR"],
    });
    expect(labels.heading).toBe("Bedrijven zoeken 2de bachelors");
  });

  it("valt pas zonder jaar én zonder richting terug op de algemene zin", () => {
    const labels = careerChoiceLabels("nl", {
      studyYears: ["BACHELOR_2", "BACHELOR_3"],
      studyProgrammes: ["COMMON_BACHELOR"],
    });
    expect(labels.heading).toBe("Bedrijven zoeken studenten van jouw richtingen");
  });

  it("werkt ook in het Engels", () => {
    const labels = careerChoiceLabels("en", {
      studyYears: ["MASTER_2"],
      studyProgrammes: ["ENERGY"],
    });
    expect(labels.heading).toBe("Companies are looking for 2nd master students in Energy Engineering");
  });
});
