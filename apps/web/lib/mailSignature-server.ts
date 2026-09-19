import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { generateSignatureHtml, generateSignaturePlainText } from "@/lib/signature";
import {
  resolveSignatureData,
  type MailSignature,
  type SignatureMembership,
} from "@/lib/signatureProfile";

export type { MailSignature } from "@/lib/signatureProfile";

/**
 * De ondertekening onder een uitgaande beheersmail.
 *
 * Een mail van de lesbezoeken of de Theokot-verhuur wordt ondertekend door wie
 * ze verstuurt, met dezelfde handtekening als die op /account. Dat is waarom dit
 * geen instelling per werking meer is: de vorige opzet zette een vaste tekst
 * onder elke mail, en die liep elk jaar opnieuw uiteen met wie het werk deed.
 *
 * Geeft beide vormen terug: het bewerkveld en de platte mail werken met `text`,
 * de mailbox toont `html`.
 */
export async function signatureForUser(
  userId: string,
  locale: "nl" | "en" = "nl",
): Promise<MailSignature> {
  return (await signaturesForUser(userId))[locale];
}

/**
 * De ondertekening die bij deze mailtekst hoort.
 *
 * De sjablonen bestaan in twee talen en de functie verschilt mee ("VTK
 * Onderwijs 26-27" tegenover "VTK Education 26-27"). De tekst van de mail is al
 * opgesteld voor ze hier komt, dus we zoeken welke van de twee er effectief in
 * staat. Vroeg dit altijd het Nederlands op, dan vond een Engelse mail haar
 * eigen ondertekening niet terug en vertrok ze zonder de opgemaakte versie.
 *
 * Geen match (iemand heeft de ondertekening weggehaald of herschreven): dan
 * geeft dit het Nederlands terug en zorgt `mailBodyToHtml` ervoor dat er niets
 * bijgeplakt wordt.
 */
export async function signatureForBody(
  userId: string,
  body: string,
): Promise<MailSignature> {
  return pickSignature(await signaturesForUser(userId), body);
}

/**
 * Welke van de twee talen in deze tekst staat.
 *
 * Apart van {@link signatureForBody} zodat een reeks mails de bevraging kan
 * delen: de bulkronde verstuurt er tientallen na elkaar, elk met hun eigen taal.
 */
export function pickSignature(
  both: Record<"nl" | "en", MailSignature>,
  body: string,
): MailSignature {
  const en = both.en.text.trim();
  if (en && body.includes(en)) return both.en;
  return both.nl;
}

/** Beide talen in een keer, uit een enkele bevraging. */
export async function signaturesForUser(
  userId: string,
): Promise<Record<"nl" | "en", MailSignature>> {
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        signatureName: true,
        signatureRoleTitle: true,
        signatureEmail: true,
        signaturePhone: true,
      },
    }),
    prisma.groupMembership.findMany({
      where: { userId },
      include: { group: { select: { nameNl: true, nameEn: true } } },
      orderBy: [{ year: "desc" }, { group: { orderInPraesidium: "asc" } }],
    }),
  ]);

  const leeg = { text: "", html: "" };
  if (!user) return { nl: leeg, en: leeg };

  const rows = memberships.map(
    (m): SignatureMembership => ({
      groupNameNl: m.group.nameNl,
      groupNameEn: m.group.nameEn,
      titleNl: m.titleNl,
      titleEn: m.titleEn,
      yearCode: formatWorkingYear(m.year),
    }),
  );
  const year = formatWorkingYear(currentWorkingYear());

  const render = (locale: "nl" | "en"): MailSignature => {
    const data = resolveSignatureData(user, user, rows, locale, year);
    return { text: generateSignaturePlainText(data), html: generateSignatureHtml(data) };
  };

  return { nl: render("nl"), en: render("en") };
}

/**
 * De ondertekening voor een mail die niemand verstuurt.
 *
 * De ontvangstbevestiging van een verhuuraanvraag vertrekt vanuit het publieke
 * formulier: er is dan geen lid dat ze tekent. Die mail ondertekent met de post
 * zelf, en niet met een willekeurig lid of met niets. Het adres is dat van de
 * post, want daar komt het antwoord ook toe.
 */
export function signatureForPost(postName: string, postEmail: string): MailSignature {
  const data = {
    fullName: postName,
    roleTitle: `VTK ${formatWorkingYear(currentWorkingYear())}`,
    emailAddress: postEmail,
    phoneDisplay: "",
  };
  return { text: generateSignaturePlainText(data), html: generateSignatureHtml(data) };
}
