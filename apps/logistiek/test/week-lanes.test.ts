import { describe, expect, it } from 'vitest';
import { placeForDay } from '@/lib/week-lanes';

/** Een blok van deze dag, in Belgische tijd. De testdag ligt in de zomertijd. */
function block(id: string, from: string, to: string) {
  return { id, startAt: `2026-09-10T${from}:00+02:00`, endAt: `2026-09-10T${to}:00+02:00` };
}

const day = new Date('2026-09-10T00:00:00.000Z');

describe('placeForDay', () => {
  it('legt een rit op zijn minuten van de dag', () => {
    const [placed] = placeForDay([block('a', '14:15', '17:30')], day);
    expect(placed.from).toBe(14 * 60 + 15);
    expect(placed.to).toBe(17 * 60 + 30);
    expect(placed.lane).toBe(0);
    expect(placed.lanes).toBe(1);
  });

  it('zet overlappende ritten naast elkaar', () => {
    const placed = placeForDay([block('a', '10:00', '12:00'), block('b', '11:00', '13:00')], day);
    expect(placed.map((entry) => entry.lane)).toEqual([0, 1]);
    expect(placed.every((entry) => entry.lanes === 2)).toBe(true);
  });

  it('laat aansluitende ritten op dezelfde baan', () => {
    // 10:00-12:00 en 12:00-13:00 raken elkaar niet: de tweede mag de volle
    // breedte hebben in plaats van naast een lege plek te staan.
    const placed = placeForDay([block('a', '10:00', '12:00'), block('b', '12:00', '13:00')], day);
    expect(placed.every((entry) => entry.lane === 0 && entry.lanes === 1)).toBe(true);
  });

  it('rekent de breedte per groep en niet per dag', () => {
    // Twee die overlappen in de voormiddag, één alleen in de avond. Die laatste
    // hoort niet een derde breed te worden omdat er 's morgens iets botste.
    const placed = placeForDay(
      [block('a', '09:00', '11:00'), block('b', '10:00', '12:00'), block('c', '20:00', '21:00')],
      day
    );
    const byId = new Map(placed.map((entry) => [entry.id, entry]));
    expect(byId.get('a')!.lanes).toBe(2);
    expect(byId.get('b')!.lanes).toBe(2);
    expect(byId.get('c')!.lanes).toBe(1);
  });

  it('knipt een nachtrit op de dagrand', () => {
    const overnight = {
      id: 'nacht',
      startAt: '2026-09-10T22:00:00+02:00',
      endAt: '2026-09-11T02:00:00+02:00',
    };
    const [first] = placeForDay([overnight], day);
    expect(first.from).toBe(22 * 60);
    expect(first.to).toBe(24 * 60);
    expect(first.continuesAfter).toBe(true);
    expect(first.continuesBefore).toBe(false);

    const [second] = placeForDay([overnight], new Date('2026-09-11T00:00:00.000Z'));
    expect(second.from).toBe(0);
    expect(second.to).toBe(2 * 60);
    expect(second.continuesBefore).toBe(true);
  });

  it('houdt een rit na middernacht bij de juiste dag', () => {
    // 00:30 Belgische tijd is 22:30 UTC de dag voordien. Op de UTC-dagrand
    // belandde die rit op donderdag in plaats van op vrijdag.
    const afterMidnight = {
      id: 'laat',
      startAt: '2026-09-11T00:30:00+02:00',
      endAt: '2026-09-11T01:30:00+02:00',
    };
    expect(placeForDay([afterMidnight], day)).toEqual([]);
    const [placed] = placeForDay([afterMidnight], new Date('2026-09-11T00:00:00.000Z'));
    expect(placed.from).toBe(30);
    expect(placed.to).toBe(90);
  });

  it('laat een rit van een andere dag weg', () => {
    expect(placeForDay([block('a', '10:00', '12:00')], new Date('2026-09-12T00:00:00.000Z'))).toEqual(
      []
    );
  });
});

describe('placeForDay met een verschoven dagrand', () => {
  /** Zoals het beschikbaarheidsscherm hem doorgeeft: 05:00 (`DAG_START_UUR`). */
  const FIVE = 5 * 60;

  it('houdt een nachtvenster in de kolom van de avond ervoor', () => {
    // Het geval uit F4.2. Met een dagrand op middernacht waren dit twee stukken
    // op twee kolommen; nu is het één blok onderaan de donderdagkolom, en het
    // loopt door voorbij 1440 omdat de kolom daar ook doorloopt.
    const overnight = {
      id: 'nacht',
      startAt: '2026-09-10T22:00:00+02:00',
      endAt: '2026-09-11T02:00:00+02:00',
    };
    const placed = placeForDay([overnight], day, FIVE);
    expect(placed).toHaveLength(1);
    expect(placed[0].from).toBe(22 * 60);
    expect(placed[0].to).toBe(26 * 60);
    expect(placed[0].continuesAfter).toBe(false);
    expect(placed[0].continuesBefore).toBe(false);
  });

  it('laat dat venster weg bij de dag erna', () => {
    const overnight = {
      id: 'nacht',
      startAt: '2026-09-10T22:00:00+02:00',
      endAt: '2026-09-11T02:00:00+02:00',
    };
    expect(placeForDay([overnight], new Date('2026-09-11T00:00:00.000Z'), FIVE)).toEqual([]);
  });

  it('knipt nog altijd op de nieuwe dagrand', () => {
    // Tot 08:00 's ochtends is voorbij 05:00: dat stuk hoort bij de dag erna.
    const long = {
      id: 'lang',
      startAt: '2026-09-10T22:00:00+02:00',
      endAt: '2026-09-11T08:00:00+02:00',
    };
    const [placed] = placeForDay([long], day, FIVE);
    expect(placed.to).toBe(FIVE + 24 * 60);
    expect(placed.continuesAfter).toBe(true);

    const [next] = placeForDay([long], new Date('2026-09-11T00:00:00.000Z'), FIVE);
    expect(next.from).toBe(FIVE);
    expect(next.to).toBe(8 * 60);
    expect(next.continuesBefore).toBe(true);
  });

  it('legt een venster dat op de dagrand eindigt op het einde en niet op het begin', () => {
    const untilFive = {
      id: 'tot-vijf',
      startAt: '2026-09-11T03:00:00+02:00',
      endAt: '2026-09-11T05:00:00+02:00',
    };
    const [placed] = placeForDay([untilFive], day, FIVE);
    expect(placed.from).toBe(27 * 60);
    expect(placed.to).toBe(FIVE + 24 * 60);
  });
});
