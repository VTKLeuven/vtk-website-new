'use client';

import { useEffect, useState } from 'react';
import { LogisticsIcon } from '@/components/logistics-icon';

const COLLAPSED_STORAGE_KEY = 'logistiek.beheer.sidebar_collapsed';

export function BeheerLayoutClient({
  kicker,
  title,
  nav,
  children,
}: {
  kicker: React.ReactNode;
  title: string;
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === 'true');
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + B of enkele '[' buiten tekstvelden
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggle();
      } else if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <main
      className={`mx-auto w-full flex-1 px-4 py-8 sm:px-8 transition-all duration-200 ${
        collapsed ? 'max-w-[1720px]' : 'max-w-[1440px]'
      }`}
    >
      <div data-print="hide" className="border-b border-vtk-navy/10 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm text-vtk-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
              {kicker}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">{title}</h1>
          </div>

          <button
            type="button"
            onClick={toggle}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              collapsed
                ? 'border-vtk-navy bg-vtk-navy text-white shadow-sm hover:bg-vtk-navy/90'
                : 'border-vtk-navy/20 bg-vtk-surface text-vtk-ink hover:border-vtk-navy/40 hover:bg-vtk-paper'
            }`}
            title={
              collapsed
                ? 'Zijbalk met beheer tabs uitklappen ([ of Ctrl+B)'
                : 'Zijbalk inklappen voor bredere weergave ([ of Ctrl+B)'
            }
            aria-label={collapsed ? 'Beheer tabs tonen' : 'Beheer tabs inklappen'}
          >
            <LogisticsIcon
              name={collapsed ? 'sidebarExpand' : 'sidebarCollapse'}
              className="h-4 w-4 shrink-0"
            />
            <span>{collapsed ? 'Tabs tonen' : 'Zijbalk inklappen'}</span>
          </button>
        </div>
      </div>

      {collapsed && (
        <button
          type="button"
          data-print="hide"
          onClick={toggle}
          className="fixed left-3 top-24 z-30 hidden items-center gap-1.5 rounded-full border border-vtk-navy/20 bg-vtk-surface/95 px-3 py-1.5 text-xs font-semibold text-vtk-ink shadow-md backdrop-blur transition hover:border-vtk-navy/40 hover:bg-vtk-paper sm:flex"
          title="Beheer tabs uitklappen ([ of Ctrl+B)"
        >
          <LogisticsIcon name="sidebarExpand" className="h-3.5 w-3.5" />
          <span>Tabs</span>
        </button>
      )}

      <div className={`logistics-admin-layout mt-8 ${collapsed ? 'is-collapsed' : ''}`}>
        <aside data-print="hide" className={collapsed ? 'hidden' : 'block'}>
          <div className="mb-2 hidden sm:flex justify-end">
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-vtk-muted transition hover:bg-vtk-paper hover:text-vtk-ink"
              title="Zijbalk inklappen ([ of Ctrl+B)"
            >
              <LogisticsIcon name="sidebarCollapse" className="h-3.5 w-3.5" />
              <span>Inklappen</span>
            </button>
          </div>
          {nav}
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
