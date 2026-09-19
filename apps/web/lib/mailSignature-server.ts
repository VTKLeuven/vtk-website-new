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

  if (!user) return { text: "", html: "" };

  const data = resolveSignatureData(
    user,
    user,
    memberships.map(
      (m): SignatureMembership => ({
        groupNameNl: m.group.nameNl,
        groupNameEn: m.group.nameEn,
        titleNl: m.titleNl,
        titleEn: m.titleEn,
        yearCode: formatWorkingYear(m.year),
      }),
    ),
    locale,
    formatWorkingYear(currentWorkingYear()),
  );

  return { text: generateSignaturePlainText(data), html: generateSignatureHtml(data) };
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
