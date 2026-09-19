import { afterEach, describe, expect, it, vi } from "vitest";
import { smtpEhloName } from "@vtk/mail";
import { attachmentLine, orderConfirmationMail } from "@/lib/ticketing/mail";
import {
  MAX_ATTACHMENT_BYTES,
  safeFilename,
  walletLinkLabel,
  withinBudget,
} from "@/lib/ticketing/mailBundle";

const base = {
  locale: "nl" as const,
  buyerName: "Jonas",
  buyerEmail: "jonas@example.test",
  eventName: "Galabal",
  orderNumber: "VTK-0001",
  ticketCount: 2,
  orderUrl: "https://vtk.be/tickets/toegang?orderId=abc#access=xyz",
};

describe("wat de mail over zijn bijlagen zegt", () => {
  it("zwijgt erover wanneer er niets bij zit", () => {
    // Anders staat er "in bijlage" boven een mail zonder bijlage, en gaat de
    // koper zoeken naar iets dat er niet is.
    expect(attachmentLine({ pdf: false, applePasses: 0, googleLinks: [] }, true)).toBe("");
    const mail = orderConfirmationMail(base);
    expect(mail.html).not.toContain("bijlage");
    expect(mail.text).not.toContain("bijlage");
    expect(mail.attachments).toBeUndefined();
  });

  it("noemt de pdf alleen wanneer de wallet-pas ontbrak", () => {
    // De wallet-provider kan onbereikbaar zijn; de mail vertrekt dan toch, maar
    // belooft geen pas.
    const line = attachmentLine({ pdf: true, applePasses: 0, googleLinks: [] }, true);
    expect(line).toContain("pdf");
    expect(line).not.toContain("Wallet");
  });

  it("noemt allebei in het enkelvoud bij één ticket", () => {
    const line = attachmentLine({ pdf: true, applePasses: 1, googleLinks: [] }, true);
    expect(line).toBe(
      "Je ticket zit in bijlage: als pdf om te tonen of af te drukken, en als pas voor je Apple Wallet."
    );
  });

  it("schrijft in het Engels voor een Engelstalige bestelling", () => {
    const line = attachmentLine({ pdf: true, applePasses: 3, googleLinks: [] }, false);
    expect(line).toContain("one pass per ticket for Apple Wallet");
  });

  it("zet de Google Wallet-links als knop in de html, niet in de tekstversie", () => {
    // Een save-link van Google is een jwt van kilobytes; in platte tekst is dat
    // een onleesbaar blok dat clients afkappen, waarna de link stuk is. Wie
    // enkel tekst leest, wordt naar de ticketpagina gestuurd.
    const mail = orderConfirmationMail({
      ...base,
      contents: {
        pdf: true,
        applePasses: 2,
        googleLinks: [
          { label: "Google Wallet: Jonas", url: "https://pay.google.com/gp/v/save/a" },
          { label: "Google Wallet: Mira", url: "https://pay.google.com/gp/v/save/b" },
        ],
      },
    });
    expect(mail.html).toContain("https://pay.google.com/gp/v/save/a");
    expect(mail.html).toContain("Google Wallet: Mira");
    expect(mail.text).not.toContain("pay.google.com");
    expect(mail.text).toContain("Toevoegen aan Google Wallet kan op je ticketpagina");
  });

  it("houdt de link naar de ticketpagina en de waarschuwing overeind", () => {
    // De bijlage is een momentopname; de link blijft de plek waar de laatste
    // stand van zaken staat, dus die mag niet weggedrukt worden.
    const mail = orderConfirmationMail({
      ...base,
      contents: { pdf: true, applePasses: 2, googleLinks: [] },
    });
    expect(mail.html).toContain(base.orderUrl.replace(/&/g, "&amp;"));
    expect(mail.text).toContain("Deel deze link niet");
  });
});

