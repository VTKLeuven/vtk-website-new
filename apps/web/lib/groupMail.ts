import "server-only";

import { prisma } from "@vtk/db";

/**
 * Het mailadres van een post of werkgroep.
 *
 * Elke post heeft er een, en de kring houdt zich aan één regel: de naam van de
 * post op `@vtk.be`, dus `onthaal@vtk.be` voor Onthaal. Dat maakt een adres
 * afleidbaar uit de code van de groep, en dat is precies waarom deze module
 * bestaat: een automatische mail naar "de post" hoeft niet te wachten tot
 * iemand ergens een adres invult.
 *
 * Staat het adres wél in de site (Admin -> Website -> Mailinglijsten, tabel
 * `MailGroup` met de post als bron), dan gaat dat voor op de afleiding. Daar
 * staat wat er echt in Google Workspace bestaat, inclusief de gevallen waarin
 * de naam van de post niet het adres is; zie docs/google-workspace.md.
 */

/** Het domein van de kring. Enkel hier, zodat een test er niet op moet mikken. */
const DOMAIN = "vtk.be";

/**
 * Het adres zoals het uit de code van de groep volgt: kleine letters, en alles
 * wat geen letter of cijfer is eruit. `GROEP5` wordt `groep5@vtk.be`, want dat
 * is hoe de kring haar adressen schrijft; `groep-5` (de slug) bestaat niet als
 * adres.
 */
export function derivedGroupMailAddress(code: string): string | null {
  const local = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  return local ? `${local}@${DOMAIN}` : null;
}

/**
 * Het adres van deze groep: het ingestelde lijstadres wanneer er een is, anders
 * de afleiding hierboven. `null` wanneer de code niets bruikbaars oplevert; de
 * beller moet dat afhandelen in plaats van naar `@vtk.be` te mailen.
 *
 * Enkel een lijst met deze post als enige bron telt: `praesidium@vtk.be` heeft
 * elke post als bron en is dus niet het adres van één post, en een lijst met
 * `onlyLead` bereikt enkel de verantwoordelijke.
 */
export async function groupMailAddress(group: { id: string; code: string }): Promise<string | null> {
  const lists = await prisma.mailGroup.findMany({
    where: { enabled: true, sources: { some: { groupId: group.id, onlyLead: false } } },
    select: { email: true, sources: { select: { groupId: true, onlyLead: true } } },
    orderBy: { createdAt: "asc" },
  });
  // De bronnen in JS filteren en niet in de query: een lijst als
  // `praesidium@vtk.be` heeft "elke actieve post" als bron (`groupType`, met een
  // lege `groupId`), en een `NOT ... not null` laat zo'n rij in SQL gewoon door.
  const own = lists.find((list) =>
    list.sources.every((source) => source.groupId === group.id && !source.onlyLead),
  );
  return own?.email ?? derivedGroupMailAddress(group.code);
}
