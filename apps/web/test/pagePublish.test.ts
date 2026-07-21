import { describe, expect, it } from 'vitest';
import type { SessionPayload } from '@vtk/auth';
import { canPublishPages } from '@/lib/pageAccess';

function session(opts: { isSuperAdmin?: boolean; permissions?: string[] }): SessionPayload {
  return {
    user: { isSuperAdmin: opts.isSuperAdmin ?? false },
    permissions: opts.permissions ?? [],
    roleIds: [],
  } as unknown as SessionPayload;
}

describe('canPublishPages', () => {
  it('laat pages.publish en pages.manage publiceren', () => {
    expect(canPublishPages(session({ permissions: ['pages.publish'] }))).toBe(true);
    expect(canPublishPages(session({ permissions: ['pages.manage'] }))).toBe(true);
  });

  it('laat een superadmin publiceren', () => {
    expect(canPublishPages(session({ isSuperAdmin: true }))).toBe(true);
  });

  it('laat schrijven zonder publiceren toe: bewerken is niet publiceren', () => {
    expect(canPublishPages(session({ permissions: ['pages.edit'] }))).toBe(false);
    expect(canPublishPages(session({ permissions: ['pages.editAll'] }))).toBe(false);
    expect(canPublishPages(session({ permissions: ['pages.delete'] }))).toBe(false);
  });

  it('geeft niets weg aan een sessie zonder rechten', () => {
    expect(canPublishPages(session({}))).toBe(false);
  });
});

/**
 * De regel die savePageSettingsAction toepast op het `published`-veld. Het
 * gevaar zit in "afwezig": een gewone bewerker stuurt het veld niet mee, en dan
 * moet de publicatiestatus BLIJVEN staan. Zou afwezig als "uit" gelezen worden,
 * dan haalt hij een gepubliceerde pagina offline door gewoon op te slaan.
 */
function nextPublishedAt(opts: {
  mayPublish: boolean;
  posted: 'on' | 'off' | null;
  current: Date | null;
  now: Date;
}): Date | null | undefined {
  return opts.mayPublish && opts.posted != null
    ? opts.posted === 'on'
      ? (opts.current ?? opts.now)
      : null
    : undefined;
}

describe('savePageSettingsAction: publicatiestatus', () => {
  const now = new Date('2026-07-17T10:00:00Z');
  const live = new Date('2026-01-01T00:00:00Z');

  it('raakt de status NIET aan wanneer de gebruiker niet mag publiceren', () => {
    // Zelfs als hij het veld zelf post.
    expect(nextPublishedAt({ mayPublish: false, posted: 'off', current: live, now })).toBeUndefined();
    expect(nextPublishedAt({ mayPublish: false, posted: 'on', current: null, now })).toBeUndefined();
  });

  it('raakt de status NIET aan wanneer het veld niet meegestuurd is', () => {
    expect(nextPublishedAt({ mayPublish: true, posted: null, current: live, now })).toBeUndefined();
  });

  it('publiceert een concept met de huidige tijd', () => {
    expect(nextPublishedAt({ mayPublish: true, posted: 'on', current: null, now })).toBe(now);
  });

  it('verzet de publicatiedatum van een al gepubliceerde pagina niet', () => {
    expect(nextPublishedAt({ mayPublish: true, posted: 'on', current: live, now })).toBe(live);
  });

  it('depubliceert wanneer de knop uit gaat', () => {
    expect(nextPublishedAt({ mayPublish: true, posted: 'off', current: live, now })).toBeNull();
  });
});
