'use client';

import { AdminNav, type AdminNavNode } from '@vtk/ui';
import { LogisticsIcon } from '@/components/logistics-icon';

const nodes: AdminNavNode[] = [
  {
    type: 'item',
    item: { key: 'overview', href: '/beheer', label: 'Overzicht', exact: true },
  },
  {
    type: 'item',
    item: { key: 'events', href: '/beheer/evenementen', label: 'Evenementen' },
  },
  {
    type: 'item',
    item: { key: 'requests', href: '/beheer/aanvragen', label: 'Aanvragen' },
  },
  {
    // exact: /beheer/vervoer/week (Transportplanning) heeft zijn eigen
    // hoofdnavigatie-item; zonder exact zou dat subpad ook "Ritten" als
    // actief markeren, wat de twee juist verwarrend naast elkaar zet.
    type: 'item',
    item: { key: 'trips', href: '/beheer/vervoer', label: 'Ritten', exact: true },
  },
  {
    type: 'item',
    item: { key: 'drinks', href: '/beheer/flesserke', label: 'Flesserke' },
  },
  {
    type: 'item',
    item: { key: 'calendar', href: '/beheer/kalender', label: 'Kalender' },
  },
  {
    type: 'item',
    item: { key: 'transportplanning', href: '/beheer/vervoer/week', label: 'Transportplanning' },
  },
  {
    type: 'group',
    key: 'other',
    label: 'Overig',
    items: [
      { key: 'inventory', href: '/beheer/materiaal', label: 'Inventaris' },
      { key: 'templates', href: '/beheer/sjablonen', label: 'Sjablonen' },
      { key: 'drivers', href: '/beheer/chauffeurs', label: 'Chauffeurs' },
      // Collect&Go stond onder "Uitleen" en verhuist mee naar Overig: het is
      // net als Sjablonen en Instellingen een incidenteel beheerschermpje
      // (een bestelling importeren, geen dagelijkse werklijst), niet iets dat
      // op het hoofdniveau naast Ritten en Flesserke moet staan.
      { key: 'collectengo', href: '/beheer/collectengo', label: 'Collect&Go' },
      { key: 'texts', href: '/beheer/teksten', label: 'Teksten' },
      { key: 'settings', href: '/beheer/instellingen', label: 'Instellingen' },
    ],
  },
];

const icons = {
  overview: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  requests: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  events: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  inventory: <LogisticsIcon name="material" className="h-4 w-4 shrink-0" />,
  templates: <LogisticsIcon name="edit" className="h-4 w-4 shrink-0" />,
  drinks: <LogisticsIcon name="material" className="h-4 w-4 shrink-0" />,
  collectengo: <LogisticsIcon name="van" className="h-4 w-4 shrink-0" />,
  trips: <LogisticsIcon name="van" className="h-4 w-4 shrink-0" />,
  transportplanning: <LogisticsIcon name="van" className="h-4 w-4 shrink-0" />,
  drivers: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  other: <LogisticsIcon name="edit" className="h-4 w-4 shrink-0" />,
  calendar: <LogisticsIcon name="reservation" className="h-4 w-4 shrink-0" />,
  texts: <LogisticsIcon name="edit" className="h-4 w-4 shrink-0" />,
  settings: <LogisticsIcon name="edit" className="h-4 w-4 shrink-0" />,
};

export function BeheerNav() {
  return <AdminNav title="Beheer" nodes={nodes} icons={icons} />;
}
