'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';

import './admin-nav.css';

export type AdminNavItem = {
  key: string;
  href: string;
  label: string;
  exact?: boolean;
};

export type AdminNavNode =
  { type: 'item'; item: AdminNavItem } | { type: 'group'; key: string; label: string; items: AdminNavItem[] };

/**
 * Vastpinnen is optioneel: geef `pins` mee en elke tab krijgt een speldje,
 * waarmee de gebruiker zijn eigen tabs bovenaan zet. Zonder deze prop rendert
 * de nav precies zoals voorheen (Logistiek gebruikt hem zo).
 */
export type AdminNavPins = {
  /** Vastgepinde keys, in de volgorde waarin ze bovenaan komen. */
  keys: string[];
  /** Slaat de wijziging op. Mag gooien; de nav zet de pin dan terug. */
  onToggle: (key: string, pinned: boolean) => Promise<void>;
  labels: {
    /** Kopje boven de vastgepinde tabs. */
    section: string;
    /** Kopje boven de volledige lijst eronder. */
    all: string;
    /** Tooltip op het speldje van een tab die nog niet vastgepind is. */
    pin: string;
    /** Tooltip op het speldje van een vastgepinde tab. */
    unpin: string;
  };
};

/**
 * Inklappen is optioneel, net als vastpinnen: zonder deze prop is er geen knop
 * en blijft de zijbalk altijd uitgeklapt (Logistiek en de Fakbar).
 *
 * Ingeklapt wordt de zijbalk een rail met enkel de iconen, vanaf 860px; smaller
 * blijft het de gewone uitklapknop. Onthouden doet de app (`onChange`), zodat
 * de server de juiste toestand meteen rendert en er niets verspringt.
 */
export type AdminNavCollapse = {
  initial: boolean;
  onChange: (collapsed: boolean) => void;
  labels: {
    collapse: string;
    expand: string;
  };
};

export type AdminNavProps = {
  title: string;
  nodes: AdminNavNode[];
  icons?: Record<string, ReactNode>;
  pins?: AdminNavPins;
  collapse?: AdminNavCollapse;
};

const TOP_GAP = 96;
const BOTTOM_GAP = 24;
const TWO_COLUMN = '(min-width: 860px)';

/**
 * Waar de ingeklapte rail begint: op de hoogte van de eerste kaart of tabel van
 * de pagina, niet naast de paginatitel. Een smalle rail die boven de inhoud
 * uitsteekt, hangt er los naast; op dezelfde lijn als de tabel hoort ze erbij.
 * Pagina's verschillen in hoe hoog hun kop is, dus dit wordt gemeten. Meer dan
 * `MAX_LEAD` zakt ze nooit, anders begint ze onder een lange intro halverwege
 * het scherm.
 */
const RAIL_ALIGN = "[data-vtk-ui='card'], .ticket-admin-section, table";
const MAX_LEAD = 320;

