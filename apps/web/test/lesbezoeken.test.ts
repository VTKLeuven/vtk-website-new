import { describe, expect, it } from "vitest";
import {
  LESBEZOEK_COLOURS,
  LESBEZOEK_MIN_LEAD_DAYS,
  defaultTeacherLocale,
  matchPeculiarities,
  nextOrganisationColour,
  organisationKey,
  parseDateTimeFields,
  parseLesbezoekRequest,
  teacherNameFromEmail,
  visitEnd,
  type RawLesbezoekInput,
} from "@/lib/lesbezoeken";
import { buildLesbezoekIcs } from "@/lib/lesbezoekenIcs";
import {
  DEFAULT_LESBEZOEK_TEMPLATES,
  mailVarsFor,
  parseLesbezoekTemplates,
  professorTemplateKey,
  renderMailTemplate,
  renderTemplate,
} from "@/lib/lesbezoekenMail";

const NOW = new Date("2026-01-01T10:00:00.000Z");

/** Een geldige aanvraag; per test overschrijven we er één veld van. */
function validInput(overrides: Partial<RawLesbezoekInput> = {}): RawLesbezoekInput {
  return {
    organisationId: "org1",
    requesterName: "Jan Peeters",
    requesterEmail: "jan@existenz.be",
    requesterPhone: "0470 12 34 56",
    subject: "Lesbezoek Revue",
    teacherNote: "Wij komen de Revue aankondigen, dit duurt vijf minuten.",
    audience: "3e Bach, Computerwetenschappen",
    course: "H06U1a Artificiële intelligentie",
    teacherEmail: "luc.deraedt@kuleuven.be",
    date: "2026-03-01",
    time: "11:30",
    ...overrides,
  };
}

/** Het instant dat bij `validInput` hoort; ruim voorbij de aanvraagtermijn. */
const START = new Date("2026-03-01T10:30:00.000Z");

describe("parseLesbezoekRequest", () => {
  it("aanvaardt een volledige aanvraag", () => {
    const result = parseLesbezoekRequest(validInput(), { startsAt: START, now: NOW });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.request.organisationId).toBe("org1");
    expect(result.request.course).toBe("H06U1a Artificiële intelligentie");
    expect(result.request.longVisit).toBe(false);
  });

  it("meldt succes zonder iets te doen wanneer de honeypot ingevuld is", () => {
    const result = parseLesbezoekRequest(validInput({ honeypot: "http://spam" }), {
      startsAt: START,
      now: NOW,
    });
    // Een bot die een foutmelding krijgt, weet dat hij ontdekt is.
    expect(result.status).toBe("honeypot");
  });

  it("laat de honeypot voorgaan op een ontbrekend veld", () => {
    const result = parseLesbezoekRequest(
      { honeypot: "x", organisationId: "", requesterEmail: "" },
      { startsAt: null, now: NOW },
    );
    expect(result.status).toBe("honeypot");
  });

  it("weigert een aanvraag zonder organisatie", () => {
    const result = parseLesbezoekRequest(
      validInput({ organisationId: "", organisationName: "" }),
      { startsAt: START, now: NOW },
    );
    expect(result).toEqual({ status: "error", code: "ORGANISATION_REQUIRED" });
  });

  it("aanvaardt een zelf ingetikte organisatienaam", () => {
    const result = parseLesbezoekRequest(
      validInput({ organisationId: "", organisationName: "Emergent" }),
      { startsAt: START, now: NOW },
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.request.organisationId).toBeNull();
    expect(result.request.organisationName).toBe("Emergent");
  });

  it("weigert een aanvraag die te kort op de bal is", () => {
    const soon = new Date(NOW.getTime() + (LESBEZOEK_MIN_LEAD_DAYS - 1) * 86_400_000);
    const result = parseLesbezoekRequest(validInput({ date: "2026-01-10" }), {
      startsAt: soon,
      now: NOW,
    });
    expect(result).toEqual({ status: "error", code: "TOO_SOON" });
  });

  it("weigert een aanvraag meer dan een jaar vooruit", () => {
    const far = new Date(NOW.getTime() + 400 * 86_400_000);
    const result = parseLesbezoekRequest(validInput({ date: "2027-02-05" }), {
      startsAt: far,
      now: NOW,
    });
    expect(result).toEqual({ status: "error", code: "TOO_FAR" });
  });

  it("weigert een onbestaande datum", () => {
    const result = parseLesbezoekRequest(validInput({ date: "2026-02-31" }), {
      startsAt: START,
      now: NOW,
    });
    expect(result).toEqual({ status: "error", code: "DATE_INVALID" });
  });

  it("weigert een docentadres dat geen adres is", () => {
    const result = parseLesbezoekRequest(validInput({ teacherEmail: "de prof" }), {
      startsAt: START,
      now: NOW,
    });
    expect(result).toEqual({ status: "error", code: "TEACHER_EMAIL_INVALID" });
  });

  it("laat het vrije doelgroepveld voorgaan op de keuzelijst", () => {
    const result = parseLesbezoekRequest(
      validInput({ audience: "3e Bach, Architectuur", audienceOther: "2e Ma, BME" }),
      { startsAt: START, now: NOW },
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.request.audience).toBe("2e Ma, BME");
  });

  it("houdt de regeleindes in de toelichting, want die gaat zo naar de docent", () => {
    const result = parseLesbezoekRequest(
      validInput({ teacherNote: "Geachte professor,\r\n\r\nWij zouden graag…" }),
      { startsAt: START, now: NOW },
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.request.teacherNote).toBe("Geachte professor,\n\nWij zouden graag…");
  });
});

