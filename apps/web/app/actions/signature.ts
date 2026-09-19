"use server";

import { prisma } from "@vtk/db";
import { requireSession } from "@/lib/session";
import { toSingleLine } from "@/lib/contactForm";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/**
 * De handtekening van een lid opslaan op zijn profiel.
 *
 * Ze stond in `localStorage`, dus ze was weg op een andere browser en de server
 * kon ze niet lezen. Dat laatste is wat telt: de mails van de lesbezoeken en de
 * Theokot-verhuur worden ondertekend door wie ze verstuurt, en dat is dezelfde
 * handtekening als deze. Zie `lib/signatureProfile.ts`.
 *
 * Elk veld mag leeg blijven: leeg betekent "leid maar af" (naam van het lid,
 * `buildDefaultVtkEmail`, de post van dit werkingsjaar) en niet "leeg in de
 * mail". Het nummer is de enige die nergens anders staat; leeg is daar echt geen
 * nummer, en dan valt die regel weg.
 */
export async function saveSignatureProfileAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();

  const name = toSingleLine(formData.get("signatureName"));
  const roleTitle = toSingleLine(formData.get("signatureRoleTitle"));
  const email = toSingleLine(formData.get("signatureEmail")).toLowerCase();
  const phone = toSingleLine(formData.get("signaturePhone"));

  // Een adres dat geen adres is, hoort niet onder elke mail van de kring te
  // belanden. De rest is vrije tekst: een functietitel heeft geen vorm.
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return saveError("INVALID_EMAIL");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      signatureName: name || null,
      signatureRoleTitle: roleTitle || null,
      signatureEmail: email || null,
      signaturePhone: phone || null,
    },
  });

  return saveOk();
}
