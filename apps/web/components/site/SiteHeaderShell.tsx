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

  useEffect(() => {
    // Key off the hero actually being in the DOM rather than trusting the path
    // string, and re-run on every navigation. Only the homepage renders it.
    const hero = document.querySelector('.home-hero');
    if (!hero) {
      setOverHero(false);
      return;
    }

    const headerHeight =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--vtk-header-height'),
        10
      ) || 73;

    // Stay transparent while any part of the hero still sits below the header
    // line; once the hero has scrolled fully above it, the header goes solid.
    const observer = new IntersectionObserver(
      ([entry]) => setOverHero(entry.isIntersecting),
      { rootMargin: `-${headerHeight}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <header className="vtk-site-header" data-over-hero={overHero ? 'true' : undefined}>
      {children}
    </header>
  );
}
