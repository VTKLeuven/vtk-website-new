"use client";

import { useEffect, useId, useState } from "react";
import { Input, Label } from "@vtk/ui";
import { type MemberCandidate, searchMemberCandidatesAction, searchNewMemberCandidatesAction } from "../actions";

const SOURCE_LABEL: Record<MemberCandidate["source"], string> = { site: "SITE", gw: "GW", address: "ADRES" };
const SOURCE_TONE: Record<MemberCandidate["source"], string> = {
  site: "bg-vtk-blue-soft text-vtk-ink",
  gw: "bg-emerald-50 text-emerald-800",
  address: "bg-zinc-100 text-zinc-600",
};

export function candidateValue(c: MemberCandidate): string {
  return c.source === "site" ? `site:${c.userId}` : `${c.source}:${c.email}`;
}

/** Het label rechts op een rij: SITE, GW of ADRES. */
export function CandidateBadge({ source }: { source: MemberCandidate["source"] }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${SOURCE_TONE[source]}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

/**
 * Eén zoekveld voor een lid van de site, een account van Google Workspace of
 * een vrij mailadres. Rechts op elke rij staat waar ze vandaan komt (SITE, GW,
 * ADRES), en bij een lid welk adres er in de lijst komt: zo zie je dat een lid
 * met enkel een privéadres op de site niet zijn @vtk.be-adres oplevert, en kies
 * je dan de GW-rij.
 *
 * De keuze gaat mee als `choice` (`site:<id>`, `gw:<adres>`, `address:<adres>`).
 * Met `onPick` (op "Nieuw groepsadres", waar er nog geen lijst is) gaat een
 * keuze naar de ouder en is het veld meteen weer leeg voor de volgende.
 */
export function MemberPicker({
  nl,
  mailGroupId,
  label,
  onPick,
}: {
  nl: boolean;
  /** Zonder: zoeken voor een lijst die nog niet bestaat. */
  mailGroupId?: string;
  label: string;
  onPick?: (candidate: MemberCandidate) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberCandidate[]>([]);
  const [chosen, setChosen] = useState<MemberCandidate | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const listId = useId();

  useEffect(() => {
    const q = query.trim();
    if (chosen || q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = mailGroupId
          ? await searchMemberCandidatesAction(mailGroupId, q)
          : await searchNewMemberCandidatesAction(q);
        if (!cancelled) {
          setResults(found);
          setOpen(true);
        }
      } catch {
        /* opnieuw typen volstaat */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, chosen, mailGroupId]);

  const lineFor = (c: MemberCandidate) => {
    if (c.source === "site") {
      return {
        title: c.name,
        sub: c.vtk
          ? nl
            ? `komt in de lijst als ${c.vtk}`
            : `added as ${c.vtk}`
          : nl
            ? `${c.siteEmail} · geen @vtk.be-account gekoppeld`
            : `${c.siteEmail} · no @vtk.be account linked`,
        warn: !c.vtk,
      };
    }
    if (c.source === "gw") {
      return {
        title: c.email,
        sub: [c.name, c.suspended ? (nl ? "geschorst" : "suspended") : null].filter(Boolean).join(" · ") || null,
        warn: c.suspended,
      };
    }
    return { title: c.email, sub: nl ? "vrij adres toevoegen" : "add as a free address", warn: false };
  };

  return (
    <div className="relative w-80 max-w-full">
      <Label htmlFor={`${listId}-input`}>{label}</Label>
      {chosen && !onPick && <input type="hidden" name="choice" value={candidateValue(chosen)} />}
      <Input
        id={`${listId}-input`}
        value={query}
        autoComplete="off"
        required={!onPick}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        placeholder={nl ? "Naam, r-nummer of adres" : "Name, r-number or address"}
        onChange={(e) => {
          setQuery(e.target.value);
          setChosen(null);
          setResults([]);
        }}
        onFocus={() => results.length > 0 && !chosen && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          // Enter in een veld van een groter formulier zou het hele formulier
          // versturen; hier neemt het de eerste rij.
          if (e.key === "Enter" && onPick) {
            e.preventDefault();
            if (results[0]) {
              onPick(results[0]);
              setQuery("");
              setResults([]);
              setOpen(false);
            }
          }
        }}
      />
      {chosen && (
        <span className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${SOURCE_TONE[chosen.source]}`}>
            {SOURCE_LABEL[chosen.source]}
          </span>
          {chosen.source === "site" ? (chosen.vtk ?? chosen.siteEmail) : chosen.email}
        </span>
      )}
      {open && !chosen && query.trim().length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-[26rem] max-w-[90vw] overflow-y-auto rounded-xl border border-vtk-blue/15 bg-white text-sm shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-zinc-500">
              {searching ? (nl ? "Bezig met zoeken..." : "Searching...") : nl ? "Niets gevonden." : "Nothing found."}
            </li>
          ) : (
            results.map((c) => {
              const line = lineFor(c);
              return (
                <li key={candidateValue(c)} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-vtk-blue-soft/50"
                    onClick={() => {
                      setOpen(false);
                      if (onPick) {
                        onPick(c);
                        setQuery("");
                        setResults([]);
                        return;
                      }
                      setChosen(c);
                      setQuery(c.source === "site" ? c.name : c.email);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-all text-vtk-ink">{line.title}</span>
                      {line.sub && (
                        <span className={`block text-xs ${line.warn ? "text-amber-800" : "text-zinc-500"}`}>{line.sub}</span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${SOURCE_TONE[c.source]}`}
                    >
                      {SOURCE_LABEL[c.source]}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
