"use client";

import Link from "@/components/ui/Link";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toggleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [menuPath, setMenuPath] = useState(pathname);
  const [openSubmenu, setOpenSubmenu] = useState<{ id: string; mode: "hover" | "pinned" } | null>(null);
  // Tab waarvan het uitklappaneel onderdrukt is omdat je er net op geklikt hebt
  // of omdat het met Escape gesloten werd.
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
    setOpenSubmenu(null);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main, footer, .vtk-site-header .brand, .vtk-site-header .nav-right, .vtk-cookie-consent-positioner, .vtk-announcement, .vtk-preview-bar",
      ),
    );
    const previous = targets.map((el) => ({ el, inert: el.inert }));
    for (const el of targets) el.inert = true;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (shellRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      for (const item of previous) item.el.inert = item.inert;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!openSubmenu) return;
    const activeId = openSubmenu.id;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const panel = document.getElementById(`nav-submenu-${activeId}`);
      const insidePanel = panel?.contains(document.activeElement);
      setSuppressed(activeId);
      setOpenSubmenu(null);
      if (insidePanel) {
        requestAnimationFrame(() => toggleRefs.current[activeId]?.focus());
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (shellRef.current?.contains(event.target as Node)) return;
      setOpenSubmenu(null);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openSubmenu]);

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

  function renderChildLink(child: NavChild, parentTabId?: string) {
    const href = childHref(child);
    const label = pick(child.labelNl, child.labelEn, locale);
    const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
    const closeDesktopMenu = () => {
      if (parentTabId) setSuppressed(parentTabId);
      setOpenSubmenu(null);
    };
    if (child.external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          onClick={closeDesktopMenu}
          {...umamiEvent(OUTBOUND_EVENT, { bestemming: outboundHost(href), vanaf: "menu" })}
        >
          {label}
        </a>
      );
    }
    return (
      <Link
        href={href}
        className={isClient && active ? "active" : undefined}
        aria-current={isClient && active ? "page" : undefined}
        onClick={closeDesktopMenu}
      >
        {label}
      </Link>
    );
  }

  function renderTabLink(tab: NavTab, active: boolean) {
    const label = pick(tab.labelNl, tab.labelEn, locale);
    const closeDesktopMenu = () => {
      setSuppressed(tab.id);
      setOpenSubmenu(null);
    };
    if (tab.externalUrl && isExternalUrl(tab.externalUrl)) {
      return (
        <a
          href={tab.externalUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={closeDesktopMenu}
          {...umamiEvent(OUTBOUND_EVENT, {
            bestemming: outboundHost(tab.externalUrl),
            vanaf: "menu",
          })}
        >
          {label}
        </a>
      );
    }
    return (
      <Link
        href={tabHref(tab)}
        className={isClient && active ? "active" : undefined}
        aria-current={isClient && active ? "page" : undefined}
        onClick={closeDesktopMenu}
      >
        {label}
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
          // Openen op desktop via de aparte toggleknop (Enter/Space/klik) of
          // via muis-hover; nooit automatisch bij focus op de link zelf, zodat
          // toetsenbordgebruikers niet door 26 sublinks gedwongen worden.
          const isSuppressed = suppressed === tab.id;
          const isSubmenuOpen = openSubmenu?.id === tab.id && !isSuppressed;
          const label = pick(tab.labelNl, tab.labelEn, locale);
          return (
            <div
              key={tab.id}
              className="nav-item has-menu"
              data-menu-open={isSubmenuOpen ? "" : undefined}
              data-suppressed={isSuppressed ? "" : undefined}
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse" || isSuppressed) return;
                setOpenSubmenu((cur) => (cur?.id === tab.id && cur.mode === "pinned" ? cur : { id: tab.id, mode: "hover" }));
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== "mouse") return;
                setSuppressed((cur) => (cur === tab.id ? null : cur));
                setOpenSubmenu((cur) => (cur?.id === tab.id && cur.mode === "hover" ? null : cur));
              }}
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setSuppressed((cur) => (cur === tab.id ? null : cur));
                setOpenSubmenu((cur) => (cur?.id === tab.id ? null : cur));
              }}
            >
              {renderTabLink(tab, active)}
              <button
                ref={(el) => {
                  toggleRefs.current[tab.id] = el;
                }}
                type="button"
                className="nav-submenu-toggle"
                aria-expanded={isSubmenuOpen}
                aria-controls={`nav-submenu-${tab.id}`}
                aria-label={`${label}: ${nl ? "toon submenu" : "toggle submenu"}`}
                onClick={() => {
                  setSuppressed(null);
                  setOpenSubmenu((cur) =>
                    cur?.id === tab.id && cur.mode === "pinned" ? null : { id: tab.id, mode: "pinned" },
                  );
                }}
              >
                <ChevronDown className="nav-caret" aria-hidden="true" size={14} />
              </button>
              <div className="nav-menu" id={`nav-submenu-${tab.id}`}>
                <ul>
                  {children.map((child) => (
                    <li key={child.id}>{renderChildLink(child, tab.id)}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      <button
        ref={triggerRef}
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
