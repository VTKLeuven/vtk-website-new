"use client";

// Gedeelde bouwstenen voor de compacte, doorzoekbare en sorteerbare
// beheertabellen (Rollen, Posten, ...). Eén rij per item; klikken klapt een
// detailpaneel open met categorieën die elk apart bewerkbaar zijn.

import { useEffect, useMemo, useState, type ReactNode } from "react";

export type SortDir = "asc" | "desc";
export type Sort = { key: "name" | "count"; dir: SortDir } | null;

/**
 * Zoek-, sorteer- en uitklap-state voor een beheertabel. Sorteren gaat over twee
 * generieke sleutels: "name" (alfabetisch) en "count" (numeriek). Derde klik op
 * dezelfde kolom zet de sortering terug op de bronvolgorde.
 */
export function useTableControls<T>(
  rows: T[],
  opts: {
    searchOf: (r: T) => string;
    nameOf: (r: T) => string;
    countOf: (r: T) => number;
    locale: string;
  }
) {
  const { searchOf, nameOf, countOf, locale } = opts;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => searchOf(r).includes(q)) : rows.slice();
    if (sort) {
      list.sort((a, b) => {
        const cmp = sort.key === "name" ? nameOf(a).localeCompare(nameOf(b), locale) : countOf(a) - countOf(b);
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return list;
    // searchOf/nameOf/countOf zijn stabiel genoeg (inline arrow uit de render);
    // rows/query/sort zijn de echte triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, sort, locale]);

  function toggleSort(key: "name" | "count") {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: key === "count" ? "desc" : "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function toggleRow(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return {
    query,
    setQuery,
    sort,
    toggleSort,
    filtered,
    isOpen: (id: string) => open.has(id),
    toggleRow,
  };
}

/** Zoekbalk met loep-icoon. */
export function SearchBar({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative min-w-[220px] flex-1">
      <SearchIcon />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-full border border-vtk-blue/20 bg-white py-2 pl-9 pr-3 text-sm"
      />
    </div>
  );
}

/** Sorteerbare kolomkop. */
export function SortHeader({
  label,
  active,
  onClick,
  align = "left",
}: {
  label: string;
  active: SortDir | null;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th>
      <button
        type="button"
        onClick={onClick}
        className={"inline-flex items-center gap-1 " + (align === "right" ? "flex-row-reverse" : "")}
        aria-sort={active ? (active === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{label}</span>
        <SortCaret dir={active} />
      </button>
    </th>
  );
}

/**
 * Eén bewerkbare categorie in een uitgeklapte rij: titel + telling, met (indien
 * toegelaten) een Bewerken/Klaar-knop die tussen lees- en bewerk-modus wisselt.
 */
export function Panel({
  title,
  count,
  canEdit,
  editLabel,
  doneLabel,
  children,
}: {
  title: string;
  count: number;
  canEdit: boolean;
  editLabel: string;
  doneLabel: string;
  children: (editing: boolean) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="rounded-xl border border-vtk-blue/12 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-vtk-ink">
          {title}
          <span className="rounded-full bg-vtk-blue-soft/60 px-2 py-0.5 text-[11px] font-medium text-[#5c667f]">{count}</span>
        </h4>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="rounded-full border border-vtk-blue/20 px-3 py-1 text-xs font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
          >
            {editing ? doneLabel : editLabel}
          </button>
        )}
      </div>
      {children(editing)}
    </section>
  );
}

/** Profielfoto of initiaal. */
export function Avatar({ name, avatarUrl, sm }: { name: string; avatarUrl: string | null; sm?: boolean }) {
  const size = sm ? "h-7 w-7" : "h-8 w-8";
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-full border border-vtk-blue/10 bg-vtk-blue-soft`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-xs font-semibold text-[#5c667f]">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

/** Eenvoudige modal-schil (Escape + klik-buiten sluiten). */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="w-full max-w-xl rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-vtk-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-[#5c667f] hover:text-vtk-ink" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Toggle-knop in de stijl van een checkbox (voor rechten-/rol-grants). */
export function ToggleDot({ on, title }: { on: boolean; title: string }) {
  return (
    <button
      type="submit"
      className={"inline-block h-4 w-4 rounded border " + (on ? "border-vtk-blue bg-vtk-blue" : "border-zinc-400")}
      aria-pressed={on}
      title={title}
    />
  );
}

export function Chevron({ open }: { open: boolean }) {
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
      className={"mt-0.5 shrink-0 text-[#5c667f] transition-transform " + (open ? "rotate-90" : "")}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SortCaret({ dir }: { dir: SortDir | null }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={dir ? "text-vtk-ink" : "text-zinc-300"}
    >
      {dir === "desc" ? <polyline points="6 9 12 15 18 9" /> : <polyline points="18 15 12 9 6 15" />}
    </svg>
  );
}

function SearchIcon() {
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
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5c667f]"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
