import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENTAL_QUESTIONS,
  RENTAL_LIMITS,
  RENTAL_MAX_LEAD_DAYS,
  RENTAL_STATUS_META,
  blocksRoom,
  guessRenterType,
  isOpenRental,
  overlappingRentals,
  parseDateField,
  parseRentalQuestions,
  parseRentalRequest,
  parseTimeField,
  questionHelp,
  questionLabel,
  type RawRentalInput,
  type RentalStatus,
} from "@/lib/theokotVerhuur";
import {
  DEFAULT_RENTAL_TEMPLATES,
  clampLeadDays,
  defaultTemplateFor,
  parseRentalConfig,
  parseRentalTemplates,
  previewRentalVars,
  renderRentalMail,
  renderRentalTemplate,
  splitEmails,
} from "@/lib/theokotVerhuurMail";
import { fillPlaceholders, remainingPlaceholders } from "@/lib/mailPreview";

/**
 * De zuivere kant van de Theokot-verhuur. Wat hier getest wordt, is precies wat
 * niet in een scherm te zien is: dat een aanvraag over middernacht geen fout is,
 * dat een geweigerde verhuur de zaal weer vrijgeeft, en dat een sjabloon dat
 * iemand uit de opslag wist toch terugkomt.
 */

const NOW = new Date("2026-09-01T10:00:00Z");

function base(overrides: Partial<RawRentalInput> = {}): RawRentalInput {
  return {
    locale: "nl",
    responsibleName: "Jonas Voorbeeld",
    phone: "0470 12 34 56",
    email: "jonas@voorbeeld.be",
    date: "2026-10-03",
    startTime: "20:00",
    endTime: "02:00",
    purpose: "Kaas- en wijnavond",
    attendees: "45",
    deposit: "TRANSFER",
    remarks: "We brengen zelf geluid mee.",
    ...overrides,
  };
}

function parse(overrides: Partial<RawRentalInput> = {}, startsAt = new Date("2026-10-03T18:00:00Z")) {
  return parseRentalRequest(base(overrides), DEFAULT_RENTAL_QUESTIONS, { startsAt, now: NOW });
}

describe("velden lezen", () => {
  it("leest een datum en weigert een dag die niet bestaat", () => {
    expect(parseDateField("2026-02-28")).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseDateField("2026-02-31")).toBeNull();
    expect(parseDateField("3 oktober")).toBeNull();
  });

  it("leest een uur, met of zonder voorloopnul", () => {
    expect(parseTimeField("20:00")).toBe(1200);
    expect(parseTimeField("2:05")).toBe(125);
    expect(parseTimeField("24:00")).toBeNull();
  });
});

describe("een aanvraag controleren", () => {
  it("aanvaardt een gewone aanvraag", () => {
    const result = parse();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.request.depositChoice).toBe("TRANSFER");
    expect(result.request.attendees).toBe(45);
  });

  it("laat een einduur na middernacht gewoon toe", () => {
    // Dit is de regel en niet de uitzondering: een fuif die om 02:00 stopt, is
    // geen tikfout. Enkel exact hetzelfde uur kan niet.
    expect(parse({ endTime: "02:00" }).status).toBe("ok");
    const same = parse({ endTime: "20:00" });
    expect(same).toEqual({ status: "error", code: "TIME_ORDER" });
  });

  it("meldt een honeypot als succes zonder iets terug te geven", () => {
    expect(parse({ honeypot: "http://spam" })).toEqual({ status: "honeypot" });
  });

  it("weigert een datum in het verleden en te ver vooruit", () => {
    expect(parse({}, new Date("2026-08-01T18:00:00Z"))).toEqual({
      status: "error",
      code: "IN_PAST",
    });
    const tooFar = new Date(NOW.getTime() + (RENTAL_MAX_LEAD_DAYS + 5) * 86_400_000);
    expect(parse({}, tooFar)).toEqual({ status: "error", code: "TOO_FAR" });
  });

  it("houdt zich aan de wachttijd uit de instellingen", () => {
    const soon = new Date(NOW.getTime() + 2 * 86_400_000);
    const result = parseRentalRequest(base(), DEFAULT_RENTAL_QUESTIONS, {
      startsAt: soon,
      now: NOW,
      minLeadDays: 7,
    });
    expect(result).toEqual({ status: "error", code: "TOO_SOON" });
  });

  it("weigert een aantal dat geen aantal is", () => {
    expect(parse({ attendees: "veel" })).toEqual({ status: "error", code: "ATTENDEES_INVALID" });
    expect(parse({ attendees: "0" })).toEqual({ status: "error", code: "ATTENDEES_INVALID" });
    expect(parse({ attendees: String(RENTAL_LIMITS.attendees + 1) })).toEqual({
      status: "error",
      code: "ATTENDEES_INVALID",
    });
  });

  it("vraagt naar een e-mailadres dat klopt", () => {
    expect(parse({ email: "" })).toEqual({ status: "error", code: "EMAIL_REQUIRED" });
    expect(parse({ email: "jonas" })).toEqual({ status: "error", code: "EMAIL_INVALID" });
  });

  it("bewaart de antwoorden op eigen vragen en eist de verplichte", () => {
    const questions = {
      ...DEFAULT_RENTAL_QUESTIONS,
      extra: [
        {
          id: "geluid",
          type: "text" as const,
          labelNl: "Eigen geluidsinstallatie",
          labelEn: "Own sound system",
          helpNl: "",
          helpEn: "",
          required: true,
          options: [],
        },
      ],
    };
    const missing = parseRentalRequest(base(), questions, {
      startsAt: new Date("2026-10-03T18:00:00Z"),
      now: NOW,
    });
    expect(missing).toMatchObject({ status: "error", code: "EXTRA_REQUIRED" });

    const filled = parseRentalRequest(base({ extra: { geluid: "Ja, een kleine boxset" } }), questions, {
      startsAt: new Date("2026-10-03T18:00:00Z"),
      now: NOW,
    });
    expect(filled.status).toBe("ok");
    if (filled.status !== "ok") return;
    expect(filled.request.extraAnswers).toEqual({ geluid: "Ja, een kleine boxset" });
  });
});

