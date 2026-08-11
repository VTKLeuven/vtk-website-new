/**
 * De eenheden van de flesserke-voorraad zetten, en de hoeveelheid uit de naam halen.
 *
 *   npm run flesserke:units -w @vtk/logistiek             # dry-run, schrijft niets
 *   npm run flesserke:units -w @vtk/logistiek -- --apply  # pas na nakijken
 *
 * De Excel-kolom heette "Hoeveelheid [kg of L]" en de import bewaarde enkel het
 * getal. Daardoor staat er "0.14" bij een pot tomatenpuree van 140 g, en is dat
 * niet te onderscheiden van 140 ml. De eenheid zat hoogstens in de naam
 * ("everyday tomatenpuree 140g"), waar ze niet hoort: ze staat dan twee keer en
 * gaat scheef zodra iemand het formaat aanpast.
 *
 * Drie dingen gebeuren hier:
 *   1. `contentUnit` invullen. De regel volgt de Excel-kolom: drank in liter,
 *      eetbare waar in kilogram. Huishoudproducten zijn gemengd (zeep in liter,
 *      een wc-blok in kilo, zakken in liter) en staan daarom per item hieronder.
 *   2. De hoeveelheid uit de naam halen wanneer die er als tekst in staat, en ze
 *      in `contentAmount` zetten wanneer dat veld leeg was.
 *   3. Wat niet klopt of niet te raden valt, wordt NIET aangepast maar
 *      opgesomd onder "nakijken". Een verkeerde eenheid is erger dan geen: bij
 *      "0,5" denkt iedereen zelf na, bij "0,5 kg" op een fles niemand meer.
 */
import { prisma } from '@vtk/db';

const APPLY = process.argv.includes('--apply');

/** Eenheid per categorie, zoals de Excel-kolom ze bedoelde. */
const UNIT_BY_CATEGORY: Record<string, string> = {
  'Drank alcoholisch': 'L',
  'Drank non-alcoholisch': 'L',
  Beleg: 'kg',
  Conserven: 'kg',
  'Droge voeding': 'kg',
  Koffie: 'kg',
  Kruiden: 'kg',
  Saus: 'kg',
  'Zoete Snacks': 'kg',
  'Zoute Snacks': 'kg',
};

/**
 * Huishoudproducten zijn niet per categorie te vangen: zeep en handgel gaan per
 * liter, een wc-blok per kilo, en de zakken worden per volume verkocht. Per item
 * dus, op naam.
 */
const UNIT_BY_NAME: Record<string, string> = {
  'Alcohol handgel': 'L',
  'Alcohol handgel bus': 'L',
  'Allesreiniger bus': 'L',
  'Bruine zeep': 'L',
  Handzeep: 'L',
  'Lijnolie zeep': 'L',
  Luchtverfrisser: 'L',
  'Natuurlijke vloeibare zeep': 'L',
  Ontstopper: 'L',
  'Vloeibare zeep': 'L',
  'GFT-zakken (los)': 'L',
  'WC-blok': 'kg',
};

/**
 * De hoeveelheid staat in de naam. Per item: wat de naam wordt, en welk getal
 * met welke eenheid erbij hoort.
 *
 * Enkel waar de naam en het getal hetzelfde zeggen (of het getal ontbreekt).
 * Spreken ze elkaar tegen, dan staat het item onder "nakijken" en blijft alles
 * zoals het is.
 */
const FROM_NAME: Record<string, { name: string; amount: string; unit: string }> = {
  'econom dubbel geconctreerde tomatenpuree 800g': {
    name: 'Econom dubbel geconcentreerde tomatenpuree',
    amount: '0.8',
    unit: 'kg',
  },
  'econom gepelde tomaten 1,5kg': { name: 'Econom gepelde tomaten', amount: '1.5', unit: 'kg' },
  'everyday gepelde tomaten 400g': { name: 'Everyday gepelde tomaten', amount: '0.4', unit: 'kg' },
  'everyday tomatenpuree 140g': { name: 'Everyday tomatenpuree', amount: '0.14', unit: 'kg' },
  'everyday weense worsten 400g': { name: 'Everyday weense worsten', amount: '0.4', unit: 'kg' },
  'zuurkool conservenblik 810g': { name: 'Zuurkool conservenblik', amount: '0.81', unit: 'kg' },
  'Baileys (0,7L)': { name: 'Baileys', amount: '0.7', unit: 'L' },
  'Baileys (1L)': { name: 'Baileys groot', amount: '1', unit: 'L' },
  'Cara (0,5l)': { name: 'Cara', amount: '0.5', unit: 'L' },
  'hoegaarden rosé 25cl': { name: 'Hoegaarden rosé', amount: '0.25', unit: 'L' },
  'rose wijn 5L': { name: 'Rosé wijn', amount: '5', unit: 'L' },
  'sint-bernardus 0,33l': { name: 'Sint-Bernardus', amount: '0.33', unit: 'L' },
  'Stella Artois flesje (25)': { name: 'Stella Artois flesje', amount: '0.25', unit: 'L' },
  'Coca Cola (1,5l)': { name: 'Coca Cola', amount: '1.5', unit: 'L' },
  'Coca Cola zero (1,5l)': { name: 'Coca Cola zero', amount: '1.5', unit: 'L' },
  'Fanta 1,5l': { name: 'Fanta', amount: '1.5', unit: 'L' },
  'Ice tea  1,5l': { name: 'Ice tea', amount: '1.5', unit: 'L' },
  'tonic 0,5L': { name: 'Tonic', amount: '0.5', unit: 'L' },
  'water 2l': { name: 'Water', amount: '2', unit: 'L' },
  'Water 5L': { name: 'Water groot', amount: '5', unit: 'L' },
  'melkchocolade 0,2kg': { name: 'Melkchocolade', amount: '0.2', unit: 'kg' },
  'Cornflakes cereal flakes TESTITEM': {
    name: 'Cornflakes cereal flakes TESTITEM',
    amount: '0.5',
    unit: 'kg',
  },
};

