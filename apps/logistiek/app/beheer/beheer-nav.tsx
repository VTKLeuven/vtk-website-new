'use client';

import { AdminNav, type AdminNavNode } from '@vtk/ui';
import { LogisticsIcon } from '@/components/logistics-icon';

const nodes: AdminNavNode[] = [
  {
    type: 'item',
    item: { key: 'overview', href: '/beheer', label: 'Overzicht', exact: true },
  },
  {
    type: 'group',
    key: 'loans',
    label: 'Uitleen',
    items: [
      { key: 'requests', href: '/beheer/aanvragen', label: 'Aanvragen' },
      { key: 'events', href: '/beheer/evenementen', label: 'Evenementen' },
      { key: 'inventory', href: '/beheer/materiaal', label: 'Inventaris' },
      { key: 'templates', href: '/beheer/sjablonen', label: 'Sjablonen' },
      { key: 'drinks', href: '/beheer/flesserke', label: 'Flesserke' },
      { key: 'collectengo', href: '/beheer/collectengo', label: 'Collect&Go' },
    ],
  },
  {
    type: 'group',
    key: 'transport',
    label: 'Vervoer',
    items: [
      { key: 'trips', href: '/beheer/vervoer', label: 'Ritten' },
      { key: 'drivers', href: '/beheer/chauffeurs', label: 'Chauffeurs' },
    ],
  },
  {
    type: 'group',
    key: 'other',
    label: 'Overig',
    items: [
      { key: 'calendar', href: '/beheer/kalender', label: 'Kalender' },
      { key: 'texts', href: '/beheer/teksten', label: 'Teksten' },
      { key: 'settings', href: '/beheer/instellingen', label: 'Instellingen' },
    ],
  },
];

const icons = {
  overview: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  loans: <LogisticsIcon name="material" className="h-4 w-4 shrink-0" />,
  requests: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  events: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  inventory: <LogisticsIcon name="material" className="h-4 w-4 shrink-0" />,
  templates: <LogisticsIcon name="edit" className="h-4 w-4 shrink-0" />,
  drinks: <LogisticsIcon name="material" className="h-4 w-4 shrink-0" />,
  collectengo: <LogisticsIcon name="van" className="h-4 w-4 shrink-0" />,
  transport: <LogisticsIcon name="van" className="h-4 w-4 shrink-0" />,
  trips: <LogisticsIcon name="van" className="h-4 w-4 shrink-0" />,
  drivers: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  other: <LogisticsIcon name="edit" className="h-4 w-4 shrink-0" />,
  calendar: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  texts: <LogisticsIcon name="edit" className="h-4 w-4 shrink-0" />,
  settings: <LogisticsIcon name="edit" className="h-4 w-4 shrink-0" />,
};

export function BeheerNav() {
  return <AdminNav title="Beheer" nodes={nodes} icons={icons} />;
}
