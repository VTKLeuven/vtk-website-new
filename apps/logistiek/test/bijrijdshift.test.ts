import { describe, expect, it } from 'vitest';
import {
  TRIP_SHIFT_PLACES,
  mayCreateTripShift,
  mayRemoveTripShift,
  parseTripShiftInput,
  shiftMatchesTrip,
  tripShiftData,
  type TripForShift,
} from '@/lib/bijrijdshift';

const trip: TripForShift = {
  id: 'rit-1',
  purpose: 'Statafels naar het sportgala',
  startAt: new Date('2026-11-26T17:30:00Z'),
  endAt: new Date('2026-11-26T19:00:00Z'),
  pickupAddress: 'Kapucijnenvoer 2',
  destination: 'Sportoase',
  vehicle: { nameNl: 'Kar', nameEn: 'Van' },
  group: { code: 'SPORT', nameNl: 'Sport', nameEn: 'Sports' },
};

describe('parseTripShiftInput', () => {
  it('neemt plaatsen en bonnetjes binnen de grenzen aan', () => {
    expect(parseTripShiftInput({ places: 2, reward: 1 })).toEqual({ ok: true, value: { places: 2, reward: 1 } });
    expect(parseTripShiftInput({ places: '1', reward: '0' })).toEqual({ ok: true, value: { places: 1, reward: 0 } });
  });

  it('geeft een fout terug in plaats van te gooien', () => {
    expect(parseTripShiftInput({ places: 0, reward: 1 }).ok).toBe(false);
    expect(parseTripShiftInput({ places: TRIP_SHIFT_PLACES.max + 1, reward: 1 }).ok).toBe(false);
    expect(parseTripShiftInput({ places: 1.5, reward: 1 }).ok).toBe(false);
    expect(parseTripShiftInput({ places: 1, reward: -1 }).ok).toBe(false);
    expect(parseTripShiftInput(null).ok).toBe(false);
  });
});

describe('tripShiftData', () => {
  it('neemt de uren, de post en de vertrekplaats van de rit over', () => {
    const data = tripShiftData(trip, { places: 2, reward: 1 });
    expect(data.startTime).toEqual(trip.startAt);
    expect(data.endTime).toEqual(trip.endAt);
    expect(data.post).toBe('SPORT');
    expect(data.transportBookingId).toBe('rit-1');
    expect(data.location).toBe('Kapucijnenvoer 2');
    expect(data.maxParticipants).toBe(2);
    expect(data.reward).toBe(1);
    expect(data.name).toBe('Bijrijden: Statafels naar het sportgala');
    expect(data.nameEn).toBe('Ride along: Statafels naar het sportgala');
    expect(data.description).toContain('voor Sport, naar Sportoase');
  });

  it('valt terug op de bestemming, en zonder post telt de shift voor niemand', () => {
    const data = tripShiftData({ ...trip, pickupAddress: null, group: null }, { places: 1, reward: 0 });
    expect(data.location).toBe('Sportoase');
    expect(data.post).toBeNull();
    expect(data.description).not.toContain(' voor ');
  });

  it('heeft altijd een vertrekplaats, want vtk.be vraagt er een', () => {
    const data = tripShiftData({ ...trip, pickupAddress: '  ', destination: null }, { places: 1, reward: 0 });
    expect(data.location).toBe('Uitleendienst');
  });
});

describe('shiftMatchesTrip', () => {
  it('ziet een verschoven rit', () => {
    const shift = { startAt: '2026-11-26T17:30:00.000Z', endAt: '2026-11-26T19:00:00.000Z' };
    expect(shiftMatchesTrip(shift, trip)).toBe(true);
    expect(shiftMatchesTrip(shift, { ...trip, endAt: new Date('2026-11-26T19:30:00Z') })).toBe(false);
  });
});

describe('mayCreateTripShift', () => {
  const ofSport = { userId: 'rit-van-iemand-anders', groupId: 'sport' };
  it('het team, de aanvrager en de leden van de aanvragende post', () => {
    expect(mayCreateTripShift({ userId: 'x', groupIds: [], manages: true }, ofSport)).toBe(true);
    expect(mayCreateTripShift({ userId: 'rit-van-iemand-anders', groupIds: [], manages: false }, ofSport)).toBe(true);
    expect(mayCreateTripShift({ userId: 'x', groupIds: ['sport'], manages: false }, ofSport)).toBe(true);
  });

  it('een andere post niet, ook niet zonder post op de rit', () => {
    expect(mayCreateTripShift({ userId: 'x', groupIds: ['cultuur'], manages: false }, ofSport)).toBe(false);
    expect(mayCreateTripShift({ userId: 'x', groupIds: ['cultuur'], manages: false }, { userId: 'y', groupId: null })).toBe(false);
  });
});

describe('mayRemoveTripShift', () => {
  const tripStartAt = '2026-11-26T17:30:00.000Z';
  const before = new Date('2026-11-26T12:00:00Z');
  const after = new Date('2026-11-26T20:00:00Z');

  it('tot de rit vertrekt altijd, ook met leden erop: dan is het een vergissing', () => {
    expect(mayRemoveTripShift({ tripStartAt, participants: 0 }, before)).toBe(true);
    expect(mayRemoveTripShift({ tripStartAt, participants: 2 }, before)).toBe(true);
  });

  it('na vertrek blijft een shift met leden staan, voor hun bonnetjes', () => {
    expect(mayRemoveTripShift({ tripStartAt, participants: 1 }, after)).toBe(false);
    expect(mayRemoveTripShift({ tripStartAt, participants: 1 }, new Date(tripStartAt))).toBe(false);
  });

  it('een lege shift mag na vertrek nog weg', () => {
    expect(mayRemoveTripShift({ tripStartAt, participants: 0 }, after)).toBe(true);
  });
});
