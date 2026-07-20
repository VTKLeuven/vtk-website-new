'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/beheer', label: 'Overzicht' },
  { href: '/beheer/aanvragen', label: 'Aanvragen' },
  { href: '/beheer/vervoer', label: 'Vervoer' },
  { href: '/beheer/materiaal', label: 'Inventaris' },
  { href: '/beheer/flesserke', label: 'Flesserke' },
  { href: '/beheer/kalender', label: 'Kalender' },
  { href: '/beheer/instellingen', label: 'Instellingen' },
];

export function BeheerNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-1 text-sm" aria-label="Beheernavigatie">
      {NAV.map((item) => {
        const active = item.href === '/beheer' ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={active
              ? 'rounded-[10px] bg-vtk-navy px-3.5 py-2 font-semibold text-white shadow-sm'
              : 'rounded-[10px] px-3.5 py-2 font-medium text-vtk-body transition hover:bg-vtk-paper hover:text-vtk-ink'}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
