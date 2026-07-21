"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type NavItem = {
  key: string;
  href: string;
  label: string;
  /** Alleen exact-match markeren als actief (voor de dashboard-landing op /admin). */
  exact?: boolean;
};

export type NavNode =
  | { type: "item"; item: NavItem }
  | { type: "group"; key: string; label: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Ruimte onder de sticky header, en onderaan het scherm. Houd dit gelijk aan
 *  de waarden in vtk-admin.css. */
const TOP_GAP = 96;
const BOTTOM_GAP = 24;
/** Zelfde breekpunt als de tweekolomslayout in vtk-admin.css. */
const TWO_COLUMN = "(min-width: 860px)";

/**
 * "Meereizende" zijkolom: de nav mag hoger zijn dan het scherm en krijgt geen
 * eigen scrollbalk. Ze blijft stilstaan t.o.v. de pagina tot de rand die je
 * nadert de schermrand raakt, en reist dan mee.
 *
 * Dit kan niet met `position: sticky`: dat kent maar één anker. Een te hoge
 * sticky kolom met `top` pint haar bovenrand vast, waardoor je tot onderaan de
 * pagina moest scrollen om de laatste tabs te zien; met `bottom` krijg je
 * hetzelfde probleem gespiegeld bij omhoog scrollen. We verschuiven de nav dus
 * zelf binnen haar (uitgerekte) kolom, en handhaven per scrollrichting enkel de
 * rand waar je naartoe scrollt. Zo blijft de positie continu: geen sprong op
 * het moment dat je van richting verandert.
 */
function useSmartSticky<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const column = el.parentElement;
    if (!column) return;

    const media = window.matchMedia(TWO_COLUMN);
    // Verschuiving van de nav t.o.v. de bovenkant van haar kolom.
    let offset = 0;
    let lastY = window.scrollY;
    let frame = 0;

    const apply = () => {
      frame = 0;
      if (!media.matches) {
        el.style.transform = "";
        return;
      }

      const y = window.scrollY;
      const down = y > lastY;
      lastY = y;

      const viewport = window.innerHeight;
      const navHeight = el.offsetHeight;
      // getBoundingClientRect() van de kolom is onafhankelijk van onze eigen
      // transform, dus dit blijft een stabiel referentiepunt.
      const columnTop = column.getBoundingClientRect().top;
      const top = columnTop + offset;

      if (navHeight + TOP_GAP + BOTTOM_GAP <= viewport) {
        // Past volledig op het scherm: gewoon onder de header blijven plakken.
        offset += TOP_GAP - top;
      } else if (down) {
        // Enkel de onderrand bewaken: de nav schuift met de pagina mee omhoog
        // tot haar onderkant het scherm raakt en reist daarna mee.
        const bottom = top + navHeight;
        if (bottom < viewport - BOTTOM_GAP) offset += viewport - BOTTOM_GAP - bottom;
      } else {
        // Omhoog: enkel de bovenrand bewaken, spiegelbeeld van hierboven.
        if (top > TOP_GAP) offset -= top - TOP_GAP;
      }

      // Nooit buiten de eigen kolom.
      offset = Math.max(0, Math.min(offset, column.offsetHeight - navHeight));
      el.style.transform = offset > 0 ? `translate3d(0, ${Math.round(offset)}px, 0)` : "";
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    // De nav verandert van hoogte als je een groep open- of dichtklapt, de
    // kolom als de pagina-inhoud groeit.
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    observer.observe(column);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      observer.disconnect();
      el.style.transform = "";
    };
  }, []);

  return ref;
}

/**
 * Linkerkolom-navigatie van het adminpaneel. Server component levert de
 * (permissie-gefilterde, gelokaliseerde) `nodes` aan; deze client-schil zorgt
 * voor de actieve-markering (via `usePathname`), het in-/uitklappen van
 * groepen en het meereizen bij scrollen. Op smalle schermen valt de groep terug
 * op losse pillen in de horizontale scroller (zie vtk-admin.css).
 */
export function AdminNav({ title, nodes }: { title: string; nodes: NavNode[] }) {
  const pathname = usePathname();
  const stickyRef = useSmartSticky<HTMLDivElement>();
  return (
    <div className="vtk-admin-nav-sticky" ref={stickyRef}>
      <h2 className="vtk-admin-nav-title">{title}</h2>
      <nav className="vtk-admin-nav">
        {nodes.map((node) =>
          node.type === "item" ? (
            <NavLink key={node.item.key} item={node.item} active={isActive(pathname, node.item)} />
          ) : (
            <NavGroup key={node.key} group={node} pathname={pathname} />
          )
        )}
      </nav>
    </div>
  );
}

function NavLink({ item, active, sub }: { item: NavItem; active: boolean; sub?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex items-center gap-2" +
        (sub ? " vtk-admin-nav-sublink" : "") +
        (active ? " is-active" : "")
      }
    >
      {icons[item.key] ?? icons.groups}
      <span>{item.label}</span>
    </Link>
  );
}