describe("intern of extern", () => {
  it("herkent een post aan de vierkante haakjes vooraan", () => {
    expect(guessRenterType("[Theokot] Kaas- en wijnavond")).toBe("INTERNAL");
    expect(guessRenterType("  [Cultuur] Filmavond")).toBe("INTERNAL");
    expect(guessRenterType("Kaas- en wijnavond [privé]")).toBe("EXTERNAL");
    expect(guessRenterType("Verjaardagsfeest")).toBe("EXTERNAL");
  });
});

describe("de zaal bezet houden", () => {
  const window = (id: string, from: string, to: string, status: RentalStatus) => ({
    id,
    startsAt: new Date(from),
    endsAt: new Date(to),
    status,
  });

  it("telt enkel wat kan of zal doorgaan", () => {
    expect(blocksRoom("APPROVED")).toBe(true);
    expect(blocksRoom("UNANSWERED")).toBe(true);
    expect(blocksRoom("REJECTED")).toBe(false);
    expect(blocksRoom("CANCELLED")).toBe(false);
  });

  it("vindt de aanvragen die met dit venster overlappen", () => {
    const others = [
      window("a", "2026-10-03T18:00:00Z", "2026-10-04T00:00:00Z", "APPROVED"),
      window("b", "2026-10-04T02:00:00Z", "2026-10-04T06:00:00Z", "APPROVED"),
      window("c", "2026-10-03T19:00:00Z", "2026-10-03T23:00:00Z", "REJECTED"),
    ];
    const found = overlappingRentals(
      { id: "nieuw", startsAt: new Date("2026-10-03T20:00:00Z"), endsAt: new Date("2026-10-04T01:00:00Z") },
      others,
    );
    // "b" begint pas na ons einde, "c" is geweigerd en geeft de zaal weer vrij.
    expect(found.map((row) => row.id)).toEqual(["a"]);
  });

  it("botst niet met zichzelf", () => {
    const self = window("x", "2026-10-03T18:00:00Z", "2026-10-04T00:00:00Z", "APPROVED");
    expect(overlappingRentals(self, [self])).toEqual([]);
  });
});

describe("statussen", () => {
  it("houdt goedgekeurd bij het openstaande werk", () => {
    // Goedgekeurd is niet klaar: er moeten nog een contract, een sleutel en een
    // waarborg achteraan.
    expect(isOpenRental("APPROVED")).toBe(true);
    expect(isOpenRental("UNANSWERED")).toBe(true);
    expect(isOpenRental("COMPLETED")).toBe(false);
    expect(isOpenRental("REJECTED")).toBe(false);
  });

  it("heeft voor elke status een label in beide talen", () => {
    for (const meta of Object.values(RENTAL_STATUS_META)) {
      expect(meta.nl).not.toBe("");
      expect(meta.en).not.toBe("");
    }
  });
});

describe("de vragenlijst", () => {
  it("valt terug op de standaardtekst wanneer er niets bewaard is", () => {
    const parsed = parseRentalQuestions(undefined);
    expect(parsed.core.day.labelNl).toBe(DEFAULT_RENTAL_QUESTIONS.core.day.labelNl);
    expect(parsed.extra).toEqual([]);
  });

  it("houdt een leeggemaakte uitleg leeg", () => {
    // Een lege hulptekst is een keuze; enkel een ontbrekend veld valt terug.
    const parsed = parseRentalQuestions({ core: { day: { helpNl: "" } } });
    expect(parsed.core.day.helpNl).toBe("");
    expect(parsed.core.day.labelNl).toBe(DEFAULT_RENTAL_QUESTIONS.core.day.labelNl);
  });

  it("laat een kernvraag niet optioneel worden wanneer het systeem ze nodig heeft", () => {
    const parsed = parseRentalQuestions({ core: { day: { required: false } } });
    expect(parsed.core.day.required).toBe(true);
    // De opmerkingen mogen wel: daar hangt niets aan.
    const optional = parseRentalQuestions({ core: { remarks: { required: false } } });
    expect(optional.core.remarks.required).toBe(false);
  });

  it("laat een eigen vraag zonder label vallen", () => {
    const parsed = parseRentalQuestions({
      extra: [{ id: "a", labelNl: "Vraag" }, { id: "", labelNl: "Geen id" }, { labelNl: "Geen id" }],
    });
    expect(parsed.extra.map((question) => question.id)).toEqual(["a"]);
  });

  it("gebruikt het Nederlandse label wanneer de vertaling ontbreekt", () => {
    const question = { labelNl: "Dag", labelEn: "", helpNl: "Uitleg", helpEn: "", required: true };
    expect(questionLabel(question, false)).toBe("Dag");
    expect(questionHelp(question, false)).toBe("Uitleg");
  });
});