describe("hoe de bevestigingsmail eruitziet", () => {
  const event = {
    startsAt: new Date("2026-10-02T18:00:00.000Z"),
    timeZone: "Europe/Brussels",
    location: "Theokot",
    posterUrl: "https://vtk.be/api/media/events/abc.jpg",
    ownerName: "Activiteiten",
  };
  const summary = {
    lines: [
      { name: "Ticket lid", quantity: 2, unitPriceCents: 1200, totalCents: 2400 },
      { name: "Ticket niet-lid", quantity: 1, unitPriceCents: 1800, totalCents: 1800 },
    ],
    totalCents: 4200,
    currency: "EUR",
    paidAt: new Date("2026-09-19T09:00:00.000Z"),
  };

  it("zet de poster bovenaan en de datum in de gele pin", () => {
    const mail = orderConfirmationMail({ ...base, event });
    expect(mail.html).toContain(event.posterUrl);
    // De pin: weekdag, dagnummer en maand, in het tijdzone-uur van het event
    // (20:00 in Brussel, niet 18:00 UTC).
    expect(mail.html).toContain("#ffd23f");
    expect(mail.html).toContain(">2<");
    expect(mail.html).toContain("vrijdag 2 oktober 2026, 20:00");
    expect(mail.text).toContain("vrijdag 2 oktober 2026, 20:00");
    expect(mail.text).toContain("Theokot");
  });

  it("blijft een volwaardige mail zonder poster, locatie of bestellijnen", () => {
    // Een ticketevent zonder gekoppeld kalender-event heeft geen foto, en dan
    // hoort er geen gebroken afbeelding in de mail te staan.
    const mail = orderConfirmationMail({
      ...base,
      event: { startsAt: event.startsAt, timeZone: event.timeZone },
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("Galabal");
    expect(mail.html).toContain(base.orderUrl.replace(/&/g, "&amp;"));
    expect(mail.text).not.toContain("null");
  });

  it("toont de bestellijnen met het totaal, en de stukprijs enkel bij meerdere", () => {
    const mail = orderConfirmationMail({ ...base, event, summary });
    expect(mail.html).toContain("Ticket lid");
    expect(mail.html).toContain("2x");
    expect(mail.html).toContain("per stuk");
    expect(mail.html).toContain("Betaald op 19 september");
    expect(mail.html).toMatch(/42,00/);
    // Eén ticket niet-lid: die regel herhaalt haar eigen bedrag niet als stukprijs.
    expect(mail.html.split("per stuk").length - 1).toBe(1);
    expect(mail.text).toContain("2x Ticket lid");
    expect(mail.text).toContain("Totaal betaald");
  });

  it("zegt het wanneer er al terugbetaald is", () => {
    // De outbox levert ook bij PARTIALLY_REFUNDED af; dan klopt "betaald"
    // alleen nog met de terugbetaling erbij.
    const mail = orderConfirmationMail({
      ...base,
      event,
      summary: { ...summary, refundedCents: 1800 },
    });
    expect(mail.html).toContain("Terugbetaald");
    expect(mail.html).toMatch(/18,00/);
  });

  it("schrijft de Engelse mail in het Engels", () => {
    const mail = orderConfirmationMail({ ...base, locale: "en", event, summary });
    expect(mail.html).toContain("Friday, 2 October 2026 at 20:00");
    expect(mail.html).toContain("each");
    expect(mail.html).toContain("Paid on 19 September");
    expect(mail.html).not.toContain("per stuk");
  });
});

describe("hoe we ons voorstellen bij de mailserver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gebruikt een echte hostnaam, nooit wat nodemailer zelf verzint", () => {
    // Zonder expliciete naam stuurt nodemailer in een container `EHLO
    // [127.0.0.1]`, en dan verbreekt de relay van Google de verbinding met een
    // 421 die eruitziet als een tijdelijke storing. Er vertrekt dan geen enkele
    // mail, terwijl dezelfde container met `EHLO vtk.be` gewoon 250 krijgt.
    expect(smtpEhloName()).toBe("vtk.be");
    expect(smtpEhloName()).not.toContain("127.0.0.1");
  });

  it("laat een andere mailserver een eigen naam opleggen", () => {
    vi.stubEnv("SMTP_EHLO_NAME", "mail.vtk.be");
    expect(smtpEhloName()).toBe("mail.vtk.be");
  });

  it("valt terug op de standaard bij een lege instelling", () => {
    vi.stubEnv("SMTP_EHLO_NAME", "   ");
    expect(smtpEhloName()).toBe("vtk.be");
  });
});

describe("de bijlagen zelf", () => {
  it("houdt vreemde tekens uit een bestandsnaam", () => {
    expect(safeFilename("gala/bal 2026?.pdf")).toBe("gala-bal-2026-.pdf");
  });

  it("noemt de naam enkel bij meerdere tickets", () => {
    expect(walletLinkLabel("Jonas", 1)).toBe("Google Wallet");
    expect(walletLinkLabel("Jonas", 3)).toBe("Google Wallet: Jonas");
  });

  it("stopt met bijlagen zodra de mail te zwaar wordt", () => {
    // Een mailserver weigert de hele boodschap wanneer ze te groot is; dan zou
    // een bestelling van acht tickets met een zware achtergrondfoto helemaal
    // geen bevestiging opleveren.
    const heavy = [
      {
        filename: "tickets.pdf",
        content: Buffer.alloc(MAX_ATTACHMENT_BYTES - 100),
        contentType: "application/pdf",
      },
    ];
    expect(withinBudget(heavy, 100)).toBe(true);
    expect(withinBudget(heavy, 101)).toBe(false);
    expect(withinBudget([], MAX_ATTACHMENT_BYTES)).toBe(true);
  });
});
