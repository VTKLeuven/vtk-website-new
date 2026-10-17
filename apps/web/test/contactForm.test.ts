import { describe, expect, it } from "vitest";
import {
  CONTACT_LIMITS,
  CONTACT_RATE_LIMIT,
  RateLimiter,
  clientKeyFromHeaders,
  contactMailBody,
  isValidEmail,
  parseContactSubmission,
  toMessageText,
  toSingleLine,
  withinWindow,
} from "@/lib/contactForm";

/** Een geldige invulling; elke test verandert er één ding aan. */
function submission(overrides: Record<string, unknown> = {}) {
  return {
    name: "Jef Vermeulen",
    email: "jef@student.kuleuven.be",
    subject: "Vraag over de cantus",
    message: "Zijn er nog kaarten voor de openingscantus?",
    ...overrides,
  };
}

function headersOf(entries: Record<string, string>) {
  return { get: (name: string) => entries[name.toLowerCase()] ?? null };
}

describe("invoer opschonen", () => {
  it("maakt van naam en onderwerp één regel", () => {
    expect(toSingleLine("  Jef   Vermeulen \n")).toBe("Jef Vermeulen");
  });

  it("haalt regeleindes uit een veld dat in de mailkop terechtkomt", () => {
    // Header-injectie: zonder dit staat er een tweede Bcc-regel in de mail.
    expect(toSingleLine("Vraag\r\nBcc: spam@voorbeeld.be")).toBe("Vraag Bcc: spam@voorbeeld.be");
  });

  it("negeert invoer die geen tekst is", () => {
    expect(toSingleLine(undefined)).toBe("");
    expect(toSingleLine(null)).toBe("");
    expect(toSingleLine(42)).toBe("");
  });

  it("houdt de alinea's van het bericht heel maar gooit controltekens weg", () => {
    expect(toMessageText("Eerste regel\r\n\r\nTweede regel\u0000")).toBe(
      "Eerste regel\n\nTweede regel",
    );
  });
});

describe("e-mailadressen", () => {
  it("aanvaardt gewone adressen", () => {
    expect(isValidEmail("jef@student.kuleuven.be")).toBe(true);
    expect(isValidEmail("jef.vermeulen+vtk@vtk.be")).toBe(true);
  });

  it("weigert wat geen adres is", () => {
    for (const value of ["jef", "jef@", "@vtk.be", "jef@vtk", "jef vermeulen@vtk.be", "a@b..c"]) {
      expect(isValidEmail(value), value).toBe(false);
    }
  });
});

describe("validatie van het formulier", () => {
  it("laat een volledig ingevuld formulier door en levert opgeschoonde velden", () => {
    const result = parseContactSubmission(submission({ name: "  Jef  Vermeulen " }));
    expect(result).toEqual({
      status: "ok",
      message: {
        name: "Jef Vermeulen",
        email: "jef@student.kuleuven.be",
        subject: "Vraag over de cantus",
        message: "Zijn er nog kaarten voor de openingscantus?",
      },
    });
  });

  it("vraagt elk verplicht veld apart, met een eigen code", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: "   " }, "NAME_REQUIRED"],
      [{ email: "" }, "EMAIL_REQUIRED"],
      [{ subject: "\n" }, "SUBJECT_REQUIRED"],
      [{ message: "  " }, "MESSAGE_REQUIRED"],
    ];
    for (const [override, code] of cases) {
      expect(parseContactSubmission(submission(override)), code).toEqual({
        status: "error",
        code,
      });
    }
  });

  it("weigert een adres dat geen adres is", () => {
    expect(parseContactSubmission(submission({ email: "jef apenstaartje vtk.be" }))).toEqual({
      status: "error",
      code: "EMAIL_INVALID",
    });
  });

  it("weigert een bericht boven de maximale lengte, maar laat de grens zelf door", () => {
    const exact = "a".repeat(CONTACT_LIMITS.message);
    expect(parseContactSubmission(submission({ message: exact })).status).toBe("ok");

    expect(parseContactSubmission(submission({ message: `${exact}a` }))).toEqual({
      status: "error",
      code: "MESSAGE_TOO_LONG",
    });
  });

  it("weigert een te lange naam en een te lang onderwerp", () => {
    expect(parseContactSubmission(submission({ name: "a".repeat(CONTACT_LIMITS.name + 1) }))).toEqual(
      { status: "error", code: "NAME_TOO_LONG" },
    );
    expect(
      parseContactSubmission(submission({ subject: "a".repeat(CONTACT_LIMITS.subject + 1) })),
    ).toEqual({ status: "error", code: "SUBJECT_TOO_LONG" });
  });

  it("telt de lengte na het opschonen, niet ervoor", () => {
    // Duizend spaties zijn geen bericht van duizend tekens.
    const padded = ` ${"a".repeat(CONTACT_LIMITS.message)} `;
    expect(parseContactSubmission(submission({ message: padded })).status).toBe("ok");
  });
});