describe("de sjablonen", () => {
  it("laat een onbekende plaatshouder staan", () => {
    // Zichtbaar blijven is het punt: een tikfout in een sjabloon moet opvallen
    // voor de mail vertrekt, niet erna.
    expect(renderRentalTemplate("Dag {naam}, {onzin}", { naam: "Jonas" })).toBe("Dag Jonas, {onzin}");
  });

  it("plakt het onderwerp tot één regel", () => {
    const rendered = renderRentalMail(
      { subject: "Over  {naam}\n op {datum}", body: "x" },
      { naam: "Jonas", datum: "vrijdag" },
    );
    expect(rendered.subject).toBe("Over Jonas op vrijdag");
  });

  it("brengt een gewist standaardsjabloon terug", () => {
    // De knoppen in het beheer en in de meldingsmail rekenen erop dat er altijd
    // een goedkeurings- en een weigeringstekst is.
    const stored = parseRentalTemplates({ items: [] });
    expect(stored.map((item) => item.id)).toEqual(DEFAULT_RENTAL_TEMPLATES.map((item) => item.id));
  });

  it("bewaart een eigen sjabloon naast de standaarden", () => {
    const stored = parseRentalTemplates({
      items: [{ id: "eigen", name: "Eigen", subject: "Hoi", body: "Tekst", category: "other", lang: "nl" }],
    });
    expect(stored.find((item) => item.id === "eigen")?.isDefault).toBe(false);
    expect(stored.find((item) => item.id === "approvedNl")?.isDefault).toBe(true);
  });

  it("kiest het sjabloon in de taal van de aanvrager", () => {
    expect(defaultTemplateFor(DEFAULT_RENTAL_TEMPLATES, "approved", "en")?.id).toBe("approvedEn");
    expect(defaultTemplateFor(DEFAULT_RENTAL_TEMPLATES, "rejected", "nl")?.id).toBe("rejectedNl");
  });

  it("hangt het huurcontract enkel onder een goedkeuring", () => {
    const approved = DEFAULT_RENTAL_TEMPLATES.filter((item) => item.category === "approved");
    expect(approved.every((item) => item.attachContract)).toBe(true);
    const rejected = DEFAULT_RENTAL_TEMPLATES.filter((item) => item.category === "rejected");
    expect(rejected.every((item) => !item.attachContract)).toBe(true);
  });
});

describe("de instellingen", () => {
  it("leest adressen uit één veld, hoe je ze ook scheidt", () => {
    expect(splitEmails("a@vtk.be, b@vtk.be;c@vtk.be\nd@vtk.be")).toEqual([
      "a@vtk.be",
      "b@vtk.be",
      "c@vtk.be",
      "d@vtk.be",
    ]);
    expect(splitEmails("a@vtk.be, a@vtk.be")).toEqual(["a@vtk.be"]);
  });

  it("houdt de wachttijd binnen de perken", () => {
    expect(clampLeadDays("3")).toBe(3);
    expect(clampLeadDays(-4)).toBe(0);
    expect(clampLeadDays(9999)).toBe(180);
    expect(clampLeadDays("geen getal")).toBe(0);
  });

  it("neemt het eerste meldingsadres als antwoordadres wanneer er geen ingesteld is", () => {
    const config = parseRentalConfig({ notifyEmails: ["verhuur@vtk.be", "theokot@vtk.be"] });
    expect(config.replyTo).toBe("verhuur@vtk.be");
    expect(config.formOpen).toBe(true);
  });
});

describe("het mailvoorbeeld", () => {
  it("noemt de plaatshouders die blijven staan", () => {
    expect(remainingPlaceholders("Dag {naam}, {onzin} en nog eens {onzin}")).toEqual([
      "naam",
      "onzin",
    ]);
    expect(remainingPlaceholders("Niets bijzonders")).toEqual([]);
  });

  it("vult in wat het kent en laat de rest staan", () => {
    expect(fillPlaceholders("Dag {naam}, {onzin}", { naam: "Jonas" })).toBe("Dag Jonas, {onzin}");
  });

  it("vult elke plaatshouder van een standaardsjabloon in", () => {
    const vars = previewRentalVars("nl", "Theokot");
    for (const template of DEFAULT_RENTAL_TEMPLATES) {
      const rendered = renderRentalMail(template, vars);
      expect(remainingPlaceholders(`${rendered.subject}\n${rendered.body}`)).toEqual([]);
    }
  });
});
