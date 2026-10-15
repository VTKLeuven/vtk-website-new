"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { SearchPickerOption } from "./SearchPicker";

/** Zonder accenten en hoofdletters, zodat "theo" Theokot vindt. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * `SearchPicker`, maar met meer dan één keuze: je vinkt aan en past toe. Voor
 * een budget dat bij twee posten hoort ("Cultuur + Onthaal"). Toepassen in
 * plaats van bewaren bij elke klik: anders bewaart de eerste klik een halve
 * keuze, en zie je een toast voor iets wat je nog niet af had.
 *
 * Zelfde klassen als de boekhoudcodekiezer, zodat het er hetzelfde uitziet.
 */
export function SearchMultiPicker({
  options,
  value,
  onApply,
  placeholder,
  searchPlaceholder,
  ariaLabel,
  applyLabel,
  emptyText,
  clearText,
  disabled = false,
  attention = false,
  autoOpen = false,
  onClose,
}: {
  options: readonly SearchPickerOption[];
  /** De keuze zoals ze nu bewaard is. */
  value: readonly string[];
  onApply: (values: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  ariaLabel: string;
  applyLabel: string;
  emptyText: (query: string) => string;
  /** Wat leeg toepassen doet, in de voet zodra alles uitgevinkt is. */
  clearText?: string;
  disabled?: boolean;
  attention?: boolean;
  autoOpen?: boolean;
  onClose?: () => void;
}) {
  const listId = `${useId()}-list`;
  const [open, setOpen] = useState(autoOpen);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([...value]);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Eerst op de naam; enkel als geen enkele naam past, op de groep ("werkgroep"
  // toont dan alle werkgroepen). Anders vindt "overige" eerst Jaarwerkingen,
  // omdat die in de groep "Jaarwerkingen en overige" staat.
  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return options;
    const matches = (text: string) => words.every((word) => fold(text).includes(word));
    const byName = options.filter((option) => matches(`${option.label} ${option.hint ?? ""}`));
    return byName.length > 0 ? byName : options.filter((option) => matches(`${option.label} ${option.hint ?? ""} ${option.group ?? ""}`));
  }, [options, query]);

  const names = value.map((v) => options.find((o) => o.value === v)?.label ?? v);

  // Na het renderen, niet in een volgend frame: wie meteen begint te typen,
  // typt anders nog in de knop.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  });

  function openList() {
    if (disabled) return;
    setPicked([...value]);
    setQuery("");
    setHighlighted(0);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setQuery("");
    onClose?.();
    if (returnFocus) triggerRef.current?.focus();
  }

  function toggle(next: string) {
    setPicked((current) => (current.includes(next) ? current.filter((v) => v !== next) : [...current, next]));
  }

  function apply() {
    onApply(picked);
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
      event.preventDefault();
      // Enter vinkt aan; Cmd/Ctrl+Enter past toe.
      if (event.metaKey || event.ctrlKey) apply();
      else if (visible[highlighted]) toggle(visible[highlighted].value);
    }
  }

  const keepFocus = (event: ReactPointerEvent) => event.preventDefault();

  return (
    <div ref={rootRef} className="vtk-code-picker" data-open={open || undefined} data-attention={(attention && value.length === 0) || undefined}>
      <button
        ref={triggerRef}
        type="button"
        className="vtk-code-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={names.length ? `${ariaLabel}: ${names.join(", ")}` : ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close(true) : openList())}
      >
        {names.length ? (
          <span className="vtk-code-picker-current">
            <span className="vtk-code-picker-name">{names.join(" + ")}</span>
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
          <div id={listId} className="vtk-code-picker-list" role="listbox" aria-multiselectable="true">
            {visible.map((option, index) => {
              const heading = option.group && option.group !== visible[index - 1]?.group ? option.group : null;
              const on = picked.includes(option.value);
              return (
                <div key={option.value} role="presentation">
                  {heading ? (
                    <div className="vtk-code-picker-heading" role="presentation">
                      {heading}
                    </div>
                  ) : null}
                  <button
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={on}
                    data-highlighted={index === highlighted || undefined}
                    onPointerMove={() => setHighlighted(index)}
                    onPointerDown={keepFocus}
                    onClick={() => toggle(option.value)}
                  >
                    <span className="vtk-code-picker-name">{option.label}</span>
                    {option.hint ? <span className="vtk-code-picker-parent">{option.hint}</span> : null}
                    {on ? <Check aria-hidden="true" size={16} /> : null}
                  </button>
                </div>
              );
            })}
            {visible.length === 0 ? <p className="vtk-code-picker-empty">{emptyText(query.trim())}</p> : null}
          </div>
          <div className="vtk-code-picker-footer">
            <span>
              {picked.length
                ? picked.map((v) => options.find((o) => o.value === v)?.label ?? v).join(" + ")
                : value.length && clearText
                  ? clearText
                  : placeholder}
            </span>
            <button type="button" className="vtk-code-picker-apply" onPointerDown={keepFocus} onClick={apply} disabled={picked.length === 0 && value.length === 0}>
              {applyLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
