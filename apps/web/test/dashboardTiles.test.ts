import { describe, expect, it } from 'vitest';
import type { SessionPayload } from '@vtk/auth';
import {
  TILE_ICONS,
  TILE_ICON_CATEGORIES,
  groupTilesBySource,
  isTileImageKey,
  mergeTiles,
} from '@/lib/dashboard-tiles';
import {
  canManageAnySharedDashboardTile,
  canManageSharedDashboardTile,
} from '@/lib/dashboard-authorization';

type SharedArgs = Parameters<typeof mergeTiles>[0];
type PrefArgs = Parameters<typeof mergeTiles>[1];
type PersonalArgs = Parameters<typeof mergeTiles>[2];

function shared(over: Partial<SharedArgs[number]> = {}): SharedArgs[number] {
  return {
    id: 'g1',
    label: 'Drive',
    url: 'https://drive.google.com',
    icon: 'cloud',
    color: 'blue',
    imageKey: null,
    order: 0,
    scope: 'GLOBAL',
    groupId: null,
    ...over,
  };
}

function pref(over: Partial<PrefArgs[number]> = {}): PrefArgs[number] {
  return {
    tileId: 'g1',
    hidden: false,
    order: null,
    label: null,
    url: null,
    icon: null,
    color: null,
    imageKey: null,
    imageCleared: false,
    ...over,
  };
}

function personal(over: Partial<PersonalArgs[number]> = {}): PersonalArgs[number] {
  return {
    id: 'p1',
    label: 'Toledo',
    url: 'https://toledo.kuleuven.be',
    icon: 'graduation',
    color: 'blue',
    imageKey: null,
    order: 50,
    ...over,
  };
}

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    token: 'token',
    expiresAt: new Date(0).toISOString(),
    user: {
      id: 'user',
      email: 'user@example.test',
      name: 'User',
      avatarKey: null,
      locale: 'NL',
      isSuperAdmin: false,
      onboarded: true,
      studyConfirmedYear: 2026,
      googleLinked: true,
      googleLinkDeferredAt: null,
    },
    permissions: [],
    roleIds: [],
    groups: [],
    ...overrides,
  };
}

const ownGroup = {
  id: 'group-a',
  code: 'A',
  slug: 'a',
  nameNl: 'Post A',
  nameEn: 'Post A',
  role: 'MEMBER' as const,
  type: 'PRAESIDIUM' as const,
};

describe('beheerrechten voor gedeelde dashboardtegels', () => {
  it('houdt globaal beheer beperkt tot tegels voor iedereen', () => {
    const actor = session({ permissions: ['dashboard.manage'], groups: [ownGroup] });
    expect(canManageSharedDashboardTile(actor, { scope: 'GLOBAL', groupId: null })).toBe(true);
    expect(canManageSharedDashboardTile(actor, { scope: 'GROUP', groupId: ownGroup.id })).toBe(false);
  });

  it('houdt postbeheer beperkt tot de eigen post', () => {
    const actor = session({ permissions: ['dashboard.manageOwn'], groups: [ownGroup] });
    expect(canManageAnySharedDashboardTile(actor)).toBe(true);
    expect(canManageSharedDashboardTile(actor, { scope: 'GLOBAL', groupId: null })).toBe(false);
    expect(canManageSharedDashboardTile(actor, { scope: 'GROUP', groupId: ownGroup.id })).toBe(true);
    expect(canManageSharedDashboardTile(actor, { scope: 'GROUP', groupId: 'group-b' })).toBe(false);
  });

  it('laat een superadmin beide bereiken beheren', () => {
    const actor = session({ user: { ...session().user, isSuperAdmin: true } });
    expect(canManageSharedDashboardTile(actor, { scope: 'GLOBAL', groupId: null })).toBe(true);
    expect(canManageSharedDashboardTile(actor, { scope: 'GROUP', groupId: 'group-b' })).toBe(true);
  });
});

