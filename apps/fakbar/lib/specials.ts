import 'server-only';
import { prisma } from '@vtk/db';

/**
 * De specials van vanavond: wat er vandaag extra achter de toog staat.
 *
 * **Wanneer is "vanavond"?** De fakbarweek loopt van zondag tot vrijdag en de
 * avond loopt over middernacht. Iemand die om half twee 's nachts op zijn
 * telefoon kijkt, bedoelt de avond die bezig is en niet die van de dag die net
 * begonnen is; tot 06:00 tonen we daarom nog de avond van gisteren. Zonder die
 * regel verspringt het bord midden in de nacht naar leeg.
 */

export type TonightSpecial = {
  id: string;
  kind: 'DRANK' | 'ACTIE';
  title: string;
  note: string | null;
  /** De prijs die vanavond geldt, in cent, of null voor de gewone prijs. */
  price: number | null;
  /** De naam van het artikel waar het over gaat, als er één gekoppeld is. */
  itemName: string | null;
  /** De gewone prijs van dat artikel, om het verschil te kunnen tonen. */
  itemPrice: number | null;
};

export type SpecialsDay = {
  /** De datum van de avond waar dit over gaat. */
  date: Date;
  /** Loopt deze avond nu? Dan is het "vanavond" en niet "binnenkort". */
  isTonight: boolean;
  specials: TonightSpecial[];
};

export type SpecialsBoardData = {
  /**
   * `tonight` wanneer de avond die nu loopt zelf specials heeft, anders
   * `upcoming` met de eerstvolgende avonden die er wel hebben.
   *
   * Zonder dat tweede geval stond het bord het grootste deel van de week leeg,
   * ook al waren de acties van die week al ingevuld: op zaterdag is de bar
   * dicht, en dan toont "vanavond" per definitie niets. Een bord dat je bijna
   * nooit ziet, bestaat niet.
   */
  mode: 'tonight' | 'upcoming';
  days: SpecialsDay[];
};

/** Het uur in Brussel, los van de servertijdzone. */
function brusselsHour(now: Date): number {
  const raw = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const hour = Number(raw);
  return Number.isFinite(hour) ? hour : 12;
}

/** De datum (middernacht UTC) van de avond die nu loopt. */
export function tonightDate(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = parts.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Voor 06:00 hoort de nacht nog bij de avond ervoor.
  if (brusselsHour(now) < 6) date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

const SPECIAL_SELECT = {
  id: true,
  kind: true,
  title: true,
  note: true,
  price: true,
  item: { select: { name: true, salesPrice: true } },
} as const;

/** Hoeveel avonden vooruit we kijken wanneer vanavond niets heeft. */
const UPCOMING_DAYS = 10;

/**
 * Wat er op het bord komt: de specials van de avond die nu loopt, of anders die
 * van de eerstvolgende avonden die er hebben.
 */
export async function getSpecialsBoard(now: Date = new Date()): Promise<SpecialsBoardData | null> {
  const today = tonightDate(now);
  const horizon = new Date(today.getTime());
  horizon.setUTCDate(horizon.getUTCDate() + UPCOMING_DAYS);

  let evenings;
  try {
    evenings = await prisma.fakbarEvening.findMany({
      where: {
        date: { gte: today, lte: horizon },
        // Enkel avonden die iets te melden hebben; een lege avond hoort niet
        // als kop op het bord.
        specials: { some: {} },
      },
      orderBy: { date: 'asc' },
      select: { date: true, specials: { orderBy: { sortOrder: 'asc' }, select: SPECIAL_SELECT } },
    });
  } catch {
    // Het bord is een extraatje; een databankhik mag de pagina niet omver halen.
    return null;
  }

  if (evenings.length === 0) return null;

  const days: SpecialsDay[] = evenings.map((evening) => ({
    date: evening.date,
    isTonight: evening.date.getTime() === today.getTime(),
    specials: evening.specials.map((special) => ({
      id: special.id,
      kind: special.kind,
      title: special.title,
      note: special.note,
      price: special.price,
      itemName: special.item?.name ?? null,
      itemPrice: special.item?.salesPrice ?? null,
    })),
  }));

  // Loopt er vanavond iets, dan is dat het hele bord: wat er volgende week komt
  // leidt dan enkel af van wat er nu te halen valt.
  const tonight = days.find((day) => day.isTonight);
  if (tonight) return { mode: 'tonight', days: [tonight] };

  return { mode: 'upcoming', days: days.slice(0, 3) };
}
