"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Input, Label } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { addHeaderTabDirectAction } from "@/app/actions/pages";
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
 * Modal om direct een top-level header-item (pagina of link) toe te voegen
 * aan de navigatiebalk.
 */
export function AddHeaderTabPicker({
  locale,
  onClose,
}: {
  locale: Locale;
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
          `/api/admin/pages/search?q=${encodeURIComponent(q)}`,
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
  }, [query]);

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

  function addPageAsTab(hit: Hit) {
    startTransition(async () => {
      await addHeaderTabDirectAction({
        labelNl: hit.title,
        labelEn: hit.title,
        slug: hit.slug,
        url: `/p/${hit.slug}`,
      });
      onClose();
    });
  }

  function addBuiltinAsTab(route: BuiltinRoute) {
    startTransition(async () => {
      await addHeaderTabDirectAction({
        labelNl: route.labelNl,
        labelEn: route.labelEn,
        slug: route.path.replace(/^\//, ""),
        url: route.path,
      });
      onClose();
    });
  }

  function addCustomAsTab() {
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
          ? "Ongeldig adres. Gebruik een intern pad (/p/shiften) of een volledige URL (https://...)."
          : "Invalid destination. Use an internal path (/p/shiften) or full URL (https://...).",
      );
      return;
    }

    startTransition(async () => {
      const res = await addHeaderTabDirectAction({
        labelNl,
        labelEn,
        url,
      });
      if (res.status === "error") {
        setCustomError(nl ? "Kon header-item niet opslaan." : "Could not save header item.");
      } else {
        onClose();
      }
    });
  }

  const q = query.trim();

  return (
    <Modal
      title={nl ? "Pagina of link toevoegen aan header" : "Add page or link directly to header"}
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
          {nl ? "CMS-pagina" : "CMS page"}
        </button>
        <button
          type="button"
          onClick={() => setMode("builtin")}
          className={[
            "flex-1 rounded-lg py-1.5 transition-colors",
            mode === "builtin" ? "bg-white text-vtk-ink shadow-sm" : "text-[#5c667f] hover:text-vtk-ink",
          ].join(" ")}
        >
          {nl ? "Vaste routes" : "Built-in routes"}
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder={nl ? "Zoek op titel of pad (bv. /p/shiften)..." : "Search title or path (e.g. /p/shiften)..."}
          />
          <div className="mt-3 max-h-72 overflow-y-auto space-y-1.5">
            {searching ? (
              <p className="py-6 text-center text-xs text-[#5c667f]">{nl ? "Zoeken..." : "Searching..."}</p>
            ) : hits.length > 0 ? (
              hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  disabled={pending}
                  onClick={() => addPageAsTab(h)}
                  className="flex w-full items-center justify-between rounded-xl border border-transparent p-2.5 text-left text-sm transition-colors hover:border-vtk-ink/10 hover:bg-vtk-blue-soft/30"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="font-medium text-vtk-ink">{h.title}</div>
                    <div className="font-mono text-xs text-[#5c667f]">/p/{h.slug}</div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-vtk-yellow/20 px-2.5 py-1 text-xs font-semibold text-vtk-ink">
                    + {nl ? "Toevoegen" : "Add"}
                  </span>
                </button>
              ))
            ) : q.length >= 2 ? (
              <p className="py-6 text-center text-xs text-[#5c667f]">
                {nl ? "Geen pagina's gevonden." : "No pages found."}
              </p>
            ) : (
              <p className="py-6 text-center text-xs text-[#5c667f]">
                {nl ? "Typ minstens 2 tekens om te zoeken." : "Type at least 2 characters to search."}
              </p>
            )}
          </div>
        </div>
      )}

      {mode === "builtin" && (
        <div>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={nl ? "Filter routes (/werkgroepen, /kalender)..." : "Filter routes (/werkgroepen, /kalender)..."}
          />
          <div className="mt-3 max-h-72 overflow-y-auto space-y-1.5">
            {matchingBuiltinRoutes.map((r) => (
              <button
                key={r.path}
                type="button"
                disabled={pending}
                onClick={() => addBuiltinAsTab(r)}
                className="flex w-full items-center justify-between rounded-xl border border-transparent p-2.5 text-left text-sm transition-colors hover:border-vtk-ink/10 hover:bg-vtk-blue-soft/30"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-1.5 font-medium text-vtk-ink">
                    <span className="text-[#5c667f]"><LinkIcon /></span>
                    <span>{nl ? r.labelNl : r.labelEn}</span>
                  </div>
                  <div className="font-mono text-xs text-[#5c667f]">{r.path}</div>
                </div>
                <span className="shrink-0 rounded-lg bg-vtk-yellow/20 px-2.5 py-1 text-xs font-semibold text-vtk-ink">
                  + {nl ? "Toevoegen" : "Add"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="custom-label-nl">{nl ? "Label (NL)" : "Label (NL)"}</Label>
            <Input
              id="custom-label-nl"
              autoFocus
              value={customLabelNl}
              onChange={(e) => setCustomLabelNl(e.target.value)}
              placeholder="Shiften"
              required
            />
          </div>
          <div>
            <Label htmlFor="custom-label-en">{nl ? "Label (EN)" : "Label (EN)"}</Label>
            <Input
              id="custom-label-en"
              value={customLabelEn}
              onChange={(e) => setCustomLabelEn(e.target.value)}
              placeholder={customLabelNl || "Shifts"}
            />
          </div>
          <div>
            <Label htmlFor="custom-url">{nl ? "Bestemming (URL of pad)" : "Destination (URL or path)"}</Label>
            <Input
              id="custom-url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="/p/shiften of https://..."
              required
            />
          </div>
          {customError && <p className="text-xs font-medium text-red-600">{customError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={onClose} disabled={pending}>
              {nl ? "Annuleren" : "Cancel"}
            </Button>
            <Button type="button" onClick={addCustomAsTab} disabled={pending}>
              {pending ? (nl ? "Toevoegen..." : "Adding...") : nl ? "Toevoegen aan header" : "Add to header"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
