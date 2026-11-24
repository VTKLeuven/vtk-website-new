import { describe, expect, it } from 'vitest';
import { brusselsWallClock, type YMD } from '@/lib/brussels';
import type { ShiftTemplateEntry } from '@/lib/shift/templates';
import {
  AFWAS_FALLBACK_SLOT,
  afwasBlock,
  afwasSlot,
  afwasWeeks,
  bookedSpan,
  hourPast,
  hoursLabel,
  normalizeHours,
  dateToDay,
  dayToDate,
  describeAfwas,
  groupSessionsByWeek,
  inWeekAfterEvent,
  pickReminderDue,
  reminderDue,
  reminderWindowPassed,
  slotStart,
  theokotDayState,
} from '@/lib/theokotAfwas';
import { afwasClosedMail, afwasNotedMail, afwasPickReminderMail, afwasReminderMail } from '@/lib/theokotAfwasMail';

const ymd = (month: number, day: number): YMD => ({ year: 2026, month, day });

function entry(name: string, startOffsetMinutes: number, durationMinutes: number, enabled = true): ShiftTemplateEntry {
  return {
    id: name,
    name,
    startOffsetMinutes,
    durationMinutes,
    maxParticipants: 2,
    reward: 2,
    description: '',
    instructions: null,
    location: null,
    ownPost: false,
    post: null,
    openToInternationals: false,
    enabled,
  };
}

const TEMPLATE = {
  timeOfDay: '10:30',
  shifts: [entry('Broodjes Smeren', 0, 120), entry('Broodjes verkopen', 120, 90), entry('Namiddag verkoop', 210, 120)],
};

const SLOT = afwasSlot(TEMPLATE);

/** Een verkoopdag zoals de database hem bewaart: middernacht op de Brusselse klok. */
const session = (day: YMD, isOpen = true) => ({ date: brusselsWallClock(day.year, day.month, day.day, '00:00'), isOpen });

describe('afwasSlot', () => {
  it('begint op de namiddagshift uit het sjabloon en telt drie uren', () => {
    expect(SLOT).toEqual({ startMinutes: 14 * 60, endMinutes: 17 * 60, shiftName: 'Namiddag verkoop' });
  });

  it('valt zonder shift met "namiddag" terug op de laatste shift van de dag', () => {
    const slot = afwasSlot({ timeOfDay: '10:00', shifts: [entry('Ochtend', 0, 60), entry('Laat', 300, 90)] });
    expect(slot).toEqual({ startMinutes: 15 * 60, endMinutes: 18 * 60, shiftName: 'Laat' });
  });

  it('negeert een uitgevinkte shift', () => {
    const slot = afwasSlot({ timeOfDay: '10:00', shifts: [entry('Ochtend', 0, 60), entry('Namiddag', 300, 90, false)] });
    expect(slot.shiftName).toBe('Ochtend');
  });

  it('valt terug op 14:00-17:00 zonder sjabloon of shiften', () => {
    expect(afwasSlot(null)).toEqual(AFWAS_FALLBACK_SLOT);
    expect(afwasSlot({ timeOfDay: '10:30', shifts: [] })).toEqual(AFWAS_FALLBACK_SLOT);
  });
});

describe('theokotDayState', () => {
  // Week van maandag 23 november 2026.
  const weeks = groupSessionsByWeek([session(ymd(11, 23)), session(ymd(11, 24)), session(ymd(11, 26), false)]);

  it('is open op een verkoopdag', () => {
    expect(theokotDayState(ymd(11, 23), weeks)).toBe('open');
  });

  it('is dicht op een dag die in een geplande week ontbreekt of op dicht staat', () => {
    expect(theokotDayState(ymd(11, 25), weeks)).toBe('closed');
    expect(theokotDayState(ymd(11, 26), weeks)).toBe('closed');
  });

  it('weet het niet voor een week zonder enige verkoopdag', () => {
    expect(theokotDayState(ymd(12, 2), weeks)).toBe('unknown');
  });
});

