"use client";

import { useEffect, useRef, useState } from "react";

export type PalPlusSearchCopy = { label: string; placeholder: string; noResults: string; clear: string };

/**
 * Zoeken in de agenda en de open vragen, terwijl je typt. De lijsten zelf
 * rendert de server; elk item draagt zijn zoektekst in `data-pp-search` (vak,
 * code, tags, omschrijving) en dit veld verbergt wat niet past. Zo blijft de
 * pagina volledig zonder JavaScript, en springt er niets bij het laden.
 *
 * Een dag zonder zichtbare sessie verdwijnt mee (`data-pp-group`), en elke
 * lijst toont haar eigen "niets gevonden" (`data-pp-noresults`).
 */
export function PalPlusSearch({ copy }: { copy: PalPlusSearchCopy }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const en = copy.label.toLowerCase() === "search";

  useEffect(() => {
    const terms = normalize(query).split(" ").filter(Boolean);
    let statusTimer: number | undefined;
    const apply = () => {
      let totalVisible = 0;
      for (const container of document.querySelectorAll<HTMLElement>("[data-pp-searchable]")) {
        let visible = 0;
        for (const item of container.querySelectorAll<HTMLElement>("[data-pp-search]")) {
          const text = normalize(item.dataset.ppSearch ?? "");
          const match = terms.every((term) => text.includes(term));
          item.hidden = !match;
          if (match) visible += 1;
        }
        totalVisible += visible;
        for (const group of container.querySelectorAll<HTMLElement>("[data-pp-group]")) {
          group.hidden = group.querySelector("[data-pp-search]:not([hidden])") === null;
        }
        const empty = container.querySelector<HTMLElement>("[data-pp-noresults]");
        if (empty) {
          empty.hidden = visible > 0 || terms.length === 0;
          empty.textContent = copy.noResults.replace("{query}", query.trim());
        }
      }

      if (statusTimer !== undefined) {
        window.clearTimeout(statusTimer);
        statusTimer = undefined;
      }
      if (terms.length > 0) {
        const nextStatus =
          totalVisible === 0
            ? copy.noResults.replace("{query}", query.trim())
            : en
              ? totalVisible === 1
                ? "1 result"
                : `${totalVisible} results`
              : totalVisible === 1
                ? "1 resultaat"
                : `${totalVisible} resultaten`;
        statusTimer = window.setTimeout(() => {
          setStatus(nextStatus);
        }, 200);
      }
    };
    apply();
    // Een inschrijving ververst de lijst; ook die nieuwe items moeten gefilterd blijven.
    const observer = new MutationObserver(() => {
      observer.disconnect();
      apply();
      observe();
    });
    const observe = () => {
      for (const container of document.querySelectorAll("[data-pp-searchable]")) {
        observer.observe(container, { childList: true, subtree: true });
      }
    };
    observe();
    return () => {
      observer.disconnect();
      if (statusTimer !== undefined) window.clearTimeout(statusTimer);
    };
  }, [query, copy.noResults, en]);

  return (
    <div className="pp-search" role="search">
      <label htmlFor="pp-search-input" className="sr-only">
        {copy.label}
      </label>
      <input
        ref={inputRef}
        id="pp-search-input"
        type="search"
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          if (!normalize(next)) setStatus("");
        }}
        placeholder={copy.placeholder}
        autoComplete="off"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setStatus("");
            inputRef.current?.focus();
          }}
        >
          {copy.clear}
        </button>
      )}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </p>
    </div>
  );
}

/** Kleine letters en zonder accenten: "theorie" vindt ook "Théorie". */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
