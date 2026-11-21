'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from '@vtk/ui/link';

/**
 * De navigatie op een smal scherm: één menuknop die een navy paneel onder de
 * kop opent, zoals op vtk.be (M3 uit de audit van november 2026).
 *
 * Daarvoor schoven de links zijwaarts met een verborgen schuifbalk, en op een
 * telefoon van 390 px vielen "Flesserke", "Mijn aanvragen" en "Mijn evenementen"
 * buiten beeld zonder dat iets zei dat er meer was. De huisstijl sluit die
 * scroller uit (CLAUDE.md, "Header").
 *
 * De links komen van de server (`SiteHeader`), die weet wie er ingelogd is;
 * dit component houdt enkel open of dicht bij.
 */
export function HeaderMenu({
  links,
  labels,
}: {
  links: Array<{ href: string; label: string }>;
  labels: { open: string; close: string; nav: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(pathname);

  // Navigeren sluit het menu: anders ligt het paneel over de nieuwe pagina.
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="nav-menu-trigger"
        aria-expanded={open}
        aria-controls="site-menu-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
        <span>{open ? labels.close : labels.open}</span>
      </button>
      {open ? (
        <nav id="site-menu-panel" className="nav-menu-panel" aria-label={labels.nav}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
