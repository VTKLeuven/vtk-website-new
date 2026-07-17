"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { createPageAction } from "@/app/actions/pages";
import { contentErrorMessages } from "../inhoud/messages";
import { Modal, SearchBar } from "../admin-table";

/**
 * Toolbar boven de paginatabel: zoeken plus "Nieuwe pagina".
 *
 * Zoeken gebeurt server-side: de term gaat via `?q=` naar de URL en de
 * server-pagina query't ermee. Zo doorzoek je ALLE pagina's die je mag
 * bewerken, niet enkel de 25 die toevallig geladen zijn.
 */
export function PagesToolbar({
  locale,
  initialQuery,
}: {
  locale: Locale;
  initialQuery: string;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [newOpen, setNewOpen] = useState(false);
  const firstRender = useRef(true);

  // Gedebouncede URL-sync: een nieuwe zoekterm zet `?q=` en gaat terug naar
  // pagina 1 (anders sta je op een pagina die in de nieuwe resultaten niet
  // bestaat).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      const q = query.trim();
      if (q) sp.set("q", q);
      else sp.delete("q");
      sp.delete("page");
      router.replace(`${pathname}?${sp.toString()}`);
    }, 300);
    return () => clearTimeout(timer);
    // Enkel op wijziging van de zoekterm; params/pathname zijn stabiel per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={nl ? "Zoek op titel, slug, categorie of rol" : "Search by title, slug, category or role"}
        ariaLabel={nl ? "Pagina's zoeken" : "Search pages"}
      />
      <button
        type="button"
        className="vtk-tile-btn vtk-tile-btn-primary"
        onClick={() => setNewOpen(true)}
      >
        {nl ? "Nieuwe pagina" : "New page"}
      </button>

      {newOpen && (
        <Modal title={nl ? "Nieuwe pagina" : "New page"} onClose={() => setNewOpen(false)}>
          <p className="mb-4 text-sm text-[#5c667f]">
            {nl
              ? "De pagina start als concept en krijgt jouw rollen als bewerkrollen. Categorie en publicatie regelt iemand met het recht op Inhoud; de rest bewerk je meteen hierna."
              : "The page starts as a draft and gets your roles as its editor roles. Category and publication are handled by someone with the Content permission; you can edit the rest right after."}
          </p>
          {/* Geen onSuccess/toast: de action redirect naar de verse editor, en
              die navigatie is zelf de bevestiging. */}
          <SaveForm
            action={createPageAction}
            className="space-y-4"
            submitLabel={nl ? "Aanmaken" : "Create"}
            savingLabel={dict.common.saving}
            savedMessage={nl ? "Pagina aangemaakt" : "Page created"}
            errorMessages={contentErrorMessages(locale)}
            fallbackErrorMessage={dict.common.saveError}
          >
            <input type="hidden" name="locale" value={nl ? "nl" : "en"} />
            <div>
              <Label htmlFor="new-page-title">{nl ? "Titel (NL)" : "Title (NL)"}</Label>
              <Input id="new-page-title" name="titleNl" required />
            </div>
            <div>
              <Label htmlFor="new-page-slug">{nl ? "Adres (slug)" : "Address (slug)"}</Label>
              <div className="flex items-center gap-1">
                <span className="shrink-0 font-mono text-sm text-[#5c667f]">/p/</span>
                <Input
                  id="new-page-slug"
                  name="slug"
                  required
                  pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
                  placeholder={nl ? "bv. examenregeling" : "e.g. exam-rules"}
                />
              </div>
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl
                  ? "Kleine letters, cijfers en koppeltekens. Moet uniek zijn over de hele site."
                  : "Lowercase letters, digits and hyphens. Must be unique across the whole site."}
              </p>
            </div>
          </SaveForm>
        </Modal>
      )}
    </div>
  );
}