describe("parseDateTimeFields", () => {
  it("leest een geldige datum en tijd", () => {
    expect(parseDateTimeFields("2026-03-01", "11:30")).toEqual({
      year: 2026,
      month: 3,
      day: 1,
      minutes: 690,
    });
  });

  it("weigert een dag die in die maand niet bestaat", () => {
    expect(parseDateTimeFields("2025-02-29", "09:00")).toBeNull();
  });

  it("weigert een uur boven de klok", () => {
    expect(parseDateTimeFields("2026-03-01", "25:00")).toBeNull();
  });
});

describe("teacherNameFromEmail", () => {
  it("neemt de achternaam uit een KU Leuven-adres", () => {
    expect(teacherNameFromEmail("pieter.vansteenwegen@kuleuven.be")).toBe("Vansteenwegen");
    expect(teacherNameFromEmail("ilse.smets@kuleuven.be")).toBe("Smets");
  });

  it("geeft niets terug wanneer er geen naam in staat", () => {
    // Liever leeg dan "R0123456" in de aanhef van een mail aan een professor.
    expect(teacherNameFromEmail("r0123456@kuleuven.be")).toBeNull();
    expect(teacherNameFromEmail("")).toBeNull();
  });
});

describe("visitEnd", () => {
  it("rekent vijf minuten voor een kort bezoek en een kwartier voor een lang", () => {
    const start = new Date("2026-03-01T10:30:00.000Z");
    expect(visitEnd(start, false).toISOString()).toBe("2026-03-01T10:35:00.000Z");
    expect(visitEnd(start, true).toISOString()).toBe("2026-03-01T10:45:00.000Z");
  });
});

describe("defaultTeacherLocale", () => {
  it("gokt Engels bij een master en Nederlands bij een bachelor", () => {
    expect(defaultTeacherLocale("2e Ma, BME")).toBe("en");
    expect(defaultTeacherLocale("1e Master Werktuigkunde")).toBe("en");
    expect(defaultTeacherLocale("1e Bach, Algemene richting, Groep A")).toBe("nl");
    // "Materiaalkunde" bevat "ma", maar niet als los woord.
    expect(defaultTeacherLocale("3e Bach, Materiaalkunde")).toBe("nl");
  });
});

