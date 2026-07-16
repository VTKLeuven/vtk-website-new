"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { pick, type Locale } from "@vtk/i18n";

const subscribeToClient = () => () => undefined;

export function EditorialNavLinks({
  tabs,
  base,
  locale,
  ariaLabel,
}: {
  tabs: Array<{ id: string; slug: string; labelNl: string; labelEn: string }>;
  base: string;
  locale: Locale;
  ariaLabel: string;
}) {
  const pathname = usePathname() ?? "/";
  const navRef = useRef<HTMLElement>(null);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      setCanScrollForward(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [tabs]);

  function tabHref(slug: string): string {
    if (base === "") return `/${slug}`;
    return `${base}/${slug}`;
  }

  function isActive(slug: string): boolean {
    const href = tabHref(slug);
    if (href === "/") return pathname === "/" || pathname === "";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="nav-links-shell">
      <nav
        ref={navRef}
        className="nav-links"
        aria-label={ariaLabel}
        onScroll={() => {
          const nav = navRef.current;
          if (nav) setCanScrollForward(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
        }}
      >
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tabHref(tab.slug)}
            className={isClient && isActive(tab.slug) ? "active" : undefined}
          >
            {pick(tab.labelNl, tab.labelEn, locale)}
          </Link>
        ))}
      </nav>
      {canScrollForward ? (
        <button
          className="nav-scroll-next"
          type="button"
          aria-label={locale === "nl" ? "Meer navigatie" : "More navigation"}
          title={locale === "nl" ? "Meer navigatie" : "More navigation"}
          onClick={() => navRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
        >
          <ChevronRight aria-hidden="true" size={17} />
        </button>
      ) : null}
    </div>
  );
}
