/**
 * Server-only pianologica: de configuratie en de vensters/sluitingsdagen uit de
 * database halen en er de agenda uit berekenen. Gescheiden van `lib/piano.ts`
 * (zuiver, client-safe) zodat prisma nooit in een clientbundel belandt.
 */

import { prisma } from '@vtk/db';
import { brusselsYMD, ymdKey } from './brussels';
import {
  DEFAULT_PIANO_CONFIG,
  generatePianoDays,
  parsePianoConfig,
  type PianoClosureRange,
  type PianoConfig,
  type PianoDay,
  type PianoWindowRule,
} from './piano';

export const PIANO_CONFIG_KEY = 'piano.config';
export const PIANO_INFO_KEY = 'piano.info';

/** De tekst boven de agenda, in Markdown, beheerd via /admin/piano. */
export type PianoInfo = { bodyNl: string; bodyEn: string };

/**
 * De regeling zoals ze op vtk.be stond. Staat er nog geen tekst in de database,
 * dan is dit wat leden te zien krijgen; de vice kan ze daarna gewoon overschrijven.
 */
export const DEFAULT_PIANO_INFO: PianoInfo = {
  bodyNl: [
    'VTK heeft een eigen piano: je vindt hem in lokaal 01.52 van het kasteel, naast de',
    'promotiezaal. Studenten mogen er gratis gebruik van maken.',
    '',
    'Vraag vooraf je begeleidende brief bij de vice in Blok 6 (Studentenwijk Arenberg).',
    'Hou die altijd bij wanneer je gaat spelen: de bewaking kan ernaar vragen.',
  ].join('\n'),
  bodyEn: [
    "VTK has its own piano: you'll find it in room 01.52 of the castle, next to the",
    'proclamation hall. Students can use it for free.',
    '',
    'Ask the vice for your accompanying letter in Blok 6 (Studentenwijk Arenberg) first.',
    'Always carry it with you when you go and play: security may ask for it.',
  ].join('\n'),
};

/** Leest `piano.config` uit de Setting-tabel, aangevuld met defaults. */
export async function getPianoConfig(): Promise<PianoConfig> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: PIANO_CONFIG_KEY } });
    return parsePianoConfig(row?.value);
  } catch {
    return DEFAULT_PIANO_CONFIG;
  }
}

/** Leest `piano.info`; een leeg veld valt terug op de standaardtekst. */
export async function getPianoInfo(): Promise<PianoInfo> {
  const row = await prisma.setting.findUnique({ where: { key: PIANO_INFO_KEY } });
  const value = (row?.value ?? {}) as Partial<PianoInfo>;
  return {
    bodyNl: typeof value.bodyNl === 'string' && value.bodyNl.trim() ? value.bodyNl : DEFAULT_PIANO_INFO.bodyNl,
    bodyEn: typeof value.bodyEn === 'string' && value.bodyEn.trim() ? value.bodyEn : DEFAULT_PIANO_INFO.bodyEn,
  };
}

/** De actieve vensters en alle sluitingsdagen, in de vorm die de generator wil. */
export async function getPianoRules(): Promise<{
  windows: PianoWindowRule[];
  closures: PianoClosureRange[];
}> {
  const [windows, closures] = await Promise.all([
    prisma.pianoWindow.findMany({ where: { active: true }, orderBy: { order: 'asc' } }),
    prisma.pianoClosure.findMany({ orderBy: { startDate: 'asc' } }),
  ]);

  return {
    windows: windows.map((w) => ({
      weekdays: w.weekdays,
      startMinute: w.startMinute,
      endMinute: w.endMinute,
      startDate: w.startDate ? ymdKey(brusselsYMD(w.startDate)) : null,
      endDate: w.endDate ? ymdKey(brusselsYMD(w.endDate)) : null,
    })),
    closures: closures.map((c) => ({
      startDate: ymdKey(brusselsYMD(c.startDate)),
      endDate: ymdKey(brusselsYMD(c.endDate)),
    })),
  };
}

/**
 * De agenda tussen twee kalenderdagen: de berekende slots, met per slot wie hem
 * geboekt heeft. Eén query voor de reservaties in het venster, want er zijn er
 * hoogstens een paar honderd.
 */
export async function loadPianoAgenda(options: {
  from: Date;
  to: Date;
  slotMinutes: number;
}): Promise<{ days: PianoDay[]; takenBy: Map<number, { userId: string; name: string }> }> {
  const { windows, closures } = await getPianoRules();
  const days = generatePianoDays(windows, closures, {
    from: brusselsYMD(options.from),
    to: brusselsYMD(options.to),
    slotMinutes: options.slotMinutes,
  });

  // Op de berekende slots begrenzen in plaats van op de dagen: dan is `to` als
  // instant (middernacht of einde van de dag) niet meer van tel.
  const allSlots = days.flatMap((d) => d.slots);
  const reservations = allSlots.length
    ? await prisma.pianoReservation.findMany({
        where: {
          startsAt: {
            gte: allSlots[0].startsAt,
            lte: allSlots[allSlots.length - 1].startsAt,
          },
        },
        include: { user: { select: { id: true, name: true } } },
      })
    : [];

  return {
    days,
    takenBy: new Map(
      reservations.map((r) => [r.startsAt.getTime(), { userId: r.user.id, name: r.user.name }]),
    ),
  };
}