describe("de honeypot", () => {
  it("meldt succes zonder bericht wanneer het verborgen veld ingevuld is", () => {
    expect(parseContactSubmission(submission({ honeypot: "https://spam.example" }))).toEqual({
      status: "honeypot",
    });
  });

  it("wint van elke andere fout, zodat een bot niets leert", () => {
    // Alles leeg behalve de honeypot: een foutmelding zou verraden dat we kijken.
    const result = parseContactSubmission({ honeypot: "x" });
    expect(result).toEqual({ status: "honeypot" });
  });

  it("laat een leeg honeypot-veld gewoon door", () => {
    expect(parseContactSubmission(submission({ honeypot: "   " })).status).toBe("ok");
  });
});

describe("het venster van de snelheidslimiet", () => {
  it("houdt enkel de pogingen binnen het venster over", () => {
    expect(withinWindow([100, 500, 900], 1000, 600)).toEqual([500, 900]);
  });

  it("laat er `max` door en weigert de volgende", () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.take("1.2.3.4", 0)).toBe(true);
    expect(limiter.take("1.2.3.4", 10)).toBe(true);
    expect(limiter.take("1.2.3.4", 20)).toBe(true);
    expect(limiter.take("1.2.3.4", 30)).toBe(false);
  });

  it("schuift mee: zodra de oudste poging uit het venster valt, mag er weer een", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.take("1.2.3.4", 0)).toBe(true);
    expect(limiter.take("1.2.3.4", 500)).toBe(true);
    expect(limiter.take("1.2.3.4", 900)).toBe(false);
    // Op t=1001 is de poging van t=0 verlopen, die van t=500 nog niet.
    expect(limiter.take("1.2.3.4", 1001)).toBe(true);
    expect(limiter.take("1.2.3.4", 1002)).toBe(false);
  });

  it("telt niet bij wanneer het venster vol zit", () => {
    // Anders verlengt een bot zijn eigen straf door te blijven kloppen en komt
    // een echte bezoeker op hetzelfde IP er nooit meer door.
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.take("1.2.3.4", 0)).toBe(true);
    for (let t = 100; t < 1000; t += 100) limiter.take("1.2.3.4", t);
    expect(limiter.take("1.2.3.4", 1001)).toBe(true);
  });

  it("telt per sleutel, dus per IP", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.take("1.2.3.4", 0)).toBe(true);
    expect(limiter.take("5.6.7.8", 0)).toBe(true);
    expect(limiter.take("1.2.3.4", 1)).toBe(false);
  });

  it("vergeet sleutels waarvan het venster helemaal verlopen is", () => {
    const limiter = new RateLimiter(3, 1000);
    limiter.take("1.2.3.4", 0);
    limiter.take("5.6.7.8", 0);
    expect(limiter.size).toBe(2);
    limiter.sweep(2000);
    expect(limiter.size).toBe(0);
  });

  it("staat op drie berichten per kwartier", () => {
    expect(CONTACT_RATE_LIMIT).toEqual({ max: 3, windowMs: 15 * 60 * 1000 });
  });
});

describe("de sleutel waarop geteld wordt", () => {
  it("neemt x-real-ip wanneer de proxy die zet", () => {
    expect(
      clientKeyFromHeaders(
        headersOf({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "vervalst, 10.0.0.2" }),
      ),
    ).toBe("203.0.113.8");
  });

  it("neemt anders de laatste waarde van x-forwarded-for, want die zette onze proxy", () => {
    expect(clientKeyFromHeaders(headersOf({ "x-forwarded-for": "vervalst, 10.0.0.2" }))).toBe(
      "10.0.0.2",
    );
  });

  it("valt terug op één gedeelde sleutel zonder headers", () => {
    expect(clientKeyFromHeaders(headersOf({}))).toBe("unknown");
  });
});

describe("de mail naar info@vtk.be", () => {
  it("zet een herkenbaar voorvoegsel voor het onderwerp", () => {
    const { subject } = contactMailBody({
      name: "Jef",
      email: "jef@vtk.be",
      subject: "Vraag",
      message: "Hallo",
    });
    expect(subject).toBe("[Website] Vraag");
  });

  it("herhaalt naam en adres in de tekst, zodat doorsturen het antwoordadres niet verliest", () => {
    const { text } = contactMailBody({
      name: "Jef Vermeulen",
      email: "jef@vtk.be",
      subject: "Vraag",
      message: "Hallo",
    });
    expect(text).toContain("Van: Jef Vermeulen <jef@vtk.be>");
    expect(text).toContain("Hallo");
  });

  it("zet de naam vet in de opgemaakte mail, en niet als letterlijke <strong>", () => {
    const { html } = contactMailBody({
      name: "Jef & <Co>",
      email: "jef@vtk.be",
      subject: "Vraag",
      message: "Hallo",
    });
    expect(html).toContain("van <strong>Jef &amp; &lt;Co&gt;</strong>:");
    expect(html).not.toContain("&lt;strong&gt;");
  });
});
