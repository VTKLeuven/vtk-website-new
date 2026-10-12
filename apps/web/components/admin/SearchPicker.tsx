"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type SearchPickerOption = {
  value: string;
  label: string;
  /** Kleine tekst achter het label, ook doorzocht (de post van een lid). */
  hint?: string;
  /** Kop boven een groep; een opeenvolgende reeks met dezelfde kop staat eronder. */
  group?: string;
  /** Een keuze die geen persoon is ("Geen praesidium"): grijs, zoals "geen code". */
  muted?: boolean;
};

/** Zonder accenten en hoofdletters, zodat "amelie" Amélie vindt. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Scrol enkel de lijst, niet de pagina; zelfde rekenwijze als de
 * boekhoudcodekiezer (layoutpixels, dus de zoom van 90% doet er niet toe).
 */
function scrollWithin(list: HTMLElement | null, item: HTMLElement | null, mode: "center" | "nearest") {
  if (!list || !item) return;
  const top = item.offsetTop;
  const bottom = top + item.offsetHeight;
  if (mode === "center") list.scrollTop = top - (list.clientHeight - item.offsetHeight) / 2;
  else if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}

/**
 * Een keuzelijst waarin je kan typen. Voor een lijst van tachtig
 * praesidiumleden is de keuzelijst van de browser niet te doen: je scrolt tot
 * je de naam tegenkomt. Hier tik je "lore" en zie je enkel de Lores.
 *
 * Zelfde vorm en klassen als de boekhoudcodekiezer (`vtk-code-picker`): één
 * uitzicht voor "kies uit een lange lijst" in de hele admin. De waarde gaat als
 * gewoon formulierveld mee wanneer `name` gezet is, zodat een server action
 * dezelfde FormData krijgt als bij een native select.
 */
export function SearchPicker({
  options,
  name,
  id,
  value: controlledValue,
  defaultValue = "",
  onChange,
  placeholder,
  searchPlaceholder,
  ariaLabel,
  emptyText,
  disabled = false,
  attention = false,
  autoOpen = false,
}: {
  options: readonly SearchPickerOption[];
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Wat de knop toont zonder keuze. */
  placeholder: string;
  searchPlaceholder: string;
  ariaLabel: string;
  /** Melding als niets past; krijgt de zoekterm. */
  emptyText: (query: string) => string;
  disabled?: boolean;
  /** Vraagt aandacht (een open keuze): een gele rand op de knop. */
  attention?: boolean;
  /**
   * Staat open zodra hij verschijnt, met de focus in het zoekveld: voor een
   * kiezer die pas na een klik op een andere knop verschijnt, zodat dat niet
   * nog een tweede klik vraagt.
   */
  autoOpen?: boolean;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const [internal, setInternal] = useState(defaultValue);
  const value = controlledValue ?? internal;
  const [open, setOpen] = useState(autoOpen);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(() =>
    autoOpen ? Math.max(0, options.findIndex((option) => option.value === value)) : 0,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return options;
    return options.filter((option) => {
      const haystack = fold(`${option.label} ${option.hint ?? ""}`);
      return words.every((word) => haystack.includes(word));
    });
  }, [options, query]);
  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!autoOpen) return;
    searchRef.current?.focus();
    scrollWithin(
      listRef.current,
      listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null,
      "center",
    );
  }, [autoOpen]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollWithin(
      listRef.current,
      listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`) ?? null,
      "nearest",
    );
  }, [highlighted, open]);

  function openList() {
    if (disabled) return;
    setQuery("");
    const current = options.findIndex((option) => option.value === value);
    setHighlighted(current >= 0 ? current : 0);
    setOpen(true);
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      scrollWithin(
        listRef.current,
        listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null,
        "center",
      );
    });
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(next: string) {
    if (controlledValue === undefined) setInternal(next);
    if (next !== value) onChange?.(next);
    close(true);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visible.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((current) => (current + step + visible.length) % visible.length);
    } else if (event.key === "Enter") {
      // Nooit het hele formulier versturen vanuit het zoekveld.
      event.preventDefault();
      const option = visible[highlighted];
      if (option) choose(option.value);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  // Focus blijft in het zoekveld, zodat de pijltjes en Enter blijven werken.
  const keepFocus = (event: ReactPointerEvent) => event.preventDefault();

  return (
    <div
      ref={rootRef}
      className="vtk-code-picker"
      data-open={open || undefined}
      data-attention={(attention && !value) || undefined}
    >
      {name ? (
        <span className="vtk-code-picker-value">
          <input name={name} value={value} onChange={() => {}} tabIndex={-1} aria-hidden="true" />
        </span>
      ) : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="vtk-code-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openList();
          }
        }}
      >
        {selected && selected.value !== "" ? (
          <span className="vtk-code-picker-current">
            <span className={selected.muted ? "vtk-code-picker-placeholder" : "vtk-code-picker-name"}>{selected.label}</span>
            {selected.hint ? <span className="vtk-code-picker-parent">{selected.hint}</span> : null}
          </span>
        ) : (
          <span className="vtk-code-picker-placeholder">{placeholder}</span>
        )}
        <ChevronDown aria-hidden="true" size={17} />
      </button>

      {open ? (
        <div className="vtk-code-picker-popover">
          <div className="vtk-code-picker-search">
            <Search aria-hidden="true" size={16} />
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              autoComplete="off"
              aria-label={ariaLabel}
              aria-controls={listId}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={visible.length > 0 ? `${listId}-${highlighted}` : undefined}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlighted(0);
              }}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          <div ref={listRef} id={listId} className="vtk-code-picker-list" role="listbox">
            {visible.map((option, index) => {
              const heading = option.group && option.group !== visible[index - 1]?.group ? option.group : null;
              return (
                <div key={option.value || "none"} role="presentation">
                  {heading ? (
                    <div className="vtk-code-picker-heading" role="presentation">
                      {heading}
                    </div>
                  ) : null}
                  <button
                    id={`${listId}-${index}`}
                    data-index={index}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={option.value === value}
                    data-highlighted={index === highlighted || undefined}
                    className={option.muted ? "vtk-code-picker-none" : undefined}
                    onPointerMove={() => setHighlighted(index)}
                    onPointerDown={keepFocus}
                    onClick={() => choose(option.value)}
                  >
                    <span className="vtk-code-picker-name">{option.label}</span>
                    {option.hint ? <span className="vtk-code-picker-parent">{option.hint}</span> : null}
                    {option.value === value ? <Check aria-hidden="true" size={16} /> : null}
                  </button>
                </div>
              );
            })}
            {visible.length === 0 ? <p className="vtk-code-picker-empty">{emptyText(query.trim())}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
