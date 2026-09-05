import { describe, expect, it } from 'vitest';
import { conflictPartners } from '../lib/transport-conflicts';

const trip = (
  id: string,
  vehicleId: string,
  from: string,
  to: string,
  status = 'APPROVED'
) => ({ id, vehicleId, status, startAt: new Date(from), endAt: new Date(to) });

describe('conflictPartners', () => {
  it('laat aansluitende ritten met rust', () => {
    // Een rit die om 12:00 eindigt, laat de kar om 12:00 vrij. Dezelfde regel als
    // `momentsOverlap`, waar de goedkeuring mee rekent; liepen die twee uit
    // elkaar, dan zou de kalender rood kleuren wat de validatie net toeliet.
    const out = conflictPartners([
      trip('a', 'kar', '2026-09-05T10:00:00Z', '2026-09-05T12:00:00Z'),
      trip('b', 'kar', '2026-09-05T12:00:00Z', '2026-09-05T14:00:00Z'),
    ]);
    expect(out.size).toBe(0);
  });

  it('koppelt twee botsende ritten aan elkaar', () => {
    const out = conflictPartners([
      trip('a', 'kar', '2026-09-05T10:00:00Z', '2026-09-05T13:00:00Z'),
      trip('b', 'kar', '2026-09-05T12:00:00Z', '2026-09-05T14:00:00Z'),
    ]);
    expect(out.get('a')).toEqual(['b']);
    expect(out.get('b')).toEqual(['a']);
  });

  it('ziet ook een rit die volledig in een andere valt', () => {
    const out = conflictPartners([
      trip('lang', 'kar', '2026-09-05T08:00:00Z', '2026-09-05T20:00:00Z'),
      trip('kort', 'kar', '2026-09-05T10:00:00Z', '2026-09-05T11:00:00Z'),
    ]);
    expect(out.get('kort')).toEqual(['lang']);
  });

  it('telt drie ritten op hetzelfde moment als elkaars partners', () => {
    // Drie forceerbare botsingen op elkaar: het paneel moet ze alle drie kunnen
    // noemen, want anders schuif je er een weg en blijf je met de andere zitten.
    const out = conflictPartners([
      trip('a', 'kar', '2026-09-05T10:00:00Z', '2026-09-05T14:00:00Z'),
      trip('b', 'kar', '2026-09-05T11:00:00Z', '2026-09-05T12:00:00Z'),
      trip('c', 'kar', '2026-09-05T13:00:00Z', '2026-09-05T15:00:00Z'),
    ]);
    expect(out.get('a')).toEqual(['b', 'c']);
    expect(out.get('b')).toEqual(['a']);
  });

  it('houdt voertuigen uit elkaar', () => {
    const out = conflictPartners([
      trip('a', 'kar', '2026-09-05T10:00:00Z', '2026-09-05T14:00:00Z'),
      trip('b', 'auto', '2026-09-05T10:00:00Z', '2026-09-05T14:00:00Z'),
    ]);
    expect(out.size).toBe(0);
  });

  it('negeert wat nog niet goedgekeurd is', () => {
    // Een aanvraag houdt het voertuig niet bezet; ze mag botsen tot iemand
    // erover beslist.
    const out = conflictPartners([
      trip('a', 'kar', '2026-09-05T10:00:00Z', '2026-09-05T14:00:00Z'),
      trip('b', 'kar', '2026-09-05T10:00:00Z', '2026-09-05T14:00:00Z', 'REQUESTED'),
      trip('c', 'kar', '2026-09-05T10:00:00Z', '2026-09-05T14:00:00Z', 'CANCELLED'),
    ]);
    expect(out.size).toBe(0);
  });
});
