'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * De beheernavigatie, per onderwerp gegroepeerd. Negen losse tegels op één rij
 * lezen als een opsomming waarin je "Chauffeurs" alleen vindt als je al weet dat
 * het bestaat; onder een kopje "Vervoer" staat het naast Ritten, waar je het
 * zoekt.
 */
const NAV_GROUPS: Array<{ label: string | null; items: Array<{ href: string; label: string }> }> = [
  { label: null, items: [{ href: '/beheer', label: 'Overzicht' }] },
  {
    label: 'Uitleen',
    items: [
      { href: '/beheer/aanvragen', label: 'Aanvragen' },
      { href: '/beheer/evenementen', label: 'Evenementen' },
      { href: '/beheer/materiaal', label: 'Inventaris' },
      { href: '/beheer/flesserke', label: 'Flesserke' },
    ],
  },
  {
    label: 'Vervoer',
    items: [
      { href: '/beheer/vervoer', label: 'Ritten' },
      { href: '/beheer/chauffeurs', label: 'Chauffeurs' },
    ],
  },
  {
    label: 'Overig',
    items: [
      { href: '/beheer/kalender', label: 'Kalender' },
      { href: '/beheer/teksten', label: 'Teksten' },
      { href: '/beheer/instellingen', label: 'Instellingen' },
    ],
  },
];

export function BeheerNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-2 py-1.5 text-sm"
      aria-label="Beheernavigatie"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.label ?? 'start'} className="flex flex-wrap items-center gap-1">
          {group.label ? (
            <span className="pl-1 pr-0.5 text-[11px] font-semibold uppercase tracking-wide text-vtk-muted">
              {group.label}
            </span>
          ) : null}
          {group.items.map((item) => {
            const active =
              item.href === '/beheer' ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'rounded-[10px] bg-vtk-navy px-3.5 py-2 font-semibold text-white shadow-sm'
                    : 'rounded-[10px] px-3.5 py-2 font-medium text-vtk-body transition hover:bg-vtk-paper hover:text-vtk-ink'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
