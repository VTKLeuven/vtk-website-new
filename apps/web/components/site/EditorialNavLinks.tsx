"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pick, type Locale } from "@vtk/i18n";

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
    <nav className="nav-links" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <Link key={tab.id} href={tabHref(tab.slug)} className={isActive(tab.slug) ? "active" : undefined}>
          {pick(tab.labelNl, tab.labelEn, locale)}
        </Link>
      ))}
    </nav>
  );
}
