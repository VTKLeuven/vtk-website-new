"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle, MapPin, X } from "lucide-react";
import type { AdminLocale } from "./format";

type Suggestion = { label: string; latitude: number; longitude: number };

/**
 * Adres kiezen uit een lijst in plaats van vrij intypen, zoals bij een
 * bezorgadres: pas wanneer je een suggestie aanklikt staat het adres vast en
 * hebben we coördinaten. Die coördinaten voeden de geofence op het
 * walletticket, zodat het vanzelf op het vergrendelscherm komt bij aankomst.
 *
 * Het veld is optioneel; niets kiezen laat het event gewoon werken zonder
 * geofence. Een bestaand adres blijft staan zolang je niets nieuws kiest, dus
 * een opslag zonder het adres aan te raken verandert er niets aan.
 */
export function AddressPicker({
  defaultAddress,
  defaultLatitude,
  defaultLongitude,
  locale,
}: {
  defaultAddress?: string | null;
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState(defaultAddress ?? "");
  const [chosen, setChosen] = useState<Suggestion | null>(
    defaultAddress && defaultLatitude != null && defaultLongitude != null
      ? { label: defaultAddress, latitude: defaultLatitude, longitude: defaultLongitude }
      : null
  );
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  const term = query.trim();
  const searchable = term.length >= 3 && chosen?.label !== term;
  // Of de lijst zichtbaar is, leiden we tijdens het renderen af in plaats van
  // ze in een effect leeg te maken: een synchrone setState in een effect
  // veroorzaakt een extra renderronde (en eslint verbiedt het terecht).
  const visible = open && searchable && suggestions.length > 0;

  // Zoeken pas na een korte pauze: anders vuurt elke toetsaanslag een
  // verzoek naar de geocoder.
  useEffect(() => {
    if (!searchable) return;
    const timer = setTimeout(async () => {
      const requestId = ++requestRef.current;
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/address-search?q=${encodeURIComponent(term)}`);
        const data = response.ok ? ((await response.json()) as Suggestion[]) : [];
        if (requestId !== requestRef.current) return;
        setSuggestions(data);
        setOpen(true);
      } catch {
        if (requestId === requestRef.current) setSuggestions([]);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [term, searchable]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(suggestion: Suggestion) {
    setChosen(suggestion);
    setQuery(suggestion.label);
    setOpen(false);
    setSuggestions([]);
  }

  function clear() {
    setChosen(null);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div className="ticket-admin-field ticket-address-picker" ref={containerRef}>
      <label htmlFor={inputId}>{nl ? "Adres (optioneel)" : "Address (optional)"}</label>
      {/* Alleen een gekozen adres levert coördinaten. Getypte tekst zonder
          keuze gaat als adres mee en wordt serverside alsnog opgezocht. */}
      <input type="hidden" name="locationAddress" value={chosen?.label ?? query.trim()} />
      <input type="hidden" name="locationLatitude" value={chosen ? String(chosen.latitude) : ""} />
      <input type="hidden" name="locationLongitude" value={chosen ? String(chosen.longitude) : ""} />

      <div className="ticket-address-input">
        <input
          id={inputId}
          value={query}
          autoComplete="off"
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          placeholder={nl ? "Begin te typen, bv. Studentenwijk Arenberg 6" : "Start typing, e.g. Arenberg 6"}
          onChange={(event) => {
            setQuery(event.target.value);
            setChosen(null);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {loading ? <LoaderCircle className="animate-spin" size={15} aria-hidden="true" /> : null}
        {query ? (
          <button type="button" onClick={clear} title={nl ? "Adres wissen" : "Clear address"} aria-label={nl ? "Adres wissen" : "Clear address"}>
            <X size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {visible ? (
        <ul className="ticket-address-suggestions" id={listId} role="listbox">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.label}-${suggestion.latitude}`}>
              <button type="button" role="option" aria-selected={false} onClick={() => choose(suggestion)}>
                <MapPin size={14} aria-hidden="true" />
                <span>{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <small>
        {chosen ? (
          <span className="ticket-address-confirmed">
            <Check size={13} aria-hidden="true" />
            {nl
              ? `Adres bevestigd. Het walletticket verschijnt vanzelf op het vergrendelscherm bij aankomst.`
              : `Address confirmed. The wallet ticket surfaces on the lock screen on arrival.`}
          </span>
        ) : query.trim() ? (
          nl
            ? "Kies een adres uit de lijst om het te bevestigen. Zonder keuze proberen we het bij het opslaan alsnog op te zoeken."
            : "Pick an address from the list to confirm it. Without a choice we still try to look it up on save."
        ) : nl ? (
          "Optioneel. Vul dit in om het walletticket automatisch te tonen wanneer iemand ter plaatse komt."
        ) : (
          "Optional. Fill this in to surface the wallet ticket automatically when someone arrives."
        )}
      </small>
    </div>
  );
}
