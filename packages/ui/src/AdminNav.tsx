'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import './admin-nav.css';

export type AdminNavItem = {
  key: string;
  href: string;
  label: string;
  exact?: boolean;
};

export type AdminNavNode =
  { type: 'item'; item: AdminNavItem } | { type: 'group'; key: string; label: string; items: AdminNavItem[] };

export type AdminNavProps = {
  title: string;
  nodes: AdminNavNode[];
  icons?: Record<string, ReactNode>;
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

export function AdminNav({ title, nodes, icons = {} }: AdminNavProps) {
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
        {nodes.map((node) =>
          node.type === 'item' ? (
            <NavLink key={node.item.key} item={node.item} active={isActive(pathname, node.item)} icons={icons} />
          ) : (
            <NavGroup key={node.key} group={node} pathname={pathname} icons={icons} />
          )
        )}
      </nav>
    </div>
  );
}

function NavLink({
  item,
  active,
  icons,
  sub,
}: {
  item: AdminNavItem;
  active: boolean;
  icons: Record<string, ReactNode>;
  sub?: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-2${sub ? ' vtk-admin-nav-sublink' : ''}${active ? ' is-active' : ''}`}
    >
      {icons[item.key] ?? icons.groups}
      <span>{item.label}</span>
    </Link>
  );
}

function NavGroup({
  group,
  pathname,
  icons,
}: {
  group: Extract<AdminNavNode, { type: 'group' }>;
  pathname: string;
  icons: Record<string, ReactNode>;
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
          <NavLink key={item.key} item={item} active={isActive(pathname, item)} icons={icons} sub />
        ))}
      </div>
    </div>
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
