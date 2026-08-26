"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LESBEZOEK_BACHELORS, LESBEZOEK_MASTERS } from "@/lib/lesbezoeken";

export function AudienceCombobox({
  id,
  name = "audience",
  defaultValue = "",
  placeholder = "Kies of typ een doelgroep…",
  required = false,
  maxLength = 150,
  className = "",
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const [query, setQuery] = useState(defaultValue);
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

  const handleSelect = (item: string) => {
    setQuery(item);
    setIsOpen(false);
    setHighlightedIndex(-1);
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
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < allFilteredOptions.length) {
        e.preventDefault();
        handleSelect(allFilteredOptions[highlightedIndex]!);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          autoComplete="off"
          className="w-full rounded-xl border border-vtk-blue/20 bg-white px-3.5 py-2 pr-10 text-sm text-vtk-ink shadow-xs transition-colors placeholder:text-zinc-400 hover:border-vtk-blue/30 focus:border-vtk-blue focus:outline-none focus:ring-2 focus:ring-vtk-blue/20"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setIsOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-lg text-[#5c667f] transition-colors hover:bg-vtk-blue-soft hover:text-vtk-ink"
          aria-label="Doelgroepen menu openen"
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
          {query.trim() && !hasExactMatch && (
            <div
              onClick={() => handleSelect(query.trim())}
              className="border-b border-vtk-blue/10 bg-vtk-blue-soft/30 px-3.5 py-2 text-sm text-vtk-ink transition-colors hover:bg-vtk-blue-soft cursor-pointer flex items-center justify-between"
            >
              <span className="font-medium">
                Eigen doelgroep: <span className="font-normal text-[#5c667f]">&ldquo;{query.trim()}&rdquo;</span>
              </span>
              <span className="rounded-full bg-vtk-blue/10 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                Vrij veld
              </span>
            </div>
          )}

          {filteredBachelors.length > 0 && (
            <div>
              <div className="sticky top-0 bg-zinc-50/95 backdrop-blur-xs px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5c667f] border-y border-zinc-200/50 first:border-t-0">
                Bachelors ({filteredBachelors.length})
              </div>
              {filteredBachelors.map((item) => {
                const itemIndex = allFilteredOptions.indexOf(item);
                const isHighlighted = highlightedIndex === itemIndex;
                const isSelected = query.trim().toLowerCase() === item.toLowerCase();

                return (
                  <div
                    key={item}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    className={`flex cursor-pointer items-center justify-between px-3.5 py-1.5 text-sm transition-colors ${
                      isHighlighted
                        ? "bg-vtk-blue-soft text-vtk-ink font-medium"
                        : isSelected
                          ? "bg-vtk-blue-soft/50 text-vtk-ink font-medium"
                          : "text-zinc-700 hover:bg-vtk-blue-soft/40"
                    }`}
                  >
                    <span>{item}</span>
                    {isSelected && (
                      <span className="text-xs text-vtk-ink font-bold" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {filteredMasters.length > 0 && (
            <div>
              <div className="sticky top-0 bg-zinc-50/95 backdrop-blur-xs px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5c667f] border-y border-zinc-200/50">
                Masters ({filteredMasters.length})
              </div>
              {filteredMasters.map((item) => {
                const itemIndex = allFilteredOptions.indexOf(item);
                const isHighlighted = highlightedIndex === itemIndex;
                const isSelected = query.trim().toLowerCase() === item.toLowerCase();

                return (
                  <div
                    key={item}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    className={`flex cursor-pointer items-center justify-between px-3.5 py-1.5 text-sm transition-colors ${
                      isHighlighted
                        ? "bg-vtk-blue-soft text-vtk-ink font-medium"
                        : isSelected
                          ? "bg-vtk-blue-soft/50 text-vtk-ink font-medium"
                          : "text-zinc-700 hover:bg-vtk-blue-soft/40"
                    }`}
                  >
                    <span>{item}</span>
                    {isSelected && (
                      <span className="text-xs text-vtk-ink font-bold" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {filteredBachelors.length === 0 && filteredMasters.length === 0 && !query.trim() && (
            <div className="p-3 text-center text-xs text-[#5c667f]">
              Geen doelgroepen gevonden
            </div>
          )}
        </div>
      )}
    </div>
  );
}
