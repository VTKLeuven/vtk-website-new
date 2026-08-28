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
    /** Uitleg onder de lege vastgepind-sectie. */
    empty: string;
  };
};

export type AdminNavProps = {
  title: string;
  nodes: AdminNavNode[];
  icons?: Record<string, ReactNode>;
  pins?: AdminNavPins;
};

const TOP_GAP = 96;
const BOTTOM_GAP = 24;
const TWO_COLUMN = '(min-width: 860px)';

function isActive(pathname: string, item: AdminNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function useSmartSticky<T extends HTMLElement>() {
  const ref = useRef<T>(null);

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
        return;
      }

      const y = window.scrollY;
      const scrollingDown = y > lastY;
      lastY = y;
      const viewport = window.innerHeight;
      const navHeight = element.offsetHeight;
      const columnTop = column.getBoundingClientRect().top;
      const top = columnTop + offset;

      if (navHeight + TOP_GAP + BOTTOM_GAP <= viewport) {
        offset += TOP_GAP - top;
      } else if (scrollingDown) {
        const bottom = top + navHeight;
        if (bottom < viewport - BOTTOM_GAP) offset += viewport - BOTTOM_GAP - bottom;
      } else if (top > TOP_GAP) {
        offset -= top - TOP_GAP;
      }

      offset = Math.max(0, Math.min(offset, column.offsetHeight - navHeight));
      element.style.transform = offset > 0 ? `translate3d(0, ${Math.round(offset)}px, 0)` : '';
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(column);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      media.removeEventListener('change', schedule);
      observer.disconnect();
      element.style.transform = '';
    };
  }, []);

  return ref;
}

function activeLabel(nodes: AdminNavNode[], pathname: string, fallback: string): string {
  for (const node of nodes) {
    if (node.type === 'item') {
      if (isActive(pathname, node.item)) return node.item.label;
    } else {
      const hit = node.items.find((item) => isActive(pathname, item));
      if (hit) return hit.label;
    }
  }
  return fallback;
}

/** Alle tabs die de gebruiker mag zien, plat, om een pin op te kunnen zoeken. */
function flatten(nodes: AdminNavNode[]): AdminNavItem[] {
  return nodes.flatMap((node) => (node.type === 'item' ? [node.item] : node.items));
}

export function AdminNav({ title, nodes, icons = {}, pins }: AdminNavProps) {
  const pathname = usePathname();
  const stickyRef = useSmartSticky<HTMLDivElement>();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const current = activeLabel(nodes, pathname, title);

  const [previousPath, setPreviousPath] = useState(pathname);
  if (pathname !== previousPath) {
    setPreviousPath(pathname);
    if (open) setOpen(false);
  }

  const pinState = usePins(pins);
  // Eén context voor elke rij, zodat de rijen zelf niets over de prop hoeven te
  // weten: null betekent gewoon "geen speldjes".
  const pinCtx: PinCtx | null = pins && pinState ? { pins, state: pinState } : null;

  return (
    <div className="vtk-admin-nav-sticky" ref={stickyRef}>
      <h2 className="vtk-admin-nav-title">{title}</h2>
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
          <PinnedSection nodes={nodes} pathname={pathname} icons={icons} pins={pinCtx.pins} state={pinCtx.state} />
        )}
        {nodes.map((node) =>
          node.type === 'item' ? (
            <NavLink
              key={node.item.key}
              item={node.item}
              active={isActive(pathname, node.item)}
              icons={icons}
              pin={pinCtx}
            />
          ) : (
            <NavGroup
              key={node.key}
              group={node}
              pathname={pathname}
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
  pathname,
  icons,
  pins,
  state,
}: {
  nodes: AdminNavNode[];
  pathname: string;
  icons: Record<string, ReactNode>;
  pins: AdminNavPins;
  state: PinState;
}) {
  const byKey = new Map(flatten(nodes).map((item) => [item.key, item]));
  // Een pin op een tab die je niet (meer) mag zien, slaan we over in plaats van
  // ze te verwijderen: rechten kunnen volgend werkingsjaar terugkomen.
  const items = state.keys.map((key) => byKey.get(key)).filter((item): item is AdminNavItem => !!item);

  return (
    <div className="vtk-admin-nav-pinned">
      <p className="vtk-admin-nav-section">{pins.labels.section}</p>
      {items.length === 0 ? (
        <p className="vtk-admin-nav-pinned-empty">{pins.labels.empty}</p>
      ) : (
        items.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={isActive(pathname, item)}
            icons={icons}
            pin={{ pins, state }}
          />
        ))
      )}
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
  pathname,
  icons,
  pin,
}: {
  group: Extract<AdminNavNode, { type: 'group' }>;
  pathname: string;
  icons: Record<string, ReactNode>;
  pin?: PinCtx | null;
}) {
  const containsActive = group.items.some((item) => isActive(pathname, item));
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
            active={isActive(pathname, item)}
            icons={icons}
            sub
            pin={pin}
          />
        ))}
      </div>
    </div>
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
