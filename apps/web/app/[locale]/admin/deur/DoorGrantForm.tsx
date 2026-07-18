"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { grantDoorAccessAction } from "@/app/actions/door";
import type { SaveLabels } from "@/app/[locale]/admin/pocs/PocsTable";

type SearchUser = { id: string; name: string; email: string; rNumber: string | null };

/** `YYYY-MM-DDTHH:mm` in lokale tijd, voor de default van een datetime-local-veld. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/**
 * "Tijdelijke toegang geven"-formulier: zoekt een gebruiker server-side
 * (/api/users/search) en maakt een {@link DoorAccessGrant} met start/eind + note via
 * {@link grantDoorAccessAction}. Op succes maakt het zichzelf leeg. De start/eind
 * defaults worden na mount gezet (niet tijdens render) om hydration-mismatch te
 * vermijden.
 */
export function DoorGrantForm({ locale, saveLabels }: { locale: "nl" | "en"; saveLabels: SaveLabels }) {
  const nl = locale === "nl";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [open, setOpen] = useState(false);

  // Start/eind zijn uncontrolled: de defaults (nu -> +1 week) zetten we na mount
  // rechtstreeks op de DOM via refs. Zo vermijden we een hydration-mismatch (de
  // server kent de lokale tijd van de beheerder niet) zonder setState in een effect.
  const startsRef = useRef<HTMLInputElement>(null);
  const endsRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  function fillDefaultDates() {
    const now = new Date();
    if (startsRef.current) startsRef.current.value = localInputValue(now);
    if (endsRef.current) endsRef.current.value = localInputValue(new Date(now.getTime() + 7 * 86_400_000));
  }

  useEffect(() => {
    fillDefaultDates();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (selected || q.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (resp.ok) {
          setResults(await resp.json());
          setOpen(true);
        }
      } catch {
        /* stille fout: gebruiker kan opnieuw typen */
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  function pick(u: SearchUser) {
    setSelected(u);
    setQuery(u.name);
    setOpen(false);
  }

  function reset() {
    setSelected(null);
    setQuery("");
    setResults([]);
    fillDefaultDates();
    if (noteRef.current) noteRef.current.value = "";
  }

  return (
    <SaveForm
      action={grantDoorAccessAction}
      {...saveLabels}
      onSuccess={reset}
      submitDisabled={!selected}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-3"
    >
      <input type="hidden" name="userId" value={selected?.id ?? ""} />

      <div className="relative min-w-[220px] flex-1">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">{nl ? "Persoon zoeken" : "Search person"}</label>
        <Input
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (selected) setSelected(null);
            if (v.trim().length < 2) {
              setResults([]);
              setOpen(false);
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={nl ? "Naam, e-mail of r-nummer" : "Name, email or r-number"}
          autoComplete="off"
        />
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-vtk-blue/15 bg-white shadow-lg">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => pick(u)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-vtk-blue-soft/50"
                >
                  <span className="font-medium text-vtk-ink">{u.name}</span>
                  <span className="text-xs text-[#5c667f]">
                    {u.email}
                    {u.rNumber ? ` · ${u.rNumber}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-w-[170px]">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">{nl ? "Vanaf" : "From"}</label>
        <Input ref={startsRef} type="datetime-local" name="startsAt" />
      </div>
      <div className="min-w-[170px]">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">{nl ? "Tot" : "Until"}</label>
        <Input ref={endsRef} type="datetime-local" name="endsAt" />
      </div>
      <div className="min-w-[160px] flex-1">
        <label className="mb-1 block text-xs font-medium text-[#5c667f]">{nl ? "Notitie (optioneel)" : "Note (optional)"}</label>
        <Input ref={noteRef} name="note" placeholder={nl ? "bv. gastspreker" : "e.g. guest speaker"} autoComplete="off" />
      </div>
    </SaveForm>
  );
}
