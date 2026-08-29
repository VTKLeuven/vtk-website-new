'use client';

import { AdminNav, type AdminNavNode } from '@vtk/ui';
import { ElixirIcon } from '@/components/elixir-icon';

/**
 * Dezelfde zijbalk als in de uitleendienst: op desktop een gegroepeerde lijst,
 * onder 860px één knop die het huidige onderdeel benoemt en de volledige lijst
 * eronder opent. Bouw hier geen bijna-kopie van (CLAUDE.md); dit is `AdminNav`
 * uit `@vtk/ui`.
 */
const nodes: AdminNavNode[] = [
  { type: 'item', item: { key: 'dashboard', href: '/admin', label: 'Overzicht', exact: true } },
  { type: 'item', item: { key: 'evenings', href: '/admin/avondtelling', label: 'Avondtelling' } },
  { type: 'item', item: { key: 'stock', href: '/admin/stocktelling', label: 'Stocktelling' } },
  { type: 'item', item: { key: 'specials', href: '/admin/specials', label: 'Specials' } },
  { type: 'item', item: { key: 'weeks', href: '/admin/weekoverzicht', label: 'Weekoverzicht' } },
  { type: 'item', item: { key: 'stats', href: '/admin/statistieken', label: 'Statistieken' } },
  { type: 'item', item: { key: 'photos', href: '/admin/fotos', label: "Foto's" } },
  { type: 'item', item: { key: 'takedowns', href: '/admin/verwijderverzoeken', label: 'Verwijderverzoeken' } },
  {
    type: 'group',
    key: 'config',
    label: 'Configuratie',
    items: [
      { key: 'menu', href: '/admin/instellingen', label: 'Drankkaart', exact: true },
      { key: 'hours', href: '/admin/instellingen/openingsuren', label: 'Openingsuren' },
      { key: 'rental', href: '/admin/instellingen/verhuur', label: 'Verhuur' },
    ],
  },
];

const icons = {
  dashboard: <ElixirIcon name="dashboard" className="h-4 w-4 shrink-0" />,
  evenings: <ElixirIcon name="cash" className="h-4 w-4 shrink-0" />,
  stock: <ElixirIcon name="stock" className="h-4 w-4 shrink-0" />,
  specials: <ElixirIcon name="beer" className="h-4 w-4 shrink-0" />,
  weeks: <ElixirIcon name="calendar" className="h-4 w-4 shrink-0" />,
  stats: <ElixirIcon name="dashboard" className="h-4 w-4 shrink-0" />,
  photos: <ElixirIcon name="photo" className="h-4 w-4 shrink-0" />,
  config: <ElixirIcon name="settings" className="h-4 w-4 shrink-0" />,
  menu: <ElixirIcon name="menu" className="h-4 w-4 shrink-0" />,
  hours: <ElixirIcon name="clock" className="h-4 w-4 shrink-0" />,
  rental: <ElixirIcon name="venue" className="h-4 w-4 shrink-0" />,
};

export function FakbarAdminNav() {
  return <AdminNav title="Beheer" nodes={nodes} icons={icons} />;
}
