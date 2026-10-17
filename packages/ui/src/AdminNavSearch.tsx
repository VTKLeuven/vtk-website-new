'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { AdminNavNode } from './AdminNav';
import { matchAdminNav } from './admin-nav-match';

/**
 * Zoeken is optioneel, net als vastpinnen en inklappen: zonder deze prop is er
 * geen zoekveld en geen sneltoets.
 *
 * Het veld bovenaan de zijbalk opent een venster waarin je een tab op naam
 * zoekt, ook op de naam van zijn groep. Ctrl/Cmd+K opent het overal, ook met de
 * zijbalk ingeklapt: daarom hangt het venster niet aan de zijbalk maar ligt het
 * als `<dialog>` boven de pagina.
 */
export type AdminNavSearch = {
  labels: {
    /** Tekst in het veld, en de naam van het venster. */
    open: string;
    placeholder: string;
    /** Staat voor de zoekopdracht wanneer niets past. */
    empty: string;
  };
};

/**
 * Ctrl+K of Cmd+K, ook vanuit een invulveld: wie de admin doorzoekt, staat vaak
 * net in een formulier. Een editor die Mod-K zelf gebruikt (voor een link),
 * roept `preventDefault` en gaat dan voor.
 */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.shiftKey) return false;
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
}

const noSubscribe = () => () => {};

/**
 * De sneltoets zoals ze op dit toestel heet. Op de server en in de eerste render
 * null, zodat de HTML overal dezelfde is; de hint verschijnt na het hydrateren.
 */
export function useSearchShortcutLabel(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'),
    () => null
  );
}

export function AdminNavSearchDialog({
  open,
  onClose,
  nodes,
  icons,
  activeHref,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  nodes: AdminNavNode[];
  icons: Record<string, ReactNode>;
  activeHref: string | null;
  labels: AdminNavSearch['labels'];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // `showModal` en niet een `position: fixed`-laag: de zijbalk schuift met een
  // transform mee (useSmartSticky), en daarbinnen zou `fixed` aan de zijbalk
  // hangen in plaats van aan het scherm. De top layer heeft daar geen last van,
  // en geeft de focus terug aan het veld of de knop waarmee je opende.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('input')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="vtk-admin-search"
      aria-label={labels.open}
      // Escape sluit een `<dialog>` zelf; dit houdt de state gelijk.
      onClose={onClose}
      onClick={(event) => {
        // Een klik op de backdrop komt binnen op de dialog zelf.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <SearchPanel nodes={nodes} icons={icons} activeHref={activeHref} labels={labels} onClose={onClose} />
      )}
    </dialog>
  );
}

/** Apart van de dialog, zodat elke keer openen met een leeg veld begint. */
function SearchPanel({
  nodes,
  icons,
  activeHref,
  labels,
  onClose,
}: {
  nodes: AdminNavNode[];
  icons: Record<string, ReactNode>;
  activeHref: string | null;
  labels: AdminNavSearch['labels'];
  onClose: () => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const optionRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const results = matchAdminNav(nodes, query);
  const current = Math.min(active, results.length - 1);

  useEffect(() => {
    optionRefs.current[current]?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const move = (step: number) => {
    if (results.length === 0) return;
    setActive((current + step + results.length) % results.length);
  };

  return (
    <div className="vtk-admin-search-panel">
      <div className="vtk-admin-search-field">
        <SearchIcon />
        <input
          type="text"
          className="vtk-admin-search-input"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length > 0 ? `${listId}-${current}` : undefined}
          aria-label={labels.open}
          placeholder={labels.placeholder}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              // Een klik op de link zelf, zodat Enter precies doet wat een
              // muisklik doet, ook bij een tab die naar een andere site gaat.
              optionRefs.current[current]?.click();
            }
          }}
        />
      </div>
      {results.length > 0 ? (
        <div className="vtk-admin-search-list" id={listId} role="listbox" aria-label={labels.open}>
          {results.map(({ item, group }, index) => (
            <Link
              key={item.key}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              id={`${listId}-${index}`}
              href={item.href}
              role="option"
              aria-selected={index === current}
              aria-current={item.href === activeHref ? 'page' : undefined}
              tabIndex={-1}
              className="vtk-admin-search-option"
              // Op beweging en niet op enter: anders pakt een muis die stilstaat
              // de keuze af zodra de lijst onder hem door scrolt.
              onMouseMove={() => {
                if (index !== current) setActive(index);
              }}
              onClick={(event) => {
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey) onClose();
              }}
            >
              {icons[item.key] ?? icons.groups}
              <span className="vtk-admin-search-option-label">{item.label}</span>
              {group && <span className="vtk-admin-search-option-group">{group}</span>}
            </Link>
          ))}
        </div>
      ) : (
        <p className="vtk-admin-search-empty" role="status">
          {labels.empty} “{query.trim()}”
        </p>
      )}
    </div>
  );
}

export function SearchIcon() {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
