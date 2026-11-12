import { describe, expect, it } from 'vitest';
import { brusselsWallClock } from '@/lib/brussels';
import { templateShiftPlan, templateShiftsForDay, type ShiftTemplate } from '@/lib/shift/templates';
import { shortShiftName, weekShiftPreview } from '@/lib/theokotShifts';

// Het Theokot-sjabloon zoals het op de site staat: smeren, verkopen, namiddag,
// met het startuur op 10:30 en de offsets vanaf dat uur.
function theokotTemplate(overrides: Partial<ShiftTemplate> = {}): ShiftTemplate {
  const entry = (name: string, startOffsetMinutes: number, durationMinutes: number, enabled = true) => ({
    id: name,
    name,
    startOffsetMinutes,
    durationMinutes,
    maxParticipants: 4,
    reward: 2,
    description: name,
    instructions: null,
    location: null,
    ownPost: false,
    post: null,
    openToInternationals: false,
    enabled,
  });
  return {
    id: 'theokot',
    slug: 'theokot',
    label: 'Theokot opening',
    note: null,
    builtIn: true,
    eventName: 'Theokot',
    location: 'Theokot',
    post: 'THEOKOT',
    timeOfDay: '10:30',
    shifts: [
      entry('Broodjes smeren', 0, 120),
      entry('Broodjes verkopen', 120, 90),
      entry('Namiddagshift', 210, 120),
    ],
    ...overrides,
  };
}

describe('templateShiftsForDay', () => {
  it('zet de shiften op het startuur van het sjabloon, niet op het afhaaluur', () => {
    // Maandag 16 november 2026: wintertijd. Vroeger rekende een verkoopweek
    // vanaf het afhaaluur (12:00), en stond smeren om 12:00 in plaats van 10:30.
    const day = brusselsWallClock(2026, 11, 16, '00:00');
    const shifts = templateShiftsForDay(theokotTemplate(), day);

    expect(shifts.map((s) => [s.startTime, s.endTime])).toEqual([
      [brusselsWallClock(2026, 11, 16, '10:30'), brusselsWallClock(2026, 11, 16, '12:30')],
      [brusselsWallClock(2026, 11, 16, '12:30'), brusselsWallClock(2026, 11, 16, '14:00')],
      [brusselsWallClock(2026, 11, 16, '14:00'), brusselsWallClock(2026, 11, 16, '16:00')],
    ]);
    // 10:30 in Brussel is 09:30 UTC in de winter.
    expect(shifts[0].startTime.toISOString()).toBe('2026-11-16T09:30:00.000Z');
  });

  it('klopt ook in de zomertijd', () => {
    const shifts = templateShiftsForDay(theokotTemplate(), brusselsWallClock(2026, 4, 20, '00:00'));
    expect(shifts[0].startTime.toISOString()).toBe('2026-04-20T08:30:00.000Z');
  });

  it('volgt een ander startuur in het sjabloon', () => {
    const shifts = templateShiftsForDay(
      theokotTemplate({ timeOfDay: '11:00' }),
      brusselsWallClock(2026, 11, 16, '00:00'),
    );
    expect(shifts[0].startTime).toEqual(brusselsWallClock(2026, 11, 16, '11:00'));
  });

  it('laat een uitgevinkte shift weg en zet naam, locatie en post', () => {
    const template = theokotTemplate();
    template.shifts[2] = { ...template.shifts[2], enabled: false };
    const shifts = templateShiftsForDay(template, brusselsWallClock(2026, 11, 16, '00:00'));

    expect(shifts).toHaveLength(2);
    expect(shifts[0]).toMatchObject({
      name: 'Broodjes smeren - Theokot',
      location: 'Theokot',
      post: 'THEOKOT',
    });
  });
});

describe('templateShiftPlan', () => {
  it('toont dezelfde uren als er aangemaakt worden', () => {
    expect(templateShiftPlan(theokotTemplate(), true)).toEqual([
      { name: 'Broodjes smeren', start: '10:30', end: '12:30' },
      { name: 'Broodjes verkopen', start: '12:30', end: '14:00' },
      { name: 'Namiddagshift', start: '14:00', end: '16:00' },
    ]);
  });
});

describe('shortShiftName', () => {
  it('haalt het evenement achter de naam weg', () => {
    expect(shortShiftName('Broodjes smeren - Theokot', 'Theokot')).toBe('Broodjes smeren');
  });

  it('laat een naam zonder dat achtervoegsel staan', () => {
    expect(shortShiftName('Opkuis', 'Theokot')).toBe('Opkuis');
    expect(shortShiftName('Broodjes smeren', '')).toBe('Broodjes smeren');
  });
});

describe('weekShiftPreview', () => {
  const start = { year: 2026, month: 11, day: 16 };

  it('vraagt niets bij een volledig nieuwe week', () => {
    const preview = weekShiftPreview({ start, offsets: [0, 1, 2, 3, 4], sessions: [], otherShiftsByDay: {} });

    expect(preview.needsConfirm).toBe(false);
    expect(preview.days.map((day) => [day.key, day.defaultChecked])).toEqual([
      ['2026-11-16', true],
      ['2026-11-17', true],
      ['2026-11-18', true],
      ['2026-11-19', true],
      ['2026-11-20', true],
    ]);
  });

  it('vult een bestaande dag zonder shiften aan en laat een dag met shiften staan', () => {
    const preview = weekShiftPreview({
      start,
      offsets: [0, 1],
      sessions: [
        { dateValue: '2026-11-16', shiftCount: 3 },
        { dateValue: '2026-11-17', shiftCount: 0 },
      ],
      otherShiftsByDay: {},
    });

    expect(preview.needsConfirm).toBe(true);
    expect(preview.days[0]).toMatchObject({ exists: true, canAdd: false, defaultChecked: false });
    expect(preview.days[1]).toMatchObject({ exists: true, canAdd: true, defaultChecked: true });
  });

  it('vinkt een dag met andere Theokot-shiften standaard uit', () => {
    const preview = weekShiftPreview({
      start,
      offsets: [2],
      sessions: [],
      otherShiftsByDay: { '2026-11-18': 2 },
    });

    expect(preview.needsConfirm).toBe(true);
    expect(preview.days[0]).toMatchObject({ exists: false, otherShifts: 2, canAdd: true, defaultChecked: false });
  });

  it('telt vanaf de ingevulde startdag, net als de server', () => {
    const preview = weekShiftPreview({
      start: { year: 2026, month: 11, day: 18 },
      offsets: [0],
      sessions: [],
      otherShiftsByDay: {},
    });
    expect(preview.days[0].key).toBe('2026-11-18');
  });
});