describe('afwasBlock', () => {
  const now = brusselsWallClock(2026, 11, 24, '13:00');

  it('laat een vrije werkdag boeken, ook vandaag zolang het laatste uur niet begon', () => {
    expect(afwasBlock({ day: ymd(11, 24), state: 'open', slot: SLOT, now })).toBeNull();
    expect(afwasBlock({ day: ymd(11, 24), state: 'open', slot: SLOT, now: brusselsWallClock(2026, 11, 24, '15:30') })).toBeNull();
    expect(afwasBlock({ day: ymd(12, 3), state: 'unknown', slot: SLOT, now })).toBeNull();
  });

  it('weigert wat begon, het weekend, een dichte dag en verder dan een jaar', () => {
    expect(afwasBlock({ day: ymd(11, 24), state: 'open', slot: SLOT, now: brusselsWallClock(2026, 11, 24, '16:00') })).toBe('past');
    expect(afwasBlock({ day: ymd(11, 28), state: 'unknown', slot: SLOT, now })).toBe('weekend');
    expect(afwasBlock({ day: ymd(11, 25), state: 'closed', slot: SLOT, now })).toBe('closed');
    expect(afwasBlock({ day: { year: 2027, month: 12, day: 1 }, state: 'unknown', slot: SLOT, now })).toBe('tooFar');
  });
});

describe('de uren', () => {
  it('voegt aansluitende uren samen in het label', () => {
    expect(hoursLabel(SLOT, [1, 0])).toBe('14:00–16:00');
    expect(hoursLabel(SLOT, [0, 2])).toBe('14:00–15:00, 16:00–17:00');
    expect(hoursLabel(SLOT, [0, 1, 2])).toBe('14:00–17:00');
  });

  it('houdt enkel geldige uren over, elk één keer', () => {
    expect(normalizeHours([2, 0, 2, 3, -1, 1.5])).toEqual([0, 2]);
  });

  it('loopt van het eerste tot het laatste geboekte uur', () => {
    const span = bookedSpan(ymd(11, 25), SLOT, [2, 1]);
    expect(span.start.toISOString()).toBe('2026-11-25T14:00:00.000Z');
    expect(span.end.toISOString()).toBe('2026-11-25T16:00:00.000Z');
  });

  it('is voorbij zodra het uur begint', () => {
    expect(hourPast(ymd(11, 25), SLOT, 1, brusselsWallClock(2026, 11, 25, '14:59'))).toBe(false);
    expect(hourPast(ymd(11, 25), SLOT, 1, brusselsWallClock(2026, 11, 25, '15:00'))).toBe(true);
  });
});

describe('herinnering', () => {
  const start = bookedSpan(ymd(11, 25), SLOT, [0]).start;

  it('valt binnen de 24 uur voor het begin', () => {
    expect(reminderDue(start, brusselsWallClock(2026, 11, 24, '13:59'))).toBe(false);
    expect(reminderDue(start, brusselsWallClock(2026, 11, 24, '14:00'))).toBe(true);
    expect(reminderDue(start, brusselsWallClock(2026, 11, 25, '14:00'))).toBe(false);
  });

  it('is al voorbij voor wie binnen de 24 uur boekt', () => {
    expect(reminderWindowPassed(start, brusselsWallClock(2026, 11, 24, '18:00'))).toBe(true);
    expect(reminderWindowPassed(start, brusselsWallClock(2026, 11, 23, '18:00'))).toBe(false);
  });

  it('rekent op de Brusselse klok, ook in de zomer', () => {
    expect(slotStart(ymd(7, 1), SLOT).toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(slotStart(ymd(11, 25), SLOT).toISOString()).toBe('2026-11-25T13:00:00.000Z');
  });
});

describe('de week na het evenement', () => {
  it('aanvaardt elke werkdag van de week erna', () => {
    // Cantus op donderdag 19 november: de week van maandag 23 november.
    expect(inWeekAfterEvent(ymd(11, 19), ymd(11, 23))).toBe(true);
    expect(inWeekAfterEvent(ymd(11, 19), ymd(11, 27))).toBe(true);
  });

  it('waarschuwt voor dezelfde week of twee weken later', () => {
    expect(inWeekAfterEvent(ymd(11, 19), ymd(11, 20))).toBe(false);
    expect(inWeekAfterEvent(ymd(11, 19), ymd(12, 1))).toBe(false);
  });

  it('telt een evenement op zondag nog bij zijn eigen week', () => {
    expect(inWeekAfterEvent(ymd(11, 22), ymd(11, 23))).toBe(true);
  });

  it('zegt niets zonder datum of zonder namiddag', () => {
    expect(inWeekAfterEvent(null, ymd(11, 23))).toBe(true);
    expect(inWeekAfterEvent(ymd(11, 19), null)).toBe(true);
  });
});

describe('describeAfwas', () => {
  it('zet hoeveel voor wat, in de vaste volgorde', () => {
    expect(describeAfwas('3 bakken', ['GLAZEN', 'ECOCUPS'], true)).toBe('3 bakken · Ecocups, glazen');
    expect(describeAfwas('20', ['KOMMETJES'], false)).toBe('20 · Bowls');
  });
});

describe('afwasWeeks en de dag in de database', () => {
  it('geeft werkweken van vijf dagen vanaf maandag', () => {
    const weeks = afwasWeeks(ymd(11, 23), 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].map((day) => day.day)).toEqual([23, 24, 25, 26, 27]);
    expect(weeks[1][0]).toEqual(ymd(11, 30));
  });

  it('bewaart een kalenderdag zonder uur, heen en terug', () => {
    expect(dateToDay(dayToDate(ymd(3, 30)))).toEqual(ymd(3, 30));
    expect(dayToDate(ymd(3, 30)).toISOString()).toBe('2026-03-30T00:00:00.000Z');
  });
});

