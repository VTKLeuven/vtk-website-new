import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthGroup, SessionPayload } from '@vtk/auth';
import { postAdminLinks } from '@/lib/postAdminLinks';

function group(code: string): AuthGroup {
  return {
    id: `id-${code}`,
    code,
    slug: code.toLowerCase(),
    nameNl: code,
    nameEn: code,
    role: 'MEMBER',
    type: 'PRAESIDIUM',
  };
}

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    token: 'token',
    expiresAt: new Date(0).toISOString(),
    user: {
      id: 'lid',
      email: 'lid@example.test',
      name: 'Lid',
      avatarKey: null,
      locale: 'NL',
      isSuperAdmin: false,
      onboarded: true,
      studyConfirmedYear: 2026,
    },
    permissions: [],
    roleIds: [],
    groups: [],
    ...overrides,
  };
}

const original = process.env.LOGISTIEK_PUBLIC_URL;

beforeEach(() => {
  process.env.LOGISTIEK_PUBLIC_URL = 'https://logistiek.dev.vtk.be';
});

afterEach(() => {
  if (original === undefined) delete process.env.LOGISTIEK_PUBLIC_URL;
  else process.env.LOGISTIEK_PUBLIC_URL = original;
});

describe('postAdminLinks', () => {
  it('toont niets voor een gewoon lid en niets zonder sessie', () => {
    expect(postAdminLinks(session())).toEqual([]);
    expect(postAdminLinks(null)).toEqual([]);
  });

  it('linkt naar het uitleenbeheer op de host van de omgeving', () => {
    const links = postAdminLinks(session({ groups: [group('LOGISTIEK')] }));
    expect(links).toEqual([
      { key: 'logistiek', label: 'Logistiek Beheer', href: 'https://logistiek.dev.vtk.be/beheer' },
    ]);
  });

  it('laat geen dubbele slash achter wanneer de omgeving er een heeft staan', () => {
    process.env.LOGISTIEK_PUBLIC_URL = 'https://logistiek.vtk.be/';
    const links = postAdminLinks(session({ groups: [group('LOGISTIEK')] }));
    expect(links[0]?.href).toBe('https://logistiek.vtk.be/beheer');
  });

  it('zwijgt over logistiek zolang de omgeving geen adres kent', () => {
    // Een menu-item naar een adres dat we niet kennen, is erger dan geen item.
    delete process.env.LOGISTIEK_PUBLIC_URL;
    expect(postAdminLinks(session({ groups: [group('LOGISTIEK')] }))).toEqual([]);
  });

  it('geeft career en cudi op lidmaatschap van de post', () => {
    const links = postAdminLinks(
      session({ groups: [group('BEDRIJVENRELATIES'), group('CURSUSDIENST')] })
    );
    expect(links.map((link) => link.href)).toEqual([
      'https://career.vtk.be/admin',
      'https://cudi.vtk.be/vtk/admin',
    ]);
  });

  it('geeft geen career-link aan een andere post', () => {
    expect(postAdminLinks(session({ groups: [group('SPORT')] }))).toEqual([]);
  });

  it('houdt het menu leeg voor wie de post niet is, ook met de permissie erbij', () => {
    // De reden dat dit op lidmaatschap hangt: `logistiek.manage` en superadmin
    // dekken ook Groep 5 en IT, en die openen het uitleenbeheer nooit.
    expect(postAdminLinks(session({ permissions: ['logistiek.manage'] }))).toEqual([]);
    expect(
      postAdminLinks(
        session({ user: { ...session().user, isSuperAdmin: true }, groups: [group('IT')] })
      )
    ).toEqual([]);
  });
});
