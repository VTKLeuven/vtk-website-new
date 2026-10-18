import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import type { MailCategory } from "@prisma/client";
import { prisma } from "@vtk/db";
import { syncUserToBrevo } from "@/lib/brevo/sync";
import { MAIL_CATEGORIES } from "@/lib/profile";
import { siteUrl } from "@/lib/seo";

/**
 * Uitschrijven voor één mailinglijst vanuit een mail, zonder in te loggen.
 *
 * De link draagt het lid en de lijst, ondertekend met het sitegeheim: wie hem
 * heeft, kan precies dat ene ding doen (die ene lijst uitzetten voor dat ene
 * lid) en niets anders. Bewust zonder vervaldatum: een uitschrijflink in een
 * mail van vorig jaar hoort nog altijd te werken.
 *
 * De pagina vraagt eerst een klik (`/uitschrijven?t=...`): mailscanners van de
 * universiteit openen elke link in een mail, en een link die bij openen al
 * uitschrijft, schrijft iedereen uit. De knop bovenaan in Gmail en Outlook post
 * rechtstreeks (`/api/mail/uitschrijven`, RFC 8058); een scanner post niet.
 */

const PREFIX = "vtkmu1";

function secret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) throw new Error("BETTER_AUTH_SECRET ontbreekt");
    return configured;
  }
  return configured || "vtk-local-unsubscribe-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createUnsubscribeToken(userId: string, category: MailCategory): string {
  const payload = `${PREFIX}.${userId}.${category}`;
  return `${payload}.${sign(payload)}`;
}

/** Het lid en de lijst achter een token, of `null` bij elke twijfel. */
export function verifyUnsubscribeToken(token: string): { userId: string; category: MailCategory } | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, userId, category, signature] = parts as [string, string, string, string];
  if (!(MAIL_CATEGORIES as readonly string[]).includes(category)) return null;
  const expected = Buffer.from(sign(`${PREFIX}.${userId}.${category}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { userId, category: category as MailCategory };
}

/** De pagina met de knop, in de taal van het lid. */
export function unsubscribeUrl(userId: string, category: MailCategory, locale: "nl" | "en"): string {
  const token = createUnsubscribeToken(userId, category);
  return `${siteUrl()}${locale === "en" ? "/en" : ""}/uitschrijven?t=${encodeURIComponent(token)}`;
}

/** Het adres voor de knop van de mailclient zelf (één POST, geen pagina). */
export function oneClickUnsubscribeUrl(userId: string, category: MailCategory): string {
  return `${siteUrl()}/api/mail/uitschrijven?t=${encodeURIComponent(createUnsubscribeToken(userId, category))}`;
}

/**
 * Zet de lijst uit in het profiel, precies zoals het vinkje op /account dat
 * doet, en duwt het meteen naar Brevo (na het antwoord, want Brevo mag het
 * uitschrijven niet ophouden). Dubbel uitschrijven is geen fout.
 */
export async function unsubscribeFromCategory(userId: string, category: MailCategory): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mailCategories: true } });
  if (!user) return false;
  if (user.mailCategories.includes(category)) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        mailCategories: user.mailCategories.filter((value) => value !== category),
        // Zelfde regel als op /account: Career uit betekent ook geen herkomst
        // meer, anders telt /admin/mailinglijsten iemand die er niet meer op staat.
        ...(category === "CAREER" ? { careerOptInAt: null, careerOptInSource: null } : {}),
      },
    });
    after(() => syncUserToBrevo(userId));
  }
  return true;
}
