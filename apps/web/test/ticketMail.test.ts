import { afterEach, describe, expect, it, vi } from "vitest";
import { smtpEhloName } from "@/lib/mail";
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
