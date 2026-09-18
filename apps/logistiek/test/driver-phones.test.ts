import { describe, expect, it } from 'vitest';
import { resolveDriverPhones } from '@/lib/driver-phones';

const day = (n: number) => new Date(2026, 8, n);

describe('resolveDriverPhones', () => {
  it('neemt het nummer dat het team vastlegde, ook als er een profiel is', () => {
    const phones = resolveDriverPhones({
      team: [{ userId: 'u1', phone: '+32 470 11 11 11' }],
      profile: [{ userId: 'u1', phone: '+32 470 22 22 22' }],
      history: [{ userId: 'u1', phone: '+32 470 33 33 33', createdAt: day(5) }],
    });
    expect(phones.get('u1')).toEqual({ number: '+32 470 11 11 11', source: 'TEAM' });
  });

  it('valt terug op het profiel voor de historiek', () => {
    const phones = resolveDriverPhones({
      team: [],
      profile: [{ userId: 'u1', phone: '+32 470 22 22 22' }],
      history: [{ userId: 'u1', phone: '+32 470 33 33 33', createdAt: day(5) }],
    });
    expect(phones.get('u1')).toEqual({ number: '+32 470 22 22 22', source: 'PROFILE' });
  });

  it('gebruikt de historiek enkel wanneer er niets anders is, en dan de meest recente', () => {
    const phones = resolveDriverPhones({
      team: [],
      profile: [],
      history: [
        { userId: 'u1', phone: '+32 470 33 33 33', createdAt: day(1) },
        { userId: 'u1', phone: '+32 470 44 44 44', createdAt: day(9) },
        { userId: 'u1', phone: '+32 470 55 55 55', createdAt: day(5) },
      ],
    });
    expect(phones.get('u1')).toEqual({ number: '+32 470 44 44 44', source: 'HISTORY' });
  });

  // Een leeggemaakt veld is geen nummer: anders toont het scherm een lege link
  // en denkt het beheer dat er een nummer gekend is.
  it('slaat lege en blanco nummers over en zakt naar de volgende bron', () => {
    const phones = resolveDriverPhones({
      team: [{ userId: 'u1', phone: '   ' }],
      profile: [{ userId: 'u1', phone: null }],
      history: [{ userId: 'u1', phone: '+32 470 33 33 33', createdAt: day(5) }],
    });
    expect(phones.get('u1')).toEqual({ number: '+32 470 33 33 33', source: 'HISTORY' });
  });

  it('geeft niets terug voor wie nergens een nummer heeft', () => {
    const phones = resolveDriverPhones({
      team: [],
      profile: [{ userId: 'u2', phone: '+32 470 22 22 22' }],
      history: [],
    });
    expect(phones.has('u1')).toBe(false);
    expect(phones.size).toBe(1);
  });

  it('trimt het nummer dat bewaard wordt', () => {
    const phones = resolveDriverPhones({
      team: [{ userId: 'u1', phone: '  +32 470 11 11 11 ' }],
      profile: [],
      history: [],
    });
    expect(phones.get('u1')?.number).toBe('+32 470 11 11 11');
  });
});
