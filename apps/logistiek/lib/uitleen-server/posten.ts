import 'server-only';
import { prisma } from '@vtk/db';
import { currentWorkingYear } from '@vtk/auth';
import { driverPhones } from './chauffeurs';
import { logistiekTeamMembers } from './shared';

/**
 * Alle actieve groepen, voor de aanvragerkeuze door het team bij het bewerken.
 * Werkgroepen zitten er mee in; `type` laat het formulier ze apart zetten in
 * plaats van ze als post aan te bieden.
 */
export async function activeGroups() {
  return prisma.group.findMany({
    where: { active: true },
    select: { id: true, nameNl: true, nameEn: true, type: true },
    orderBy: { orderInPraesidium: 'asc' },
  });
}

/**
 * Het eigen mailadres van een post of werkgroep (`sport@vtk.be`), of `null`.
 *
 * Komt uit de mailinglijsten van de hoofdsite (`MailGroup`), want daar staan die
 * adressen al en ze lopen daar vanzelf mee met de leden van het werkingsjaar.
 * Een tweede kolom "postadres" ernaast zou dezelfde waarheid een tweede keer
 * bewaren, en dan is er één die na een jaar niet meer klopt.
 *
 * **Enkel een lijst die precies deze ene post als bron heeft.** `praesidium@vtk.be`
 * staat er met "elke actieve post" in en `activiteiten@vtk.be` is "Activiteiten
 * plus Groep 5"; zo'n gedeeld adres is niet het adres van déze post, en een rit
 * doorgeven mag niet in de mailbox van het hele praesidium belanden. Ook geen
 * lijst die enkel de verantwoordelijken aanschrijft (`onlyLead`): dat is de
 * andere keuze in deze instelling en niet deze.
 */
export async function groupMailAddress(groupId: string): Promise<string | null> {
  const lists = await prisma.mailGroup.findMany({
    where: { enabled: true, sources: { some: { groupId, onlyLead: false } } },
    select: { email: true, _count: { select: { sources: true } } },
    orderBy: { email: 'asc' },
  });
  return lists.find((list) => list._count.sources === 1)?.email ?? null;
}

/**
 * De verantwoordelijken van een post of werkgroep dit werkingsjaar.
 *
 * Voor de mail die vertrekt zodra Logistiek een autorit aan die post doorgeeft:
 * zij zijn het die er iemand op zetten. Enkel `LEAD`, en enkel dit werkingsjaar,
 * dus de lijst loopt vanzelf mee met de 15-juli-wissel.
 *
 * Staat er niemand als verantwoordelijke, dan komt er een lege lijst terug en
 * vertrekt er geen mail; de actie zegt dat, in plaats van stil niets te doen.
 */
export async function groupLeads(groupId: string) {
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, year: currentWorkingYear(), role: 'LEAD' },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          personalEmail: true,
          emailPreference: true,
          locale: true,
          active: true,
          deletedAt: true,
        },
      },
    },
  });
  return memberships
    .map((membership) => membership.user)
    .filter((user) => user.active && user.deletedAt === null);
}

/**
 * De leden van een post of werkgroep die ook chauffeur zijn, om er een op een
 * doorgegeven rit te zetten.
 *
 * De doorsnede van twee lijsten (F4.9): de leden van dit werkingsjaar, en de
 * chauffeurspool zoals `driverOptions` hem samenstelt (de post Logistiek plus
 * de rijen in `UitleenDriver`). Ze gaf eerst élk lid van de post terug, en dan
 * kan een post iemand zonder rijbewijs op een autorit zetten; wie er mag rijden,
 * is een beslissing van Logistiek en niet van de post die iets te vervoeren
 * heeft.
 *
 * **Een lege lijst is een echt antwoord**, geen fout: een post waarvan niemand
 * in de chauffeurslijst staat, krijgt er geen. Het scherm zegt dat met zoveel
 * woorden en bij wie je dan moet zijn, want een keuzelijst zonder opties ziet
 * eruit als een scherm dat stuk is.
 */
export async function groupMemberOptions(groupId: string) {
  const [memberships, team, extra] = await Promise.all([
    prisma.groupMembership.findMany({
      where: {
        groupId,
        year: currentWorkingYear(),
        user: { active: true, deletedAt: null },
      },
      select: { user: { select: { id: true, name: true } } },
    }),
    logistiekTeamMembers(),
    prisma.uitleenDriver.findMany({
      where: { user: { active: true, deletedAt: null } },
      select: { userId: true },
    }),
  ]);

  const pool = new Set([...team.map((member) => member.id), ...extra.map((row) => row.userId)]);
  return memberships
    .map((membership) => membership.user)
    .filter((user) => pool.has(user.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/** Een lid van de post van een rit, met het nummer waarop het bereikbaar is. */
export type PostMemberContact = { id: string; name: string; phone: string | null };

/**
 * Wie je kan bellen over een rit zonder bijrijder: de leden van haar post.
 *
 * Een rit zonder bijrijder liet de chauffeur en Logistiek enkel de aanvrager
 * over, en wie er de dag zelf meegaat, is vaak iemand anders van dezelfde post.
 * Het bijrijdersblok toont dan deze leden, op dezelfde manier als een bijrijder.
 *
 * Per groep in één keer, want de planning toont ritten van een handvol posten
 * tegelijk. Dit werkingsjaar en enkel actieve accounts, dus de lijst loopt mee
 * met de 15-juli-wissel. Het nummer komt uit `driverPhones` (team, profiel,
 * historiek), dezelfde bron als het nummer van een chauffeur.
 *
 * Volgorde: eerst wie een nummer heeft (het blok toont er maar drie zonder
 * "Meer"), dan de verantwoordelijken en de volgorde die de post zelf koos, zoals
 * op /praesidium, dan de naam.
 *
 * **Enkel voor wie de rit al mag bellen**: het team en de chauffeur. De nummers
 * van een rit blijven bij haar post (zie "Een praesidiumlid mag bij elke rit een
 * bijrijder toevoegen" in docs/design-decisions.md), dus de bezettingskaart van
 * een andere post krijgt dit niet.
 */
export async function postMembersWithPhones(
  groupIds: Array<string | null | undefined>
): Promise<Map<string, PostMemberContact[]>> {
  const ids = [...new Set(groupIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const memberships = await prisma.groupMembership.findMany({
    where: {
      groupId: { in: ids },
      year: currentWorkingYear(),
      user: { active: true, deletedAt: null },
    },
    select: {
      groupId: true,
      role: true,
      displayOrder: true,
      user: { select: { id: true, name: true } },
    },
  });
  const phones = await driverPhones(memberships.map((membership) => membership.user.id));

  const byGroup = new Map<string, Array<PostMemberContact & { lead: boolean; order: number }>>();
  for (const membership of memberships) {
    const list = byGroup.get(membership.groupId) ?? [];
    list.push({
      id: membership.user.id,
      name: membership.user.name,
      phone: phones.get(membership.user.id)?.number ?? null,
      lead: membership.role === 'LEAD',
      order: membership.displayOrder,
    });
    byGroup.set(membership.groupId, list);
  }

  const result = new Map<string, PostMemberContact[]>();
  for (const [groupId, members] of byGroup) {
    members.sort(
      (a, b) =>
        Number(b.phone !== null) - Number(a.phone !== null) ||
        Number(b.lead) - Number(a.lead) ||
        a.order - b.order ||
        a.name.localeCompare(b.name, 'nl')
    );
    result.set(
      groupId,
      members.map(({ id, name, phone }) => ({ id, name, phone }))
    );
  }
  return result;
}
