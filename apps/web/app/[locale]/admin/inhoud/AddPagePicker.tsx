"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { movePageToTabAction } from "@/app/actions/pages";
import { Modal } from "../admin-table";

type Hit = {
  id: string;
  slug: string;
  title: string;
  categoryNl: string | null;
  categoryEn: string | null;
};

/**
 * "Pagina toevoegen" onder een categorie: zoekt een BESTAANDE pagina en hangt ze
 * eronder. Nieuwe pagina's maak je niet hier maar in /admin/paginas (daar hoort
 * ook de inhoud); dit scherm gaat enkel over structuur.
 *
 * Zoeken gebeurt server-side via /api/admin/pages/search, zodat de picker niet
 * de volledige paginatabel hoeft in te laden.
 */
export function AddPagePicker({
  locale,
  tabId,
  tabLabel,
  onClose,
}: {
  locale: Locale;
  tabId: string;
  tabLabel: string;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();

  // Gedebouncede server-side zoekopdracht; pagina's die al onder deze categorie
  // hangen laten we door de server weg (`exclude`). Het leegmaken van de
  // resultaten gebeurt in de onChange-handler (niet hier), zodat we geen
  // setState synchroon in de effect-body aanroepen.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const resp = await fetch(
          `/api/admin/pages/search?q=${encodeURIComponent(q)}&exclude=${encodeURIComponent(tabId)}`,
          { cache: "no-store" },
        );
        if (resp.ok) setHits(await resp.json());
      } catch {
        /* stille fout: de gebruiker kan opnieuw typen */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, tabId]);

  function add(hit: Hit) {
    startTransition(async () => {
      await movePageToTabAction(hit.id, tabId);
      onClose();
    });
  }

  const q = query.trim();

  return (
    <Modal
      title={nl ? `Pagina toevoegen aan ${tabLabel}` : `Add page to ${tabLabel}`}
      onClose={onClose}
    >
      <p className="mb-3 text-sm text-[#5c667f]">
        {nl
          ? "Zoek een bestaande pagina om ze onder deze categorie te hangen. Een nieuwe pagina maak je bij Pagina's."
          : "Search an existing page to hang it under this category. You create a new page under Pages."}
      </p>

      <Input
        autoFocus
        value={query}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          // Te kort om te zoeken: meteen opruimen, anders blijven de vorige
          // resultaten onder een lege zoekterm hangen.
          if (next.trim().length < 2) {
            setHits([]);
            setSearching(false);
          }
        }}
        placeholder={nl ? "Zoek op titel of slug" : "Search by title or slug"}
        aria-label={nl ? "Pagina zoeken" : "Search page"}
      />

      <div className="mt-3 max-h-72 overflow-y-auto">
        {q.length < 2 ? (
          <p className="px-1 py-3 text-sm text-[#5c667f]">
            {nl ? "Typ minstens twee tekens." : "Type at least two characters."}
          </p>
        ) : searching && hits.length === 0 ? (
          <p className="px-1 py-3 text-sm text-[#5c667f]">{nl ? "Zoeken..." : "Searching..."}</p>
        ) : hits.length === 0 ? (
          <p className="px-1 py-3 text-sm text-[#5c667f]">
            {nl ? "Geen pagina gevonden." : "No page found."}
          </p>
        ) : (
          <ul className="space-y-1">
            {hits.map((hit) => {
              const category = nl ? hit.categoryNl : hit.categoryEn;
              return (
                <li key={hit.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => add(hit)}
                    className="flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-vtk-blue/20 hover:bg-vtk-blue-soft/40 disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-vtk-ink">{hit.title}</span>
                      <span className="block truncate font-mono text-[11px] text-[#5c667f]">
                        /{hit.slug}
                      </span>
                    </span>
                    {/* Waar de pagina nu hangt: toevoegen VERPLAATST ze dan. */}
                    <span className="shrink-0 text-[11px] text-[#5c667f]">
                      {category
                        ? nl
                          ? `nu in ${category}`
                          : `now in ${category}`
                        : nl
                          ? "niet gekoppeld"
                          : "unlinked"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
