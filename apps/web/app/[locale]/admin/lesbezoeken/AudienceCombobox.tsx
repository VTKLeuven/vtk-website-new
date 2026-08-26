"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  LESBEZOEK_BACHELORS,
  LESBEZOEK_MASTERS,
  parseAudienceList,
} from "@/lib/lesbezoeken";

export function AudienceCombobox({
  id,
  name = "audience",
  defaultValue = "",
  placeholder,
  required = false,
  maxLength = 500,
  nl = true,
  className = "",
}: {
  id?: string;
  name?: string;
  defaultValue?: string | string[];
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  nl?: boolean;
  className?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  // Initialiseer geselecteerde doelgroepen
  const [selected, setSelected] = useState<string[]>(() =>
    parseAudienceList(defaultValue),
  );
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sluit de dropdown bij klik buiten de component
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter de bachelors en masters op basis van de ingevoerde zoekopdracht
  const filteredBachelors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LESBEZOEK_BACHELORS;
    return LESBEZOEK_BACHELORS.filter((item) => item.toLowerCase().includes(q));
  }, [query]);

  const filteredMasters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LESBEZOEK_MASTERS;
    return LESBEZOEK_MASTERS.filter((item) => item.toLowerCase().includes(q));
  }, [query]);

  // Vlakke lijst van alle gefilterde opties voor toetsenbordnavigatie
  const allFilteredOptions = useMemo(() => {
    return [...filteredBachelors, ...filteredMasters];
  }, [filteredBachelors, filteredMasters]);

  const hasExactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allFilteredOptions.some((item) => item.toLowerCase() === q);
  }, [query, allFilteredOptions]);

  const toggleItem = (item: string) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );
    setQuery("");
    inputRef.current?.focus();
  };

  const addCustomItem = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed) return;
    if (!selected.includes(trimmed)) {
      setSelected((prev) => [...prev, trimmed]);
    }
    setQuery("");
    inputRef.current?.focus();
  };

  const removeItem = (item: string) => {
    setSelected((prev) => prev.filter((i) => i !== item));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) =>
          prev < allFilteredOptions.length - 1 ? prev + 1 : 0,
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(allFilteredOptions.length - 1);
      } else {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : allFilteredOptions.length - 1,
        );
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < allFilteredOptions.length) {
        toggleItem(allFilteredOptions[highlightedIndex]!);
      } else if (query.trim()) {
        addCustomItem(query);
      }
    } else if (e.key === "Backspace" && !query && selected.length > 0) {
      removeItem(selected[selected.length - 1]!);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const defaultPlaceholderText = nl
    ? "Kies of typ doelgroepen…"
    : "Choose or type target audiences…";

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {/* Hidden input voor FormData submit */}
      <input type="hidden" name={name} value={selected.join(", ")} />
      {selected.map((item) => (
        <input key={item} type="hidden" name={`${name}List`} value={item} />
      ))}

      {/* Validatie-input voor native HTML5 form validatie */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required={required && selected.length === 0}
          value={selected.length > 0 ? "valid" : ""}
          onChange={() => {}}
          className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0 -translate-x-1/2 opacity-0"
        />
      )}

      <div
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
        className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-xl border border-vtk-blue/20 bg-white px-3 py-1.5 pr-9 text-sm text-vtk-ink shadow-xs transition-colors hover:border-vtk-blue/30 focus-within:border-vtk-blue focus-within:ring-2 focus-within:ring-vtk-blue/20 cursor-text"
      >
        {selected.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-lg border border-vtk-blue/25 bg-vtk-blue-soft/80 px-2 py-0.5 text-xs font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft"
          >
            <span className="max-w-[200px] truncate sm:max-w-none">{item}</span>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                removeItem(item);
              }}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[#5c667f] transition-colors hover:bg-vtk-blue/20 hover:text-vtk-ink"
              aria-label={nl ? `Verwijder ${item}` : `Remove ${item}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? (placeholder ?? defaultPlaceholderText) : ""}
          maxLength={maxLength}
          autoComplete="off"
          className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-vtk-ink placeholder:text-zinc-400 focus:outline-none"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-lg text-[#5c667f] transition-colors hover:bg-vtk-blue-soft hover:text-vtk-ink"
          aria-label={nl ? "Doelgroepen menu openen" : "Open target audience menu"}
        >
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
            className={`transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-vtk-blue/15 bg-white py-1 shadow-lg">
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-1.5 text-xs text-[#5c667f]">
              <span>
                {selected.length} {nl ? "geselecteerd" : "selected"}
              </span>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="font-medium text-vtk-ink underline underline-offset-2 hover:text-black"
              >
                {nl ? "Wis alles" : "Clear all"}
              </button>
            </div>
          )}

          {query.trim() && !hasExactMatch && (
            <div
              onClick={() => addCustomItem(query.trim())}
              className="border-b border-vtk-blue/10 bg-vtk-blue-soft/30 px-3.5 py-2 text-sm text-vtk-ink transition-colors hover:bg-vtk-blue-soft cursor-pointer flex items-center justify-between"
            >
              <span className="font-medium">
                {nl ? "Eigen doelgroep toevoegen:" : "Add custom audience:"}{" "}
                <span className="font-normal text-[#5c667f]">&ldquo;{query.trim()}&rdquo;</span>
              </span>
              <span className="rounded-full bg-vtk-blue/10 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                + {nl ? "Toevoegen" : "Add"}
              </span>
            </div>
          )}

          {filteredBachelors.length > 0 && (
            <div>
              <div className="sticky top-0 bg-zinc-50/95 backdrop-blur-xs px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#5c667f] border-y border-zinc-200/50 first:border-t-0">
                Bachelors ({filteredBachelors.length})
              </div>
              {filteredBachelors.map((item) => {
                const itemIndex = allFilteredOptions.indexOf(item);
                const isHighlighted = highlightedIndex === itemIndex;
                const isChecked = selected.includes(item);

                return (
                  <div
                    key={item}
                    onClick={() => toggleItem(item)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    className={`flex cursor-pointer items-center justify-between px-3.5 py-1.5 text-sm transition-colors ${
                      isHighlighted
                        ? "bg-vtk-blue-soft text-vtk-ink font-medium"
                        : isChecked
                          ? "bg-vtk-blue-soft/40 text-vtk-ink font-medium"
                          : "text-zinc-700 hover:bg-vtk-blue-soft/30"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] transition-colors ${
                          isChecked
                            ? "border-vtk-ink bg-vtk-ink text-white font-bold"
                            : "border-zinc-300 bg-white"
                        }`}
                      >
                        {isChecked ? "✓" : ""}
                      </span>
                      <span>{item}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {filteredMasters.length > 0 && (
            <div>
              <div className="sticky top-0 bg-zinc-50/95 backdrop-blur-xs px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#5c667f] border-y border-zinc-200/50">
                Masters ({filteredMasters.length})
              </div>
              {filteredMasters.map((item) => {
                const itemIndex = allFilteredOptions.indexOf(item);
                const isHighlighted = highlightedIndex === itemIndex;
                const isChecked = selected.includes(item);

                return (
                  <div
                    key={item}
                    onClick={() => toggleItem(item)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    className={`flex cursor-pointer items-center justify-between px-3.5 py-1.5 text-sm transition-colors ${
                      isHighlighted
                        ? "bg-vtk-blue-soft text-vtk-ink font-medium"
                        : isChecked
                          ? "bg-vtk-blue-soft/40 text-vtk-ink font-medium"
                          : "text-zinc-700 hover:bg-vtk-blue-soft/30"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] transition-colors ${
                          isChecked
                            ? "border-vtk-ink bg-vtk-ink text-white font-bold"
                            : "border-zinc-300 bg-white"
                        }`}
                      >
                        {isChecked ? "✓" : ""}
                      </span>
                      <span>{item}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {filteredBachelors.length === 0 && filteredMasters.length === 0 && !query.trim() && (
            <div className="p-3 text-center text-xs text-[#5c667f]">
              {nl ? "Geen doelgroepen gevonden" : "No target audiences found"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
