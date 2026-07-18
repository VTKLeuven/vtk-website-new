'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Owns the sticky <header> element so it can sit transparently on top of the
 * homepage hero and turn solid once you scroll past it. Everywhere else, and on
 * narrow viewports (where the CSS ignores the flag), the header stays a solid
 * paper strip. The server-rendered nav is passed straight through as children.
 */
export function SiteHeaderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === '/' || pathname === '/en' || pathname === '/en/';

  // Start transparent on the homepage so there is no flash of a solid header
  // over the hero before the observer attaches.
  const [overHero, setOverHero] = useState(isHome);

  // This shell lives in the layout and does not remount on client-side
  // navigation, so reset the flag when the path changes. Adjusting state during
  // render (storing the previous path) is React's recommended pattern and keeps
  // the effect free of a synchronous setState; the observer below then refines
  // it from the hero's real position.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOverHero(isHome);
  }

  useEffect(() => {
    // Key off the hero actually being in the DOM rather than trusting the path
    // string, and re-run on every navigation. Only the homepage renders it.
    const hero = document.querySelector('.home-hero');
    if (!hero) return;

    const headerHeight =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--vtk-header-height'),
        10
      ) || 73;

    // Stay transparent while any part of the hero still sits below the header
    // line; once the hero has scrolled fully above it, the header goes solid.
    // Ignore entries for a hero that already left the DOM: navigating away
    // scrolls to top, and the observer can deliver that late
    // `isIntersecting: true` after the path-change reset above already ran;
    // without this guard the header stays transparent on a hero-less page.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.target.isConnected) setOverHero(entry.isIntersecting);
      },
      { rootMargin: `-${headerHeight}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [pathname]);

  // Belt and braces: only the homepage has a hero, so never render the
  // transparent state elsewhere, whatever a stale observer update left behind.
  return (
    <header className="vtk-site-header" data-over-hero={overHero && isHome ? 'true' : undefined}>
      {children}
    </header>
  );
}