/** De hoeveelheid is geen getal maar een streepje: leegmaken. */
const CLEAR_AMOUNT = new Set(['/']);

/**
 * Items waar de naam en het getal elkaar tegenspreken, of waar het getal zonder
 * de verpakking in de hand niet te duiden is. Die raakt het script niet aan; ze
 * worden onderaan opgesomd met de reden.
 */
const REVIEW: Record<string, string> = {
  'Coca Cola (2l)': 'naam zegt 2 l, hoeveelheid zegt 1.5',
  'Coca Cola zero (2l)': 'naam zegt 2 l, hoeveelheid zegt 1.5',
  'Vuilniszakken (los)': '130: liter per zak, of iets anders?',
  'Vuilniszakken (rol van 10)': '130: liter per zak, of iets anders?',
  "Tortilla's (12)": '1.2 kg voor 12 tortillas lijkt veel',
};

type Change = { id: string; label: string; before: string; after: string };

async function main() {
  const items = await prisma.uitleenFlesserkeItem.findMany({
    select: {
      id: true,
      name: true,
      contentAmount: true,
      contentUnit: true,
      category: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  const changes: Change[] = [];
  const review: string[] = [];
  const untouched: string[] = [];

  for (const item of items) {
    const categoryName = item.category?.name ?? 'Overig';
    const reason = REVIEW[item.name];
    if (reason) {
      review.push(`${item.name}  (${categoryName})  ->  ${reason}`);
      continue;
    }

    const fromName = FROM_NAME[item.name];
    const amountNow = item.contentAmount?.trim() ?? '';

    let name = item.name;
    let amount = amountNow;
    let unit = item.contentUnit?.trim() ?? '';

    if (fromName) {
      name = fromName.name;
      unit = fromName.unit;
      // Staat er al een getal, dan wint dat; het is nagekeken en het klopt met
      // de naam, anders had het item in REVIEW gestaan.
      amount = amountNow || fromName.amount;
    } else if (CLEAR_AMOUNT.has(amountNow)) {
      amount = '';
    } else if (amountNow && !unit) {
      unit = UNIT_BY_NAME[item.name] ?? UNIT_BY_CATEGORY[categoryName] ?? '';
    }

    if (name === item.name && amount === amountNow && unit === (item.contentUnit ?? '')) {
      untouched.push(`${item.name}  (${categoryName})`);
      continue;
    }

    changes.push({
      id: item.id,
      label: `${item.name}  (${categoryName})`,
      before: `naam "${item.name}", hoeveelheid "${amountNow || '-'}", eenheid "${item.contentUnit ?? '-'}"`,
      after: `naam "${name}", hoeveelheid "${amount || '-'}", eenheid "${unit || '-'}"`,
    });

    if (APPLY) {
      await prisma.uitleenFlesserkeItem.update({
        where: { id: item.id },
        data: { name, contentAmount: amount || null, contentUnit: unit || null },
      });
    }
  }

  console.log(APPLY ? 'Modus: APPLY (er wordt geschreven).\n' : 'Modus: dry-run (er wordt niets geschreven).\n');
  console.log(`${changes.length} van de ${items.length} items wijzigen:\n`);
  for (const change of changes) {
    console.log(`▸ ${change.label}`);
    console.log(`    van:  ${change.before}`);
    console.log(`    naar: ${change.after}`);
  }

  if (review.length > 0) {
    console.log(`\n${review.length} items NIET aangepast, kijk deze zelf na:`);
    for (const line of review) console.log(`  ! ${line}`);
  }

  console.log(`\n${untouched.length} items blijven zoals ze zijn (geen hoeveelheid, of al in orde).`);
  if (!APPLY && changes.length > 0) {
    console.log('\nZiet dit er goed uit? Draai opnieuw met --apply.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
