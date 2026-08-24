"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { pick, type Locale } from "@vtk/i18n";
import { OUTBOUND_EVENT, outboundHost, umamiEvent } from "@/lib/analytics";
import { isExternalUrl } from "@/lib/href";

const subscribeToClient = () => () => undefined;

type NavChild = { id: string; labelNl: string; labelEn: string; href: string; external: boolean };

type NavTab = {
  id: string;
  slug: string;
  labelNl: string;
  labelEn: string;
  /** Externe bestemming (bv. career.vtk.be); opent in een nieuw tabblad. */
  externalUrl?: string | null;
  /** Pagina's en externe items die onder de tab uitklappen. */
  children?: NavChild[];
};

/**
 * Hoofdnavigatie.
 *
 * Breed scherm: de tabs staan naast elkaar; een tab met onderliggende pagina's
 * klapt uit bij hover of via de chevron (toetsenbord en touch). Smal scherm: de
 * tabs zaten vroeger in een horizontale scroller, wat er rommelig uitzag en
 * waarin je moest zoeken; nu opent één menuknop de volledige lijst met de
 * pagina's per categorie eronder.
 */
export function EditorialNavLinks({
  tabs,
  base,
  locale,
  ariaLabel,
  search,
}: {
  tabs: NavTab[];
  base: string;
  locale: Locale;
  ariaLabel: string;
  /**
   * Het zoekveld voor het uitklappaneel. Komt als klaar gerenderde node uit de
   * sitekop (een server component), want op smal scherm is dit paneel de enige
   * plek waar het zoekveld past.
   */
  search?: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const shellRef = useRef<HTMLDivElement>(null);
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [menuPath, setMenuPath] = useState(pathname);
  // Tab waarvan het uitklappaneel onderdrukt is omdat je er net op geklikt hebt.
  // Zonder dit blijft het paneel na de klik openstaan zolang je muis op de tab
  // rust, terwijl de router al naar de nieuwe pagina is gegaan.
  const [suppressed, setSuppressed] = useState<string | null>(null);

  const nl = locale === "nl";
  const menuLabel = nl ? "Menu" : "Menu";
  const closeLabel = nl ? "Menu sluiten" : "Close menu";

  // Navigeren sluit het menu: anders blijft het paneel over de nieuwe pagina
  // hangen. Tijdens de render bijstellen (het patroon uit de React-docs), niet
  // in een effect: dat zou een tweede render na het schilderen uitlokken.
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
    setExpanded([]);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (shellRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  function tabHref(tab: NavTab): string {
    if (tab.externalUrl) {
      if (isExternalUrl(tab.externalUrl)) return tab.externalUrl;
      return base === "" ? tab.externalUrl : `${base}${tab.externalUrl}`;
    }
    return base === "" ? `/${tab.slug}` : `${base}/${tab.slug}`;
  }

  function childHref(child: NavChild): string {
    if (child.external) return child.href;
    return base === "" ? child.href : `${base}${child.href}`;
  }

  function isActive(tab: NavTab): boolean {
    if (tab.externalUrl && isExternalUrl(tab.externalUrl)) return false;
    const href = tabHref(tab);
    if (href === "/") return pathname === "/" || pathname === "";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function toggleExpanded(id: string) {
    setExpanded((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function renderChildLink(child: NavChild) {
    const href = childHref(child);
    const label = pick(child.labelNl, child.labelEn, locale);
    if (child.external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          {...umamiEvent(OUTBOUND_EVENT, { bestemming: outboundHost(href), vanaf: "menu" })}
        >
          {label}
        </a>
      );
    }
    return <Link href={href}>{label}</Link>;
  }

  function renderTabLink(tab: NavTab, active: boolean, withCaret = false) {
    const label = pick(tab.labelNl, tab.labelEn, locale);
    const caret = withCaret ? <ChevronDown className="nav-caret" aria-hidden="true" size={14} /> : null;
    if (tab.externalUrl && isExternalUrl(tab.externalUrl)) {
      return (
        <a
          href={tab.externalUrl}
          target="_blank"
          rel="noreferrer noopener"
          {...umamiEvent(OUTBOUND_EVENT, {
            bestemming: outboundHost(tab.externalUrl),
            vanaf: "menu",
          })}
        >
          {label}
          {caret}
        </a>
      );
    }
    return (
      <Link href={tabHref(tab)} className={isClient && active ? "active" : undefined}>
        {label}
        {caret}
      </Link>
    );
  }

  return (
    <div className="nav-links-shell" ref={shellRef}>
      <nav className="nav-links" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const children = tab.children ?? [];
          const active = isActive(tab);
          if (children.length === 0) {
            return (
              <div key={tab.id} className="nav-item">
                {renderTabLink(tab, active)}
              </div>
            );
          }
          // Openen gebeurt met CSS (hover en :focus-visible): de links zitten
          // altijd in de DOM, dus toetsenbord en screenreader komen erbij
          // zonder extra knop die de nav alleen maar breder maakt. Een klik
          // onderdrukt het paneel tot de muis de tab verlaat of de focus
          // wegvalt; anders blijft het na het navigeren hangen.
          const isSuppressed = suppressed === tab.id;
          const release = () => setSuppressed((current) => (current === tab.id ? null : current));
          return (
            <div
              key={tab.id}
              className="nav-item has-menu"
              data-suppressed={isSuppressed ? "" : undefined}
              onClick={() => setSuppressed(tab.id)}
              onPointerLeave={release}
              onBlur={release}
            >
              {renderTabLink(tab, active, true)}
              <div className="nav-menu">
                <ul>
                  {children.map((child) => (
                    <li key={child.id}>{renderChildLink(child)}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      <button
        type="button"
        className="nav-menu-trigger"
        aria-expanded={menuOpen}
        aria-controls="site-mobile-menu"
        aria-label={menuOpen ? closeLabel : menuLabel}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {menuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
      </button>

      <div className="nav-mobile-menu" id="site-mobile-menu" hidden={!menuOpen}>
        {search ? <div className="nav-mobile-search">{search}</div> : null}
        <nav aria-label={ariaLabel}>
          <ul>
            {tabs.map((tab) => {
              const children = tab.children ?? [];
              const isExpanded = expanded.includes(tab.id);
              return (
                <li key={tab.id}>
                  <div className="nav-mobile-row">
                    {renderTabLink(tab, isActive(tab))}
                    {children.length > 0 ? (
                      <button
                        type="button"
                        className={"nav-mobile-expand" + (isExpanded ? " is-open" : "")}
                        aria-expanded={isExpanded}
                        aria-controls={`nav-mobile-${tab.id}`}
                        aria-label={`${pick(tab.labelNl, tab.labelEn, locale)}: ${nl ? "toon pagina's" : "show pages"}`}
                        onClick={() => toggleExpanded(tab.id)}
                      >
                        <ChevronDown aria-hidden="true" size={18} />
                      </button>
                    ) : null}
                  </div>
                  {children.length > 0 ? (
                    <ul className="nav-mobile-sub" id={`nav-mobile-${tab.id}`} hidden={!isExpanded}>
                      {children.map((child) => (
                        <li key={child.id}>{renderChildLink(child)}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
