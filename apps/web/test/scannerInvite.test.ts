import { describe, expect, it } from 'vitest';
import {
  createScannerInviteToken,
  verifyScannerInviteToken,
} from '@/lib/ticketing/crypto';

/**
 * De uitnodigings-QR is een rollende code: ze leeft dertig seconden en het paneel
 * ververst ze om de twintig. Deze tests leggen vast waar die grens ligt, want dat
 * is het enige wat een screenshot waardeloos maakt.
 */
describe('uitnodigingstoken voor een scanner', () => {
  const now = new Date('2026-08-23T20:00:00.000Z');
  const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);

  it('geeft het event terug zolang de code leeft', () => {
    const token = createScannerInviteToken('event-a', later(30));
    expect(verifyScannerInviteToken(token, now)).toBe('event-a');
    expect(verifyScannerInviteToken(token, later(29))).toBe('event-a');
  });

  it('vervalt op de seconde', () => {
    const token = createScannerInviteToken('event-a', later(30));
    expect(verifyScannerInviteToken(token, later(30))).toBeNull();
    expect(verifyScannerInviteToken(token, later(31))).toBeNull();
  });

  it('weigert een geknoeide of vreemde code', () => {
    const token = createScannerInviteToken('event-a', later(30));
    const [prefix, , expires, signature] = token.split('.');
    const otherEvent = Buffer.from('event-b', 'utf8').toString('base64url');

    // Het event omwisselen breekt de handtekening: een code voor event A geeft
    // nooit toegang tot event B.
    expect(verifyScannerInviteToken(`${prefix}.${otherEvent}.${expires}.${signature}`, now)).toBeNull();
    expect(verifyScannerInviteToken(`${token}x`, now)).toBeNull();
    expect(verifyScannerInviteToken('vtkt1.abc.1.def', now)).toBeNull();
    expect(verifyScannerInviteToken('', now)).toBeNull();
  });

  it('laat de vervaltijd niet vervalsen', () => {
    const token = createScannerInviteToken('event-a', later(30));
    const [prefix, encoded, , signature] = token.split('.');
    const farFuture = Math.floor(later(86_400).getTime() / 1000).toString(36);
    expect(
      verifyScannerInviteToken(`${prefix}.${encoded}.${farFuture}.${signature}`, later(60)),
    ).toBeNull();
  });
});