function matches(pathname: string, item: AdminNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Het href van de tab die bij dit pad hoort: de **langste** die matcht.
 *
 * Zonder die regel lichtten twee tabs samen op zodra de ene onder de andere
 * hangt: /admin/theokot/verhuur zette ook Broodjes (/admin/theokot) aan, en
 * /admin/wachtwoorden/beheer ook Wachtwoorden. `exact` erop zetten is geen
 * oplossing, want die bovenliggende tab heeft zelf onderliggende schermen die
 * hem wél moeten laten oplichten (/admin/theokot/afhalen).
 */
function activeHrefFor(nodes: AdminNavNode[], pathname: string): string | null {
  let best: string | null = null;
  for (const item of flatten(nodes)) {
    if (!matches(pathname, item)) continue;
    if (best === null || item.href.length > best.length) best = item.href;
  }
  return best;
}

function isActive(activeHref: string | null, item: AdminNavItem): boolean {
  return activeHref !== null && item.href === activeHref;
}

function useSmartSticky<T extends HTMLElement>(alignToContent: boolean) {
  const ref = useRef<T>(null);
  const alignRef = useRef(alignToContent);
  const scheduleRef = useRef<() => void>(() => {});

  // Na het in- of uitklappen, en na een navigatie (andere pagina, andere kop),
  // opnieuw meten.
  useEffect(() => {
    alignRef.current = alignToContent;
    scheduleRef.current();
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const column = element.parentElement;
    if (!column) return;

    const media = window.matchMedia(TWO_COLUMN);
    let offset = 0;
    let lastY = window.scrollY;
    let frame = 0;

    const apply = () => {
      frame = 0;
      if (!media.matches) {
        element.style.transform = '';
        element.style.marginBottom = '';
        return;
      }

      const y = window.scrollY;
      const scrollingDown = y > lastY;
      lastY = y;
      // Alles in layoutpixels. Onder CSS-`zoom` (de site op 90% op een laptop)
      // zijn `getBoundingClientRect` en `innerHeight` zichtbare pixels en
      // `offsetHeight` en de transform layoutpixels; zonder zoom is dit 1.
      const columnRect = column.getBoundingClientRect();
      const scale = column.offsetHeight > 0 ? columnRect.height / column.offsetHeight || 1 : 1;
      const viewport = window.innerHeight / scale;
      const navHeight = element.offsetHeight;
      const columnTop = columnRect.top / scale;

      // De ingeklapte rail begint op de hoogte van de eerste kaart of tabel.
      let lead = 0;
      if (alignRef.current) {
        const target = column.nextElementSibling?.querySelector(RAIL_ALIGN);
        if (target) {
          const distance = (target.getBoundingClientRect().top - columnRect.top) / scale;
          lead = Math.max(0, Math.min(MAX_LEAD, Math.round(distance)));
        }
      }
      // De kolom groeit mee met die afstand: op een korte pagina liep de rail
      // anders onder de inhoud door tot in de footer.
      const reserve = lead > 0 ? `${lead}px` : '';
      if (element.style.marginBottom !== reserve) element.style.marginBottom = reserve;
      offset = Math.max(offset, lead);
      // Tot de eerste meting staat de rail verborgen (admin-nav.css), anders
      // verschijnt ze bij elke paginalading eerst bovenaan en springt ze dan.
      element.dataset.aligned = alignRef.current ? 'true' : '';
      const top = columnTop + offset;

      if (navHeight + TOP_GAP + BOTTOM_GAP <= viewport) {
        offset += TOP_GAP - top;
      } else if (scrollingDown) {
        const bottom = top + navHeight;
        if (bottom < viewport - BOTTOM_GAP) offset += viewport - BOTTOM_GAP - bottom;
      } else if (top > TOP_GAP) {
        offset -= top - TOP_GAP;
      }

      offset = Math.max(lead, Math.min(offset, column.offsetHeight - navHeight));
      element.style.transform = offset > 0 ? `translate3d(0, ${Math.round(offset)}px, 0)` : '';
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    scheduleRef.current = schedule;

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(column);
    // De inhoud ernaast: een kop die later groeit, verschuift de eerste kaart.
    const content = column.nextElementSibling;
    if (content) observer.observe(content);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      media.removeEventListener('change', schedule);
      observer.disconnect();
      scheduleRef.current = () => {};
      element.style.transform = '';
      element.style.marginBottom = '';
    };
  }, []);

  return ref;
}

function activeLabel(nodes: AdminNavNode[], activeHref: string | null, fallback: string): string {
  for (const node of nodes) {
    if (node.type === 'item') {
      if (isActive(activeHref, node.item)) return node.item.label;
    } else {
      const hit = node.items.find((item) => isActive(activeHref, item));
      if (hit) return hit.label;
    }
  }
  return fallback;
}

/** Alle tabs die de gebruiker mag zien, plat, om een pin op te kunnen zoeken. */
function flatten(nodes: AdminNavNode[]): AdminNavItem[] {
  return nodes.flatMap((node) => (node.type === 'item' ? [node.item] : node.items));
}

export function AdminNav({ title, nodes, icons = {}, pins, collapse }: AdminNavProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(collapse?.initial ?? false);
  const stickyRef = useSmartSticky<HTMLDivElement>(collapsed);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const activeHref = activeHrefFor(nodes, pathname);
  const current = activeLabel(nodes, activeHref, title);

  const [previousPath, setPreviousPath] = useState(pathname);
  if (pathname !== previousPath) {
    setPreviousPath(pathname);
    if (open) setOpen(false);
  }

  const toggleCollapsed = (next: boolean) => {
    setCollapsed(next);
    collapse?.onChange(next);
  };

  const pinState = usePins(pins);
  // Eén context voor elke rij, zodat de rijen zelf niets over de prop hoeven te
  // weten: null betekent gewoon "geen speldjes".
  const pinCtx: PinCtx | null = pins && pinState ? { pins, state: pinState } : null;

  return (
    <div className="vtk-admin-nav-sticky" ref={stickyRef} data-collapsed={collapse && collapsed ? 'true' : undefined}>
      <div className="vtk-admin-nav-head">
        <h2 className="vtk-admin-nav-title">{title}</h2>
        {collapse && (
          <button
            type="button"
            className="vtk-admin-nav-collapse"
            title={collapse.labels.collapse}
            aria-label={collapse.labels.collapse}
            onClick={() => toggleCollapsed(true)}
          >
            <PanelIcon expand={false} />
          </button>
        )}
      </div>
      {collapse && collapsed && (
        <AdminRail
          title={title}
          nodes={nodes}
          icons={icons}
          activeHref={activeHref}
          pinnedKeys={pinCtx?.state.keys ?? []}
          expandLabel={collapse.labels.expand}
          onExpand={() => toggleCollapsed(false)}
        />
      )}
      <button
        type="button"
        className={`vtk-admin-nav-toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className="vtk-admin-nav-toggle-label">{current}</span>
        <Chevron open={open} />
      </button>
      <nav id={panelId} className={`vtk-admin-nav${open ? ' is-open' : ''}`} aria-label={title}>
        {pinCtx && (
          <PinnedSection nodes={nodes} activeHref={activeHref} icons={icons} pins={pinCtx.pins} state={pinCtx.state} />
        )}
        {nodes.map((node) =>
          node.type === 'item' ? (
            <NavLink
              key={node.item.key}
              item={node.item}
              active={isActive(activeHref, node.item)}
              icons={icons}
              pin={pinCtx}
            />
          ) : (
            <NavGroup
              key={node.key}
              group={node}
              activeHref={activeHref}
              icons={icons}
              pin={pinCtx}
            />
          )
        )}
      </nav>
    </div>
  );
}

type PinState = {
  keys: string[];
  toggle: (key: string) => void;
};

type PinCtx = { pins: AdminNavPins; state: PinState };

/**
 * Houdt de pins lokaal bij zodat een klik meteen zichtbaar is; de server volgt
 * erachteraan. Mislukt de action, dan springt de pin terug. De melding komt van
 * de app: die gooit vanuit `onToggle`, en dat gooien is hier het sein.
 */
function usePins(pins: AdminNavPins | undefined): PinState | null {
  const serverKeys = pins?.keys;
  const [keys, setKeys] = useState<string[]>(serverKeys ?? []);
  const [, startTransition] = useTransition();

  // De layout hervalideert na het opslaan; neem die waarheid dan weer over.
  const serialized = (serverKeys ?? []).join(' ');
  const [previous, setPrevious] = useState(serialized);
  if (serialized !== previous) {
    setPrevious(serialized);
    setKeys(serverKeys ?? []);
  }

  if (!pins) return null;

  const toggle = (key: string) => {
    const wasPinned = keys.includes(key);
    const next = wasPinned ? keys.filter((k) => k !== key) : [...keys, key];
    setKeys(next);
    startTransition(async () => {
      try {
        await pins.onToggle(key, !wasPinned);
      } catch {
        // De app heeft de fout al gemeld; hier zetten we enkel de pin terug,
        // zodat de zijbalk niet iets toont wat niet bewaard is.
        setKeys(keys);
      }
    });
  };

  return { keys, toggle };
}

function PinnedSection({
  nodes,
  activeHref,
  icons,
  pins,
  state,
}: {
  nodes: AdminNavNode[];
  activeHref: string | null;
  icons: Record<string, ReactNode>;
  pins: AdminNavPins;
  state: PinState;
}) {
  const byKey = new Map(flatten(nodes).map((item) => [item.key, item]));
  // Een pin op een tab die je niet (meer) mag zien, slaan we over in plaats van
  // ze te verwijderen: rechten kunnen volgend werkingsjaar terugkomen.
  const items = state.keys.map((key) => byKey.get(key)).filter((item): item is AdminNavItem => !!item);
  if (items.length === 0) return null;

  return (
    <div className="vtk-admin-nav-pinned">
      <p className="vtk-admin-nav-section">{pins.labels.section}</p>
      {items.map((item) => (
        <NavLink
          key={item.key}
          item={item}
          active={isActive(activeHref, item)}
          icons={icons}
          pin={{ pins, state }}
        />
      ))}
      <p className="vtk-admin-nav-section vtk-admin-nav-section-all">{pins.labels.all}</p>
    </div>
  );
}

function PinButton({ item, pins, state }: { item: AdminNavItem; pins: AdminNavPins; state: PinState }) {
  const pinned = state.keys.includes(item.key);
  const label = pinned ? pins.labels.unpin : pins.labels.pin;
  return (
    <button
      type="button"
      className={`vtk-admin-nav-pin${pinned ? ' is-pinned' : ''}`}
      title={label}
      aria-label={`${label}: ${item.label}`}
      aria-pressed={pinned}
      onClick={(event) => {
        // De rij eromheen is een link; een klik op het speldje mag niet
        // navigeren.
        event.preventDefault();
        event.stopPropagation();
        state.toggle(item.key);
      }}
    >
      <PinIcon filled={pinned} />
    </button>
  );
}

/**
 * Eén rij. Het speldje staat naast de link en niet erin: een knop binnen een
 * `<a>` is ongeldige HTML en de browser haalt hem er dan uit. De rij draagt
 * daarom de hover- en actief-achtergrond, niet de link zelf.
 */
function NavLink({
  item,
  active,
  icons,
  sub,
  pin,
}: {
  item: AdminNavItem;
  active: boolean;
  icons: Record<string, ReactNode>;
  sub?: boolean;
  pin?: PinCtx | null;
}) {
  return (
    <div className={`vtk-admin-nav-row${active ? ' is-active' : ''}`}>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`inline-flex items-center gap-2${sub ? ' vtk-admin-nav-sublink' : ''}${active ? ' is-active' : ''}`}
      >
        {icons[item.key] ?? icons.groups}
        <span>{item.label}</span>
      </Link>
      {pin && <PinButton item={item} pins={pin.pins} state={pin.state} />}
    </div>
  );
}

function NavGroup({
  group,
  activeHref,
  icons,
  pin,
}: {
  group: Extract<AdminNavNode, { type: 'group' }>;
  activeHref: string | null;
  icons: Record<string, ReactNode>;
  pin?: PinCtx | null;
}) {
  const containsActive = group.items.some((item) => isActive(activeHref, item));
  const [open, setOpen] = useState(containsActive);
  const [previousContainsActive, setPreviousContainsActive] = useState(containsActive);

  if (containsActive !== previousContainsActive) {
    setPreviousContainsActive(containsActive);
    if (containsActive) setOpen(true);
  }

  return (
    <div className="vtk-admin-nav-group">
      <button
        type="button"
        className={`vtk-admin-nav-group-toggle${containsActive ? ' has-active' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        {icons[group.key] ?? icons.groups}
        <span className="flex-1 text-left">{group.label}</span>
        <Chevron open={open} />
      </button>
      <div className={`vtk-admin-nav-sub${open ? ' is-open' : ''}`}>
        {group.items.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={isActive(activeHref, item)}
            icons={icons}
            sub
            pin={pin}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * De ingeklapte zijbalk: dezelfde kaart, enkel de iconen. Een losse tab is een
 * link; een groep opent haar tabs in een kaart ernaast. De naam staat in een
 * tooltip bij hover en focus, en in de `aria-label` voor een screenreader.
 */
function AdminRail({
  title,
  nodes,
  icons,
  activeHref,
  pinnedKeys,
  expandLabel,
  onExpand,
}: {
  title: string;
  nodes: AdminNavNode[];
  icons: Record<string, ReactNode>;
  activeHref: string | null;
  pinnedKeys: string[];
  expandLabel: string;
  onExpand: () => void;
}) {
  const pathname = usePathname();
  const railRef = useRef<HTMLDivElement>(null);
  const [flyout, setFlyout] = useState<string | null>(null);

  const [previousPath, setPreviousPath] = useState(pathname);
  if (pathname !== previousPath) {
    setPreviousPath(pathname);
    if (flyout) setFlyout(null);
  }

  // Een open groep sluit bij een klik ernaast en bij Escape.
  useEffect(() => {
    if (!flyout) return;
    const onPointer = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) setFlyout(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFlyout(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [flyout]);

  const byKey = new Map(flatten(nodes).map((item) => [item.key, item]));
  const pinned = pinnedKeys.map((key) => byKey.get(key)).filter((item): item is AdminNavItem => !!item);

  return (
    <div className="vtk-admin-rail" ref={railRef}>
      <nav className="vtk-admin-rail-card" aria-label={title}>
        <div className="vtk-admin-rail-slot">
          <button type="button" className="vtk-admin-rail-btn" aria-label={expandLabel} onClick={onExpand}>
            <PanelIcon expand />
          </button>
          <span className="vtk-admin-rail-tip" aria-hidden>
            {expandLabel}
          </span>
        </div>
        <span className="vtk-admin-rail-sep" aria-hidden />
        {pinned.map((item) => (
          <RailLink key={`pin-${item.key}`} item={item} icons={icons} active={isActive(activeHref, item)} pinned />
        ))}
        {pinned.length > 0 && <span className="vtk-admin-rail-sep" aria-hidden />}
        {nodes.map((node) => {
          if (node.type === 'item') {
            return (
              <RailLink key={node.item.key} item={node.item} icons={icons} active={isActive(activeHref, node.item)} />
            );
          }
          const containsActive = node.items.some((item) => isActive(activeHref, item));
          const isOpen = flyout === node.key;
          return (
            <div className="vtk-admin-rail-slot" key={node.key}>
              <button
                type="button"
                className={`vtk-admin-rail-btn${containsActive ? ' is-active' : ''}${isOpen ? ' is-open' : ''}`}
                aria-label={node.label}
                aria-expanded={isOpen}
                onClick={() => setFlyout(isOpen ? null : node.key)}
              >
                {icons[node.key] ?? icons.groups}
              </button>
              {!isOpen && (
                <span className="vtk-admin-rail-tip" aria-hidden>
                  {node.label}
                </span>
              )}
              {isOpen && (
                <div className="vtk-admin-rail-flyout" role="group" aria-label={node.label}>
                  <p className="vtk-admin-rail-flyout-title">{node.label}</p>
                  {node.items.map((item) => {
                    const active = isActive(activeHref, item);
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`vtk-admin-rail-flyout-link${active ? ' is-active' : ''}`}
                      >
                        {icons[item.key] ?? icons.groups}
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function RailLink({
  item,
  icons,
  active,
  pinned,
}: {
  item: AdminNavItem;
  icons: Record<string, ReactNode>;
  active: boolean;
  pinned?: boolean;
}) {
  return (
    <div className="vtk-admin-rail-slot">
      <Link
        href={item.href}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={`vtk-admin-rail-btn${active ? ' is-active' : ''}`}
      >
        {icons[item.key] ?? icons.groups}
        {pinned && <span className="vtk-admin-rail-pin" aria-hidden />}
      </Link>
      <span className="vtk-admin-rail-tip" aria-hidden>
        {item.label}
      </span>
    </div>
  );
}

/** Een paneel met een pijltje: naar links is inklappen, naar rechts uitklappen. */
function PanelIcon({ expand }: { expand: boolean }) {
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
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9 3v18" />
      <path d={expand ? 'm14 9 3 3-3 3' : 'm16 15-3-3 3-3'} />
    </svg>
  );
}

/** Gevuld wanneer de tab vastgepind is, zodat de toestand in het icoon zit en
 *  niet enkel in de tooltip. */
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 10.5V4h6v6.5l2.5 3.5h-11L9 10.5Z" />
    </svg>
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
      className={`vtk-admin-nav-chevron${open ? ' is-open' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
