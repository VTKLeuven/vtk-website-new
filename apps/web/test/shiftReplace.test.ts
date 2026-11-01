import { describe, expect, it } from 'vitest';
import {
  canBeReplaceable,
  canReplace,
  pickReplaced,
  shiftReplacedMail,
  visibleParticipants,
} from '@/lib/shift/replace';

// 1 november 2026 valt in werkingsjaar 2026 (kantelt op 15 juli).
const shift = { startTime: new Date('2026-11-05T20:00:00.000Z'), sourceSystem: null };
const praesidium = new Map([['praeses', new Set([2026])], ['oud', new Set([2025])]]);

describe('vervangbaar op een shift', () => {
  it('kan enkel voor wie in het praesidium zit in het werkingsjaar van de shift', () => {
    expect(canBeReplaceable('praeses', shift, praesidium)).toBe(true);
    expect(canBeReplaceable('oud', shift, praesidium)).toBe(false);
    expect(canBeReplaceable('student', shift, praesidium)).toBe(false);
  });

  it('nooit op een gespiegelde shift van de cursusdienst', () => {
    const cudi = { ...shift, sourceSystem: 'cudi' };
    expect(canBeReplaceable('praeses', cudi, praesidium)).toBe(false);
    expect(canReplace('student', cudi, praesidium)).toBe(false);
  });

  it('laat een student vervangen, een ander praesidiumlid niet', () => {
    expect(canReplace('student', shift, praesidium)).toBe(true);
    expect(canReplace('oud', shift, praesidium)).toBe(true);
    expect(canReplace('praeses', shift, praesidium)).toBe(false);
  });

  it('vervangt de laatst ingeschreven vervangbare deelnemer', () => {
    const participants = [
      { userId: 'a', replaceable: true, registeredAt: new Date('2026-10-01T10:00:00Z') },
      { userId: 'b', replaceable: false, registeredAt: new Date('2026-10-03T10:00:00Z') },
      { userId: 'c', replaceable: true, registeredAt: new Date('2026-10-02T10:00:00Z') },
    ];
    expect(pickReplaced(participants)?.userId).toBe('c');
    expect(pickReplaced(participants.filter((p) => !p.replaceable))).toBeNull();
  });

  it('toont een student de vervangbare plaats als vrij, een praesidiumlid niet', () => {
    const participants = [
      { userId: 'a', replaceable: true },
      { userId: 'b', replaceable: false },
    ];
    expect(visibleParticipants(participants, true).map((p) => p.userId)).toEqual(['b']);
    expect(visibleParticipants(participants, false)).toHaveLength(2);
  });

  it('zegt in de mail dat je niet meer moet komen', () => {
    const mail = shiftReplacedMail(
      { name: 'Wannes', locale: 'NL' },
      { name: 'Fakbar: tap', startTime: shift.startTime, endTime: new Date('2026-11-05T23:00:00.000Z'), location: 'Fakbar' },
    );
    expect(mail.subject).toBe('Je hoeft niet meer te komen: Fakbar: tap');
    expect(mail.text).toContain('hoeft niet meer te komen');
    expect(mail.html).toContain('Een student neemt je plaats in');
  });
});