describe("matchPeculiarities", () => {
  const peculiarities = [
    { id: "1", subject: "Vandewalle", note: "enkel VTK en unif" },
    { id: "2", subject: "Toegepaste Algebra", note: "1 per week maar" },
    { id: "3", subject: "aan", note: "te korte sleutel" },
  ];

  it("matcht een naam op het adres van de docent", () => {
    const hits = matchPeculiarities(peculiarities, {
      teacherEmail: "stefan.vandewalle@kuleuven.be",
      teacherName: null,
      course: "Analyse, deel 1",
      audience: "1e Bach, Algemene richting, Groep A",
    });
    expect(hits.map((hit) => hit.id)).toEqual(["1"]);
  });

  it("matcht een vak hoofdletterongevoelig", () => {
    const hits = matchPeculiarities(peculiarities, {
      teacherEmail: "iemand@kuleuven.be",
      teacherName: "Iemand",
      course: "toegepaste algebra (B-KUL-H01A0A)",
      audience: "1e Bach, Algemene richting, Groep B",
    });
    expect(hits.map((hit) => hit.id)).toEqual(["2"]);
  });

  it("negeert sleutels van minder dan drie tekens", () => {
    // "aan" zou anders op zowat elke Nederlandse vaknaam matchen.
    const hits = matchPeculiarities([peculiarities[2]!], {
      teacherEmail: "jan@kuleuven.be",
      teacherName: "Jan",
      course: "Aanvullingen wiskunde",
      audience: "2e Bach",
    });
    expect(hits).toEqual([]);
  });
});

describe("organisationKey", () => {
  it("beschouwt schrijfvarianten als dezelfde organisatie", () => {
    expect(organisationKey("VTK - Onderwijs")).toBe(organisationKey("VTK Onderwijs"));
    expect(organisationKey("vtk onderwijs")).toBe(organisationKey("VTK  Onderwijs "));
  });

  it("houdt echt verschillende namen uit elkaar", () => {
    expect(organisationKey("Chemix")).not.toBe(organisationKey("Mechanix"));
  });
});

describe("nextOrganisationColour", () => {
  it("geeft een kleur die nog niet in gebruik is", () => {
    const used = [LESBEZOEK_COLOURS[0]!, LESBEZOEK_COLOURS[1]!];
    expect(nextOrganisationColour(used)).toBe(LESBEZOEK_COLOURS[2]);
  });

  it("vergelijkt hoofdletterongevoelig", () => {
    expect(nextOrganisationColour([LESBEZOEK_COLOURS[0]!.toLowerCase()])).toBe(
      LESBEZOEK_COLOURS[1],
    );
  });

  it("begint opnieuw wanneer het palet op is", () => {
    const colour = nextOrganisationColour([...LESBEZOEK_COLOURS]);
    expect(LESBEZOEK_COLOURS).toContain(colour);
  });
});

describe("mailsjablonen", () => {
  const facts = {
    teacherName: "Vansteenwegen",
    organisationName: "Revue",
    requesterName: "Jan Peeters",
    subject: "Revue Rekrutering",
    course: "Bedrijfskunde en Entrepreneurship",
    audience: "3e Bach, Algemene richting",
    teacherNote: "Zie eerdere aanvraag",
    reviewNote: null,
    mailDate: { nl: "maandag 29 september 2025", en: "Monday 29 September 2025" },
    mailTime: "11:30",
  };

  it("vult de placeholders in", () => {
    const vars = mailVarsFor(facts, "nl", "VTK Onderwijs");
    const mail = renderMailTemplate(DEFAULT_LESBEZOEK_TEMPLATES.professorShortNl, vars);
    expect(mail.subject).toBe(
      "Aanvraag kort lesbezoek: Bedrijfskunde en Entrepreneurship op maandag 29 september 2025",
    );
    expect(mail.body).toContain("Geachte professor Vansteenwegen,");
    expect(mail.body).toContain("voor Revue om een korte presentatie te geven");
    expect(mail.body).toContain("om 11:30");
    expect(mail.body.endsWith("VTK Onderwijs")).toBe(true);
    expect(mail.body).not.toContain("{");
  });

  it("valt terug op de organisatie wanneer er geen contactpersoon is", () => {
    const vars = mailVarsFor({ ...facts, requesterName: null }, "nl", "VTK Onderwijs");
    const mail = renderMailTemplate(DEFAULT_LESBEZOEK_TEMPLATES.requesterApproved, vars);
    expect(mail.body).toContain("Beste Revue,");
  });

  it("gebruikt de Engelse datum in een Engels sjabloon", () => {
    const vars = mailVarsFor(facts, "en", "VTK Education");
    const mail = renderMailTemplate(DEFAULT_LESBEZOEK_TEMPLATES.professorLongEn, vars);
    expect(mail.body).toContain("on Monday 29 September 2025 at 11:30");
  });

  it("laat een onbekende placeholder staan in plaats van hem te wissen", () => {
    // Zo ziet wie de mail nakijkt dat er een tikfout in het sjabloon staat;
    // een leeggemaakte plek vertrekt onopgemerkt naar een professor.
    expect(renderTemplate("Beste {profX},", { prof: "Smets" })).toBe("Beste {profX},");
  });

  it("kiest het sjabloon op duur en taal", () => {
    expect(professorTemplateKey(false, "nl")).toBe("professorShortNl");
    expect(professorTemplateKey(true, "en")).toBe("professorLongEn");
  });
});

