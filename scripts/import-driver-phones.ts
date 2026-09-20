/**
 * De gsm-nummers van de chauffeurs uit de gedeelde contactenlijst (F4.3).
 *
 * Het praesidium houdt de nummers bij als contactenexport (`.vcf`). Dit script
 * legt die naast de chauffeurspool en vult `UitleenDriver.phone` in, de bron
 * `TEAM`, die binnen `driverPhones` al wint van het profielnummer en van wat
 * iemand ooit bij een aanvraag opgaf.
 *
 * **Standaard schrijft dit niets.** Zonder `--apply` is het een verslag: wie zou
 * welk nummer krijgen, wie staat er dubbel in, welk nummer is niet te lezen, en
 * welke contacten vinden we niet terug. Dat is met opzet, want een naamkoppeling
 * is pas te vertrouwen nadat iemand ze gezien heeft, en de lijst bevat fouten
 * (in de export van september 2026 staat er één nummer als `0032` plus de
 * nationale nul).
 *
 * **Een bestaand nummer blijft staan**, tenzij je `--overwrite` meegeeft: wat
 * het team zelf in het chauffeursbeheer invulde, is een bevestigd nummer en een
 * import hoort daar niet overheen te gaan.
 *
 * Het rekenwerk zit in `apps/logistiek/lib/vcard.ts` en is daar getest; dit
 * bestand doet enkel de databank en het verslag.
 *
 *     npm run import:gsm -- ~/Downloads/lijst.vcf
 *     npm run import:gsm -- ~/Downloads/lijst.vcf --apply
 *
 * Het bestand zelf hoort niet in de repo: het zijn namen met gsm-nummers.
 */
import { readFileSync } from 'node:fs';

import { prisma } from '@vtk/db';
import { currentWorkingYear } from '@vtk/auth';

import { matchContacts, parseVcards } from '../apps/logistiek/lib/vcard';

const PHONE_PROBLEMS: Record<string, string> = {
  leeg: 'geen nummer in het contact',
  'geen-belgisch-nummer': 'geen Belgisch nummer',
  'dubbele-nul': '0032 met de nationale nul erachter',
};

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  const apply = args.includes('--apply');
  const overwrite = args.includes('--overwrite');

  if (!file) {
    console.error('Geef het pad naar de .vcf mee. Zonder --apply schrijft dit niets weg.');
    process.exit(1);
  }

  const contacts = parseVcards(readFileSync(file, 'utf8'));
  if (contacts.length === 0) {
    console.error('Geen contacten met een naam en een nummer in dat bestand.');
    process.exit(1);
  }

  // De chauffeurspool, net zoals `driverOptions` hem samenstelt: de leden van de
  // post Logistiek van dit werkingsjaar, plus iedereen met een eigen rij. Een
  // postlid heeft die rij vaak nog niet; die maakt de upsert hieronder aan,
  // precies zoals het zetten van een kleur of de karvlag dat al doet.
  const [team, rows] = await Promise.all([
    prisma.user.findMany({
      where: {
        active: true,
        deletedAt: null,
        memberships: { some: { group: { code: 'LOGISTIEK' }, year: currentWorkingYear() } },
      },
      select: { id: true, name: true },
    }),
    prisma.uitleenDriver.findMany({
      where: { user: { active: true, deletedAt: null } },
      select: { userId: true, phone: true, user: { select: { id: true, name: true } } },
    }),
  ]);

  const drivers = new Map<string, { id: string; name: string }>();
  for (const member of team) drivers.set(member.id, member);
  for (const row of rows) drivers.set(row.user.id, row.user);
  const existingPhone = new Map(rows.map((row) => [row.userId, row.phone?.trim() || null]));

  const result = matchContacts(contacts, [...drivers.values()]);

  const toWrite = result.matched.filter((match) => {
    const current = existingPhone.get(match.person.id);
    if (!current) return true;
    if (current === match.phone) return false;
    return overwrite;
  });
  const kept = result.matched.filter(
    (match) => !toWrite.includes(match) && existingPhone.get(match.person.id)
  );

  console.log(`Contacten in het bestand: ${contacts.length}`);
  console.log(`Chauffeurs in de pool: ${drivers.size}`);
  console.log('');

  if (toWrite.length > 0) {
    console.log(`Krijgen een nummer (${toWrite.length}):`);
    for (const match of toWrite) {
      const current = existingPhone.get(match.person.id);
      const how = match.how === 'omgedraaide-naam' ? ' [naam omgedraaid]' : '';
      console.log(`  ${match.person.name}: ${current ? `${current} -> ` : ''}${match.phone}${how}`);
    }
    console.log('');
  }

  if (kept.length > 0) {
    console.log(`Hebben al een nummer van het team, blijven staan (${kept.length}):`);
    for (const match of kept) {
      console.log(`  ${match.person.name}: ${existingPhone.get(match.person.id)} (lijst zegt ${match.phone})`);
    }
    console.log('  Gebruik --overwrite om deze toch te vervangen.');
    console.log('');
  }

  if (result.badPhone.length > 0) {
    console.log(`Naam gevonden, nummer niet te lezen (${result.badPhone.length}):`);
    for (const bad of result.badPhone) {
      console.log(`  ${bad.person.name}: ${PHONE_PROBLEMS[bad.reason] ?? bad.reason}`);
    }
    console.log('');
  }

  if (result.ambiguous.length > 0) {
    console.log(`Meerdere chauffeurs met dezelfde naam, overgeslagen (${result.ambiguous.length}):`);
    for (const entry of result.ambiguous) {
      console.log(`  ${entry.contact.name}: ${entry.candidates.length} kandidaten`);
    }
    console.log('');
  }

  // Enkel het aantal, niet de namen: dit zijn de 80-plus praesidiumleden die geen
  // chauffeur zijn, en die horen niet in een logregel thuis.
  const notADriver = result.unmatched.length;
  if (notADriver > 0) console.log(`Contacten zonder chauffeur in de pool: ${notADriver}`);

  const driversWithout = [...drivers.values()].filter(
    (driver) =>
      !existingPhone.get(driver.id) && !result.matched.some((match) => match.person.id === driver.id)
  );
  if (driversWithout.length > 0) {
    console.log('');
    console.log(`Chauffeurs die na deze import nog geen nummer hebben (${driversWithout.length}):`);
    for (const driver of driversWithout) console.log(`  ${driver.name}`);
  }

  if (!apply) {
    console.log('');
    console.log('Droge test. Geef --apply mee om dit weg te schrijven.');
    return;
  }

  for (const match of toWrite) {
    await prisma.uitleenDriver.upsert({
      where: { userId: match.person.id },
      update: { phone: match.phone },
      create: { userId: match.person.id, phone: match.phone },
    });
  }

  console.log('');
  console.log(`Weggeschreven: ${toWrite.length} nummer(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
