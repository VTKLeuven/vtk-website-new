'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/admin/weekoverzicht', label: 'Weekoverzicht', icon: '📅', exact: false },
  { href: '/admin/avondtelling', label: 'Avondtelling', icon: '🍺', exact: false },
  { href: '/admin/stocktelling', label: 'Stocktelling', icon: '📦', exact: false },
  { href: '/admin/instellingen', label: 'Instellingen', icon: '⚙️', exact: false },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside>
      <nav className="fakbar-admin-nav" aria-label="Beheernavigatie">
        <span className="fakbar-admin-nav-section">Beheer</span>
        {NAV.map(({ href, label, icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} data-active={String(active)}>
              <span>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
