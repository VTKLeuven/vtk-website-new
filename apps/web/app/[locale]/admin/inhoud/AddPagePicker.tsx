"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Input, Label } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { addHeaderTabLinkAction, movePageToTabAction } from "@/app/actions/pages";
import { BUILTIN_ROUTES, type BuiltinRoute } from "@/lib/builtinRoutes";
import { isEditableDestination } from "@/lib/href";
import { Modal } from "../admin-table";
import { LinkIcon } from "@/components/ui/icons";

type Hit = {
  id: string;
  slug: string;
  title: string;
  categoryNl: string | null;
  categoryEn: string | null;
};

type Mode = "search" | "builtin" | "custom";

/**
 * "Pagina toevoegen" onder een categorie: zoekt een BESTAANDE CMS-pagina,
 * een VASTE ingebouwde route (/werkgroepen, /kalender, /praesidium, enz.),
 * of laat een aangepaste (externe) link invoeren.
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
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [customLabelNl, setCustomLabelNl] = useState("");
  const [customLabelEn, setCustomLabelEn] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Gedebouncede server-side zoekopdracht voor CMS-pagina's
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
        /* stille fout */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, tabId]);

  // Vaste routes filteren op zoekterm
  const matchingBuiltinRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BUILTIN_ROUTES;
    return BUILTIN_ROUTES.filter((r) => {
      const matchPath = r.path.toLowerCase().includes(q);
      const matchNl = r.labelNl.toLowerCase().includes(q) || r.descriptionNl.toLowerCase().includes(q);
      const matchEn = r.labelEn.toLowerCase().includes(q) || r.descriptionEn.toLowerCase().includes(q);
      return matchPath || matchNl || matchEn;
    });
  }, [query]);

  function addPage(hit: Hit) {
    startTransition(async () => {
      await movePageToTabAction(hit.id, tabId);
      onClose();
    });
  }

  function addBuiltin(route: BuiltinRoute) {
    startTransition(async () => {
      await addHeaderTabLinkAction(tabId, {
        labelNl: route.labelNl,
        labelEn: route.labelEn,
        url: route.path,
      });
      onClose();
    });
  }

  function addCustom() {
    setCustomError(null);
    const labelNl = customLabelNl.trim();
    const labelEn = customLabelEn.trim() || labelNl;
    const url = customUrl.trim();
    if (!labelNl || !url) {
      setCustomError(nl ? "Vul minstens een label en URL in." : "Please fill in at least a label and URL.");
      return;
    }
    if (!isEditableDestination(url)) {
      setCustomError(
        nl
          ? "Ongeldig adres. Gebruik een intern pad (/pad) of een volledige URL (https://...)."
          : "Invalid destination. Use an internal path (/path) or full URL (https://...).",
      );
      return;
    }

    startTransition(async () => {
      const res = await addHeaderTabLinkAction(tabId, {
        labelNl,
        labelEn,
        url,
      });
      if (res.status === "error") {
        setCustomError(nl ? "Kon link niet opslaan." : "Could not save link.");
      } else {
        onClose();
      }
    });
  }

  const q = query.trim();

  return (
    <Modal
      title={nl ? `Pagina of link toevoegen aan ${tabLabel}` : `Add page or link to ${tabLabel}`}
      onClose={onClose}
    >
      {/* Tab switchers */}
      <div className="mb-4 flex gap-1 rounded-xl bg-vtk-blue-soft/50 p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={[
            "flex-1 rounded-lg py-1.5 transition-colors",
            mode === "search" ? "bg-white text-vtk-ink shadow-sm" : "text-[#5c667f] hover:text-vtk-ink",
          ].join(" ")}
        >
          {nl ? "Zoeken" : "Search"}
        </button>
        <button
          type="button"
          onClick={() => setMode("builtin")}
          className={[
            "flex-1 rounded-lg py-1.5 transition-colors",
            mode === "builtin" ? "bg-white text-vtk-ink shadow-sm" : "text-[#5c667f] hover:text-vtk-ink",
          ].join(" ")}
        >
          {nl ? "Vaste pagina's" : "Built-in pages"}
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={[
            "flex-1 rounded-lg py-1.5 transition-colors",
            mode === "custom" ? "bg-white text-vtk-ink shadow-sm" : "text-[#5c667f] hover:text-vtk-ink",
          ].join(" ")}
        >
          {nl ? "Aangepaste link" : "Custom link"}
        </button>
      </div>

      {mode === "search" && (
        <div>
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              if (next.trim().length < 2) {
                setHits([]);
                setSearching(false);
              }
            }}
            placeholder={nl ? "Zoek op titel, vaste route of slug..." : "Search title, built-in route or slug..."}
            aria-label={nl ? "Pagina zoeken" : "Search page"}
          />

          <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
            {/* Vaste routes matches */}
            {matchingBuiltinRoutes.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#5c667f]">
                  {nl ? "Vaste pagina's" : "Built-in pages"}
                </p>
                <ul className="space-y-1">
                  {matchingBuiltinRoutes.map((route) => (
                    <li key={route.path}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => addBuiltin(route)}
                        className="flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-vtk-blue/20 hover:bg-vtk-blue-soft/40 disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-vtk-ink">
                            {nl ? route.labelNl : route.labelEn}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-[#5c667f]">
                            {route.path}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-md bg-vtk-yellow/20 px-2 py-0.5 text-[10px] font-semibold text-vtk-ink">
                          {nl ? "Vaste route" : "Built-in"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CMS Pagina's matches */}
            {q.length >= 2 && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#5c667f]">
                  {nl ? "CMS-pagina's" : "CMS pages"}
                </p>
                {searching && hits.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-[#5c667f]">{nl ? "Zoeken..." : "Searching..."}</p>
                ) : hits.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-[#5c667f]">
                    {nl ? "Geen CMS-pagina's gevonden." : "No CMS pages found."}
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
                            onClick={() => addPage(hit)}
                            className="flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-vtk-blue/20 hover:bg-vtk-blue-soft/40 disabled:opacity-50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-vtk-ink">{hit.title}</span>
                              <span className="block truncate font-mono text-[11px] text-[#5c667f]">
                                /{hit.slug}
                              </span>
                            </span>
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
            )}

            {q.length < 2 && matchingBuiltinRoutes.length === 0 && (
              <p className="px-1 py-3 text-sm text-[#5c667f]">
                {nl ? "Typ minstens twee tekens om te zoeken." : "Type at least two characters to search."}
              </p>
            )}
          </div>
        </div>
      )}

      {mode === "builtin" && (
        <div>
          <p className="mb-3 text-xs text-[#5c667f]">
            {nl
              ? "Klik op een van de vaste ingebouwde pagina's om ze toe te voegen aan deze categorie:"
              : "Click any built-in page to add it to this category:"}
          </p>
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {BUILTIN_ROUTES.map((route) => (
              <li key={route.path}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => addBuiltin(route)}
                  className="flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-vtk-blue/20 hover:bg-vtk-blue-soft/40 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-vtk-ink">
                        {nl ? route.labelNl : route.labelEn}
                      </span>
                      <span className="font-mono text-xs text-[#5c667f]">{route.path}</span>
                    </span>
                    <span className="block truncate text-xs text-[#5c667f]">
                      {nl ? route.descriptionNl : route.descriptionEn}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-vtk-yellow/20 px-2 py-0.5 text-[10px] font-semibold text-vtk-ink">
                    + {nl ? "Toevoegen" : "Add"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-4">
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "Voeg een externe site (https://career.vtk.be) of een intern pad (/...) toe als menu-item."
              : "Add an external site (https://...) or internal path (/...) as a menu item."}
          </p>

          <div>
            <Label htmlFor="customLabelNl">{nl ? "Label (NL)" : "Label (NL)"}</Label>
            <Input
              id="customLabelNl"
              value={customLabelNl}
              onChange={(e) => setCustomLabelNl(e.target.value)}
              placeholder="bv. Jobfair of Kalender"
              autoFocus
              required
            />
          </div>

          <div>
            <Label htmlFor="customLabelEn">{nl ? "Label (EN) (optioneel)" : "Label (EN) (optional)"}</Label>
            <Input
              id="customLabelEn"
              value={customLabelEn}
              onChange={(e) => setCustomLabelEn(e.target.value)}
              placeholder="bv. Job fair or Calendar"
            />
          </div>

          <div>
            <Label htmlFor="customUrl">{nl ? "Bestemming (URL of pad)" : "Destination (URL or path)"}</Label>
            <div className="relative">
              <Input
                id="customUrl"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="/werkgroepen of https://..."
                required
              />
            </div>
          </div>

          {customError && <p className="text-xs text-red-600">{customError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>
              {nl ? "Annuleren" : "Cancel"}
            </Button>
            <Button type="button" onClick={addCustom} disabled={pending || !customLabelNl.trim() || !customUrl.trim()}>
              <LinkIcon />
              {nl ? "Link toevoegen" : "Add link"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
