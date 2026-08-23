"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AdminLocale } from "./format";

type Candidate = { id: string; name: string; email: string; rNumber: string | null };

/**
 * Iemand kiezen om een rol te geven, op naam, e-mail of r-nummer.
 *
 * Vervangt het kale e-mailveld dat hier stond. Dat werkte enkel als je het adres
 * uit het hoofd kende, en net voor de mensen die je hier toevoegt (iemand van
 * buiten het praesidium die komt helpen aan de deur) is dat zelden zo; een
 * r-nummer staat wel op hun kaart.
 *
 * Rendert enkel een veld plus een verborgen `userId`, zodat dit binnen het
 * bestaande `<form action={addTicketUserGrantAction}>` past. Die action aanvaardt
 * `userId` al, dus er verandert niets aan de serverkant.
 */
export function PersonPicker({
  eventId,
  locale,
  inputId,
}: {
  eventId: string;
  locale: AdminLocale;
  inputId: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const needle = query.trim();
    const timer = setTimeout(async () => {
      if (selected || needle.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(
          `/api/tickets/events/${eventId}/users/search?q=${encodeURIComponent(needle)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        setResults(response.ok ? ((await response.json()) as Candidate[]) : []);
      } catch {
        // Afgebroken of netwerkfout; het volgende teken probeert opnieuw.
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [eventId, query, selected]);

  if (selected) {
    return (
      <div className="ticket-admin-field" data-span="2">
        <label htmlFor={inputId}>{locale === "nl" ? "Persoon" : "Person"}</label>
        <div className="ticket-admin-picked-person">
          <input type="hidden" name="userId" value={selected.id} />
          <div>
            <strong>{selected.name}</strong>
            <span>{selected.rNumber ?? selected.email}</span>
          </div>
          <button
            type="button"
            id={inputId}
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            aria-label={locale === "nl" ? "Andere persoon kiezen" : "Pick someone else"}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ticket-admin-field" data-span="2">
      <label htmlFor={inputId}>
        {locale === "nl" ? "Naam, e-mail of r-nummer" : "Name, email or r-number"}
      </label>
      <div className="ticket-admin-person-search">
        <Search aria-hidden="true" size={16} />
        <input
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          placeholder={locale === "nl" ? "Zoek een lid" : "Search a member"}
        />
        {searching ? <LoaderCircle className="is-spinning" aria-hidden="true" size={15} /> : null}
      </div>
      {results.length > 0 ? (
        <ul className="ticket-admin-person-results">
          {results.map((candidate) => (
            <li key={candidate.id}>
              <button type="button" onClick={() => setSelected(candidate)}>
                <strong>{candidate.name}</strong>
                <span>{candidate.rNumber ?? candidate.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
