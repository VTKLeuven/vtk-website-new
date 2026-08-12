'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * De beheernavigatie: vier tabs, en de tab die je opent toont zijn pagina's op
 * een tweede rij eronder.
 *
 * Twaalf losse tegels op één rij lezen als een opsomming waarin je "Chauffeurs"
 * alleen vindt als je al weet dat het bestaat. Ze groeperen hielp, maar de
 * kopjes ("UITLEEN", "VERVOER", "OVERIG") stonden als losse woordjes tussen de
 * knoppen en zagen er dan uit als kapotte knoppen.
 *
 * Nu is het een gewone tabbalk. De tab waar je in zit staat open, dus alles
 * blijft op één klik; een andere tab openen navigeert niet, het wisselt enkel de
 * onderste rij. Zo kan je rondkijken zonder de pagina te verlaten waar je aan
 * bezig bent.
 */
type NavTab = {
  key: string;
  label: string;
  /** Directe link zonder onderliggende pagina's (Overzicht). */
  href?: string;
  items?: Array<{ href: string; label: string }>;
};

const NAV_TABS: NavTab[] = [
  { key: 'overzicht', label: 'Overzicht', href: '/beheer' },
  {
    key: 'uitleen',
    label: 'Uitleen',
    items: [
      { href: '/beheer/aanvragen', label: 'Aanvragen' },
      { href: '/beheer/evenementen', label: 'Evenementen' },
      { href: '/beheer/materiaal', label: 'Inventaris' },
      { href: '/beheer/sjablonen', label: 'Sjablonen' },
      { href: '/beheer/flesserke', label: 'Flesserke' },
    ],
  },
  {
    key: 'vervoer',
    label: 'Vervoer',
    items: [
      { href: '/beheer/vervoer', label: 'Ritten' },
      { href: '/beheer/chauffeurs', label: 'Chauffeurs' },
    ],
  },
  {
    key: 'overig',
    label: 'Overig',
    items: [
      { href: '/beheer/kalender', label: 'Kalender' },
      { href: '/beheer/teksten', label: 'Teksten' },
      { href: '/beheer/instellingen', label: 'Instellingen' },
    ],
  },
];

function isCurrent(href: string, pathname: string): boolean {
  return href === '/beheer' ? pathname === href : pathname.startsWith(href);
}

/** De tab waar de huidige pagina onder valt; `null` op /beheer zelf. */
function tabForPath(pathname: string): string | null {
  const match = NAV_TABS.find((tab) => tab.items?.some((item) => isCurrent(item.href, pathname)));
  return match?.key ?? null;
}

export function BeheerNav() {
  const pathname = usePathname();
  const currentTab = tabForPath(pathname);
  const [openTab, setOpenTab] = useState<string | null>(currentTab);

  // Navigeer je naar een andere afdeling (via een link in de pagina, of terug in
  // de browser), dan volgt de balk mee in plaats van open te blijven staan op de
  // tab waar je zonet in aan het kijken was.
  useEffect(() => setOpenTab(currentTab), [currentTab]);

  const open = NAV_TABS.find((tab) => tab.key === openTab);

  return (
    <nav className="grid gap-2" aria-label="Beheernavigatie">
      <div className="flex flex-wrap items-center gap-1 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-1.5 text-sm">
        {NAV_TABS.map((tab) => {
          if (tab.href) {
            const active = isCurrent(tab.href, pathname);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'rounded-[10px] bg-vtk-navy px-4 py-2 font-semibold text-white'
                    : 'rounded-[10px] px-4 py-2 font-medium text-vtk-body transition hover:bg-vtk-paper hover:text-vtk-ink'
                }
              >
                {tab.label}
              </Link>
            );
          }
          const here = tab.key === currentTab;
          const expanded = tab.key === openTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setOpenTab(expanded ? null : tab.key)}
              aria-expanded={expanded}
              className={`flex items-center gap-1.5 rounded-[10px] px-4 py-2 transition ${
                here
                  ? 'bg-vtk-navy font-semibold text-white'
                  : expanded
                    ? 'bg-vtk-paper font-medium text-vtk-ink'
                    : 'font-medium text-vtk-body hover:bg-vtk-paper hover:text-vtk-ink'
              }`}
            >
              {tab.label}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          );
        })}
      </div>

      {open?.items ? (
        <div className="flex flex-wrap items-center gap-1 rounded-[14px] bg-vtk-paper-2/70 p-1.5 text-sm">
          {open.items.map((item) => {
            const active = isCurrent(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'rounded-[10px] bg-vtk-surface px-3.5 py-1.5 font-semibold text-vtk-ink shadow-sm'
                    : 'rounded-[10px] px-3.5 py-1.5 font-medium text-vtk-body transition hover:bg-vtk-surface/70 hover:text-vtk-ink'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