describe('afbeelding op een dashboardtegel', () => {
  it('erft de afbeelding van de standaardtegel wanneer er geen override is', () => {
    const [tile] = mergeTiles([shared({ imageKey: 'tiles/abc.png' })], [], []);
    expect(tile.imageKey).toBe('tiles/abc.png');
    expect(tile.overridden).toBe(false);
  });

  it('laat een eigen afbeelding winnen van die van de standaardtegel', () => {
    const [tile] = mergeTiles(
      [shared({ imageKey: 'tiles/standaard.png' })],
      [pref({ imageKey: 'tiles/eigen.png' })],
      []
    );
    expect(tile.imageKey).toBe('tiles/eigen.png');
    expect(tile.overridden).toBe(true);
  });

  it('toont het pictogram wanneer het lid de afbeelding bewust weghaalde', () => {
    // Zonder de imageCleared-vlag zou null hier "erf de standaard" betekenen en
    // bleef het logo staan, wat eruitziet alsof verwijderen niet werkt.
    const [tile] = mergeTiles(
      [shared({ imageKey: 'tiles/standaard.png' })],
      [pref({ imageCleared: true })],
      []
    );
    expect(tile.imageKey).toBeNull();
    expect(tile.overridden).toBe(true);
  });

  it('aanvaardt enkel storage-keys uit het tiles-prefix', () => {
    expect(isTileImageKey('tiles/abc.png')).toBe(true);
    expect(isTileImageKey('images/geheim.jpg')).toBe(false);
    expect(isTileImageKey('logos/partner.png')).toBe(false);
  });
});

describe('secties per herkomst', () => {
  const tiles = mergeTiles(
    [
      shared({ id: 'g1', label: 'Drive', order: 0 }),
      shared({ id: 'g2', label: 'Wiki', order: 1 }),
      shared({
        id: 'it1',
        label: 'Repository',
        order: 2,
        scope: 'GROUP',
        groupId: 'grp-it',
        groupLabel: 'IT',
      }),
      shared({
        id: 'cudi1',
        label: 'Cursusdrive',
        order: 3,
        scope: 'GROUP',
        groupId: 'grp-cudi',
        groupLabel: 'Cursusdienst',
      }),
    ],
    [],
    [personal()]
  );

  it('splitst globaal, per post en persoonlijk uit elkaar', () => {
    const sections = groupTilesBySource(tiles);
    expect(sections.map((s) => [s.kind, s.groupLabel ?? null])).toEqual([
      ['global', null],
      ['group', 'Cursusdienst'],
      ['group', 'IT'],
      ['own', null],
    ]);
    expect(sections[0].tiles.map((t) => t.label)).toEqual(['Drive', 'Wiki']);
    expect(sections[3].tiles.map((t) => t.label)).toEqual(['Toledo']);
  });

  it('laat een sectie zonder tegels weg', () => {
    const sections = groupTilesBySource(tiles.filter((t) => t.source === 'group'));
    expect(sections.map((s) => s.kind)).toEqual(['group', 'group']);
  });

  it('houdt de volgorde binnen een sectie aan', () => {
    const reordered = mergeTiles(
      [
        shared({ id: 'g1', label: 'Drive', order: 5 }),
        shared({ id: 'g2', label: 'Wiki', order: 1 }),
      ],
      [],
      []
    );
    const [section] = groupTilesBySource(reordered);
    expect(section.tiles.map((t) => t.label)).toEqual(['Wiki', 'Drive']);
  });
});

describe('de pictogrammenset', () => {
  it('heeft geen dubbele sleutels', () => {
    const keys = TILE_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('deelt elk pictogram in bij een bestaande categorie', () => {
    const cats = new Set(TILE_ICON_CATEGORIES.map((c) => c.key));
    for (const icon of TILE_ICONS) expect(cats.has(icon.cat)).toBe(true);
  });
});