function NavGroup({ group, pathname }: { group: Extract<NavNode, { type: "group" }>; pathname: string }) {
  const containsActive = group.items.some((i) => isActive(pathname, i));
  const [open, setOpen] = useState(containsActive);

  // Navigeert de gebruiker naar een item in deze groep terwijl ze ingeklapt is
  // (de layout blijft gemount tussen admin-routes), klap ze dan open. We passen
  // de state tijdens het renderen aan i.p.v. in een effect: dat vermijdt
  // cascading renders. `open` blijft daarna toggelbaar via de knop, en we klappen
  // nooit automatisch weer dicht.
  const [prevContainsActive, setPrevContainsActive] = useState(containsActive);
  if (containsActive !== prevContainsActive) {
    setPrevContainsActive(containsActive);
    if (containsActive) setOpen(true);
  }

  return (
    <>
      {/* Smal scherm: losse pillen in de horizontale scroller (geen groepskop). */}
      <span className="vtk-admin-nav-flat">
        {group.items.map((item) => (
          <NavLink key={item.key} item={item} active={isActive(pathname, item)} />
        ))}
      </span>

      {/* Breed scherm: inklapbare groep. */}
      <div className="vtk-admin-nav-group">
        <button
          type="button"
          className={"vtk-admin-nav-group-toggle" + (containsActive ? " has-active" : "")}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {icons[group.key] ?? icons.groups}
          <span className="flex-1 text-left">{group.label}</span>
          <Chevron open={open} />
        </button>
        <div className={"vtk-admin-nav-sub" + (open ? " is-open" : "")}>
          {group.items.map((item) => (
            <NavLink key={item.key} item={item} active={isActive(pathname, item)} sub />
          ))}
        </div>
      </div>
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={"vtk-admin-nav-chevron" + (open ? " is-open" : "")}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

// Icons zijn gekozen zodat je in een oogopslag de juiste tab herkent.
const icons: Record<string, ReactNode> = {
  // ledenbeheer: adresboek / ledenkaart
  ledenbeheer: (
    <Svg>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      <circle cx="12" cy="9" r="2" />
      <path d="M9.5 15a2.5 2.5 0 0 1 5 0" />
    </Svg>
  ),
  // dashboard: overzichtstegels (landing page)
  dashboard: (
    <Svg>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Svg>
  ),
  // website: wereldbol, de publieke site (home, inhoud, pagina's, partners)
  website: (
    <Svg>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  ),
  // pages: document met tekstlijnen (de inhoudseditor per pagina)
  pages: (
    <Svg>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </Svg>
  ),
  // content: navigatiebalk bovenaan met de pagina's eronder
  content: (
    <Svg>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M7 13h10" />
      <path d="M7 17h6" />
    </Svg>
  ),
  // tickets: ticket met perforatie, hetzelfde beeld als op de ticketpagina's
  tickets: (
    <Svg>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 11v2" />
      <path d="M13 17v2" />
    </Svg>
  ),
  // calendar: kalender
  calendar: (
    <Svg>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </Svg>
  ),
  // albums: foto
  albums: (
    <Svg>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Svg>
  ),
  // pocs: studentenvertegenwoordigers -> studentenmuts
  pocs: (
    <Svg>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5" />
    </Svg>
  ),
  // partners: bedrijven/sponsors -> aktetas
  partners: (
    <Svg>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </Svg>
  ),
  // users: individuele gebruiker
  users: (
    <Svg>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  ),
  // mailinglists: envelop
  mailinglists: (
    <Svg>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </Svg>
  ),
  // groups: meerdere gebruikers
  groups: (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  // werkgroepen: gestapelde lagen (werkgroepen naast de posten)
  werkgroepen: (
    <Svg>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 12 10 5 10-5" />
      <path d="m2 17 10 5 10-5" />
    </Svg>
  ),
  // roles: rechtenbundel -> schild met vinkje
  roles: (
    <Svg>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  // home: huis
  home: (
    <Svg>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Svg>
  ),
  // dashboardTiles: raster van tegels
  dashboardTiles: (
    <Svg>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  // shortlinks: link/ketting
  shortlinks: (
    <Svg>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  ),
  // shift: shiften -> klok
  shift: (
    <Svg>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Svg>
  ),
  // theokot: eten & drinken -> koffiebeker
  theokot: (
    <Svg>
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M6 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
    </Svg>
  ),
  // it: terminal (de groep met de technische tabs)
  it: (
    <Svg>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </Svg>
  ),
  // itConfig: schuifregelaars, de instellingen zelf
  itConfig: (
    <Svg>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </Svg>
  ),
  // authorizationPreview: oog, je bekijkt de site door andermans rechten
  authorizationPreview: (
    <Svg>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  // sso: sleutel, externe apps die met een VTK-account inloggen
  sso: (
    <Svg>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.5-8.5" />
      <path d="m17 6 2.5 2.5" />
      <path d="m14.5 8.5 2.5 2.5" />
    </Svg>
  ),
  // door: deur met klink
  door: (
    <Svg>
      <path d="M3 21h18" />
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
      <path d="M14 12h.01" />
    </Svg>
  ),
};
