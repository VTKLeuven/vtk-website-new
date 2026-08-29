'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ElixirIcon } from './elixir-icon';
import type { HeaderLink } from './site-header';

/**
 * Het interactieve deel van de header.
 *
 * Drie dingen die de servercomponent niet kan:
 *  - **Transparant over de fotohero.** Op de homepagina heeft de header geen
 *    eigen vlak tot je voorbij de hero scrolt; daarna wordt hij vast. Dezelfde
 *    aanpak als `SiteHeaderShell` op vtk.be.
 *  - **Eén menuknop onder 760px.** Bewust geen horizontale scroller: die
 *    verbergt de helft van de navigatie en leest als een fout (CLAUDE.md).
 *  - **Het profielmenu**, met de link terug naar de hoofdsite.
 */
export function HeaderShell({
  brand,
  links,
  user,
  mainUrl,
  loginHref,
  testLoginHref,
}: {
  brand: ReactNode;
  links: HeaderLink[];
  user: { name: string; canManage: boolean } | null;
  mainUrl: string;
  loginHref: string;
  testLoginHref?: string;
}) {
  const pathname = usePathname();
  const panelId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  // Enkel de homepagina heeft de fotohero waar de header overheen mag liggen.
  const overHero = pathname === '/';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!overHero) return;
    // De hero is minstens ~78vh hoog; zodra je een schermhoogte gescrold hebt,
    // ligt de header gegarandeerd op papier en moet hij vast worden.
    const threshold = () => Math.max(160, window.innerHeight * 0.6);
    let frame = 0;
    const apply = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold());
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [overHero]);

  // Sluit het paneel bij navigatie; anders blijft het openstaan over de nieuwe
  // pagina heen.
  const [previousPath, setPreviousPath] = useState(pathname);
  if (pathname !== previousPath) {
    setPreviousPath(pathname);
    if (menuOpen) setMenuOpen(false);
  }

  const transparent = overHero && !scrolled && !menuOpen;

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="vtk-site-header" data-transparent={String(transparent)}>
      <div className="nav-inner">
        {brand}

        <nav className="nav-links" aria-label="Hoofdnavigatie">
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? 'page' : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="nav-right">
          {user ? (
            <ProfileMenu name={user.name} canManage={user.canManage} mainUrl={mainUrl} testLoginHref={testLoginHref} />
          ) : (
            <a href={loginHref} aria-label="Inloggen" title="Inloggen" className="nav-login">
              <ElixirIcon name="user" className="h-[1.125rem] w-[1.125rem]" />
            </a>
          )}
          <button
            type="button"
            className="nav-menu-button"
            aria-expanded={menuOpen}
            aria-controls={panelId}
            aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ElixirIcon name={menuOpen ? 'chevron' : 'bars'} className="h-[1.125rem] w-[1.125rem]" />
          </button>
        </div>
      </div>

      <div id={panelId} className={`nav-panel${menuOpen ? ' is-open' : ''}`}>
        <div className="nav-panel-inner">
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={isActive(link.href) ? 'page' : undefined}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

function ProfileMenu({
  name,
  canManage,
  mainUrl,
  testLoginHref,
}: {
  name: string;
  canManage: boolean;
  mainUrl: string;
  testLoginHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="profile-menu-root"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="profile-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name}
        title={name}
        onClick={() => setOpen((current) => !current)}
      >
        {name.slice(0, 1).toUpperCase()}
      </button>

      {open ? (
        <div className="profile-menu" role="menu">
          <span className="profile-menu-name">{name}</span>
          {canManage ? (
            <Link href="/admin" className="profile-menu-item" role="menuitem">
              Beheer
            </Link>
          ) : null}
          <a href={mainUrl} className="profile-menu-item" role="menuitem">
            Naar vtk.be
          </a>
          <a href={`${mainUrl}/account`} className="profile-menu-item" role="menuitem">
            Mijn account
          </a>
          {testLoginHref ? (
            <Link href={testLoginHref} className="profile-menu-item" role="menuitem">
              Wissel test-gebruiker
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