describe('mails', () => {
  const input = {
    name: 'Wannes',
    locale: 'NL' as const,
    groupName: 'Activiteiten',
    start: slotStart(ymd(11, 25), SLOT),
    end: brusselsWallClock(2026, 11, 25, '16:00'),
    what: '3 bakken · Ecocups',
    note: 'Cantus',
  };

  it('de herinnering zegt wanneer, wat en voor welke groep', () => {
    const mail = afwasReminderMail(input);
    expect(mail.subject).toBe('Morgen afwassen in Theokot (Activiteiten)');
    expect(mail.text).toContain('woensdag 25 november, 14:00 tot 16:00');
    expect(mail.text).toContain('Af te wassen: 3 bakken · Ecocups');
    expect(mail.html).toContain('Activiteiten');
  });

  it('de melding "dicht" vraagt een andere namiddag', () => {
    const mail = afwasClosedMail({ ...input, locale: 'EN' });
    expect(mail.subject).toBe('Theokot is closed on Wednesday 25 November');
    expect(mail.text).toContain('Pick another afternoon');
  });

  it('ontsnapt wat de groep zelf intikte', () => {
    expect(afwasReminderMail({ ...input, note: '<b>x</b>' }).html).not.toContain('<b>x</b>');
  });
});

describe('afwas zonder namiddag', () => {
  const open = {
    name: 'Wannes',
    locale: 'NL' as const,
    groupName: 'Onthaal',
    what: '3 bakken · Ecocups',
    note: 'Openingsfuif',
    eventDate: brusselsWallClock(2026, 11, 19, '12:00'),
    start: null,
    end: null,
  };

  it('herinnert pas na twee dagen zonder namiddag', () => {
    const noted = brusselsWallClock(2026, 11, 23, '10:00');
    expect(pickReminderDue(noted, brusselsWallClock(2026, 11, 25, '09:59'))).toBe(false);
    expect(pickReminderDue(noted, brusselsWallClock(2026, 11, 25, '10:00'))).toBe(true);
  });

  it('de mail "genoteerd" vraagt een namiddag te kiezen en zegt wie noteerde', () => {
    const mail = afwasNotedMail({ ...open, notedBy: 'Lotte van Logistiek' });
    expect(mail.subject).toBe('Kies een namiddag om af te wassen (Onthaal)');
    expect(mail.text).toContain('Lotte van Logistiek noteerde dat Onthaal nog moet afwassen');
    expect(mail.text).toContain('Namiddag: nog te kiezen');
    expect(mail.text).toContain('Evenement: Openingsfuif, donderdag 19 november');
  });

  it('met een namiddag zegt de mail "genoteerd" wanneer', () => {
    const mail = afwasNotedMail({
      ...open,
      notedBy: 'Theokot',
      start: slotStart(ymd(11, 25), SLOT),
      end: brusselsWallClock(2026, 11, 25, '16:00'),
    });
    expect(mail.subject).toBe('Afwas in Theokot voor Onthaal');
    expect(mail.text).toContain('Namiddag: woensdag 25 november, 14:00 tot 16:00');
  });

  it('de herinnering zegt dat er nog geen namiddag is', () => {
    const mail = afwasPickReminderMail({ ...open, locale: 'EN' });
    expect(mail.subject).toBe('No afternoon picked yet to wash up (Onthaal)');
    expect(mail.text).toContain('Afternoon: still to pick');
  });
});