describe("parseLesbezoekTemplates", () => {
  it("vult ontbrekende sjablonen aan met de standaardtekst", () => {
    const templates = parseLesbezoekTemplates({
      professorShortNl: { subject: "Eigen onderwerp", body: "Eigen tekst" },
    });
    expect(templates.professorShortNl.subject).toBe("Eigen onderwerp");
    expect(templates.professorLongEn).toEqual(DEFAULT_LESBEZOEK_TEMPLATES.professorLongEn);
  });

  it("behandelt een leeg veld als 'terug naar de standaardtekst'", () => {
    const templates = parseLesbezoekTemplates({
      professorShortNl: { subject: "  ", body: "" },
    });
    expect(templates.professorShortNl).toEqual(DEFAULT_LESBEZOEK_TEMPLATES.professorShortNl);
  });

  it("overleeft rommel in de database", () => {
    expect(parseLesbezoekTemplates(null)).toEqual(DEFAULT_LESBEZOEK_TEMPLATES);
    expect(parseLesbezoekTemplates({ professorShortNl: "kapot" })).toEqual(
      DEFAULT_LESBEZOEK_TEMPLATES,
    );
  });
});

describe("buildLesbezoekIcs", () => {
  const base = {
    id: "abc",
    startsAt: new Date("2026-09-29T09:30:00.000Z"),
    endsAt: new Date("2026-09-29T09:35:00.000Z"),
    course: "Bedrijfskunde en Entrepreneurship",
    audience: "3e Bach, Algemene richting",
    subject: "Revue Rekrutering",
    teacherName: "Vansteenwegen",
    teacherEmail: "pieter.vansteenwegen@kuleuven.be",
    updatedAt: new Date("2026-08-19T16:00:00.000Z"),
    organisation: { name: "Revue" },
  };

  it("zet een goedgekeurd bezoek in de kalender", () => {
    const ics = buildLesbezoekIcs([{ ...base, status: "APPROVED" }], NOW);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:lesbezoek-abc@vtk.be");
    expect(ics).toContain("DTSTART:20260929T093000Z");
    expect(ics).toContain("DTEND:20260929T093500Z");
    expect(ics).toContain("SUMMARY:Revue — Bedrijfskunde en Entrepreneurship");
    // De naam van een professor hoort niet als publieke agenda-inhoud te lezen.
    expect(ics).toContain("CLASS:PRIVATE");
  });

  it("laat alles wat nog niet goedgekeurd is buiten de export", () => {
    const ics = buildLesbezoekIcs(
      [
        { ...base, id: "1", status: "PENDING" },
        { ...base, id: "2", status: "ASKED" },
        { ...base, id: "3", status: "DECLINED" },
        { ...base, id: "4", status: "REJECTED" },
        { ...base, id: "5", status: "CANCELLED" },
      ],
      NOW,
    );
    // Een aanvraag die nog bij de professor ligt, staat in een geïmporteerde
    // agenda met een zekerheid die ze niet heeft.
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).toContain("BEGIN:VCALENDAR");
  });
});
