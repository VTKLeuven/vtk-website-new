"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button, Card, ConfirmDialog, Input, Label, Textarea } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { deleteHeaderTabAction, saveHeaderTabAction } from "@/app/actions/pages";
import { BUILTIN_ROUTES } from "@/lib/builtinRoutes";
import { SAVE_IDLE } from "@/lib/saveState";
import { contentErrorMessages } from "./messages";
import type { TabNode } from "./ContentManager";

/** Categoriepagina bewerken: wat er in de header staat en wat de pagina zelf toont. */
export function TabInspector({
  locale,
  tab,
  onClose,
}: {
  locale: Locale;
  tab: TabNode | null;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  return (
    <Card className="p-5">
      <InspectorHead
        title={tab ? tab.labelNl : nl ? "Nieuwe categorie" : "New category"}
        subtitle={tab ? `/${tab.slug}` : undefined}
        onClose={onClose}
      />

      <SaveForm
        action={saveHeaderTabAction}
        className="space-y-5"
        submitLabel={dict.admin.save}
        savingLabel={dict.common.saving}
        savedMessage={dict.common.saved}
        errorMessages={contentErrorMessages(locale)}
        fallbackErrorMessage={dict.common.saveError}
        // Zie PageInspector: een nieuwe categorie bestaat na het opslaan.
        onSuccess={tab ? undefined : onClose}
      >
        {tab && <input type="hidden" name="id" value={tab.id} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="labelNl">{nl ? "Label (NL)" : "Label (NL)"}</Label>
            <Input id="labelNl" name="labelNl" defaultValue={tab?.labelNl ?? ""} required />
          </div>
          <div>
            <Label htmlFor="labelEn">{nl ? "Label (EN)" : "Label (EN)"}</Label>
            <Input id="labelEn" name="labelEn" defaultValue={tab?.labelEn ?? ""} required />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={tab?.slug ?? ""}
              pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
              required
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl ? "De categoriepagina komt op /" : "The category page lives at /"}
              {tab?.slug ?? "..."}
            </p>
          </div>
          <div>
            <Label htmlFor="code">Code</Label>
            {tab ? (
              <>
                {/* Readonly: de seed upsert op code en code filtert erop. */}
                <Input id="code" value={tab.code} readOnly disabled />
                <input type="hidden" name="code" value={tab.code} />
                <p className="mt-1 text-xs text-[#5c667f]">
                  {nl
                    ? "Vast: de seed en de code verwijzen hiernaar."
                    : "Fixed: the seed and the code refer to this."}
                </p>
              </>
            ) : (
              <Input id="code" name="code" placeholder="BV_NIEUW" required />
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/20 p-3">
          <Label>{nl ? "Zichtbaarheid in de header" : "Visibility in header"}</Label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="visibleNl" defaultChecked={tab?.visibleNl ?? true} />
              <span>{nl ? "Zichtbaar op Nederlandse site (NL)" : "Visible on Dutch site (NL)"}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="visibleEn" defaultChecked={tab?.visibleEn ?? true} />
              <span>{nl ? "Zichtbaar op Engelse site (EN)" : "Visible on English site (EN)"}</span>
            </label>
          </div>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "Vink bv. enkel NL aan voor Eerstejaars en enkel EN voor Internationaal."
              : "E.g. check only NL for Freshmen and only EN for International."}
          </p>
        </div>

        <div>
          <Label htmlFor="externalUrl">
            {nl ? "Linkt rechtstreeks naar (pagina of externe site)" : "Links directly to (page or external site)"}
          </Label>
          <Input
            id="externalUrl"
            name="externalUrl"
            type="text"
            placeholder={nl ? "/p/shiften of https://..." : "/p/shiften or https://..."}
            defaultValue={tab?.externalUrl ?? ""}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Laat leeg voor een gewone categorie met dropdown. Vul je een intern pad (/p/shiften) of externe URL in, dan linkt de headerknop rechtstreeks daarnaartoe."
              : "Leave empty for a normal category with dropdown. When filled in with an internal path (/p/shiften) or external URL, the header button links directly there."}
          </p>
        </div>

        <fieldset className="space-y-3 border-t border-vtk-blue/10 pt-5">
          <legend className="text-sm font-semibold text-vtk-ink">
            {nl ? "Extra items & vaste routes" : "Extra items & built-in routes"}
          </legend>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "Items die naast de CMS-pagina's in het menu en op de categoriepagina verschijnen: vaste routes (/werkgroepen, /kalender, /praesidium) of externe links."
              : "Items that appear alongside CMS pages in the dropdown and on the category page: built-in routes (/werkgroepen, /kalender, /praesidium) or external links."}
          </p>
          <MenuLinkRows nl={nl} initial={tab?.links ?? []} />
        </fieldset>

        <fieldset className="space-y-4 border-t border-vtk-blue/10 pt-5">
          <legend className="text-sm font-semibold text-vtk-ink">
            {nl ? "Op de categoriepagina" : "On the category page"}
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="introNl">{nl ? "Intro (NL)" : "Intro (NL)"}</Label>
              <Textarea id="introNl" name="introNl" rows={3} defaultValue={tab?.introNl ?? ""} />
            </div>
            <div>
              <Label htmlFor="introEn">{nl ? "Intro (EN)" : "Intro (EN)"}</Label>
              <Textarea id="introEn" name="introEn" rows={3} defaultValue={tab?.introEn ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="ctaLabelNl">{nl ? "Knoptekst (NL)" : "Button label (NL)"}</Label>
              <Input id="ctaLabelNl" name="ctaLabelNl" defaultValue={tab?.ctaLabelNl ?? ""} />
            </div>
            <div>
              <Label htmlFor="ctaLabelEn">{nl ? "Knoptekst (EN)" : "Button label (EN)"}</Label>
              <Input id="ctaLabelEn" name="ctaLabelEn" defaultValue={tab?.ctaLabelEn ?? ""} />
            </div>
            <div>
              <Label htmlFor="ctaUrl">{nl ? "Knop-URL" : "Button URL"}</Label>
              <Input
                id="ctaUrl"
                name="ctaUrl"
                placeholder={nl ? "/shift of https://..." : "/shift or https://..."}
                defaultValue={tab?.ctaUrl ?? ""}
              />
            </div>
          </div>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "De knop verschijnt enkel als er zowel een tekst als een URL is."
              : "The button only appears when both a label and a URL are set."}
          </p>
        </fieldset>
      </SaveForm>

      {tab && (
        <div className="mt-5 border-t border-vtk-blue/10 pt-5">
          <DeleteTabButton locale={locale} tab={tab} onDeleted={onClose} />
        </div>
      )}
    </Card>
  );
}

function DeleteTabButton({
  locale,
  tab,
  onDeleted,
}: {
  locale: Locale;
  tab: TabNode;
  onDeleted: () => void;
}) {
  const nl = locale === "nl";
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const form = new FormData();
    form.append("id", tab.id);
    startTransition(async () => {
      await deleteHeaderTabAction(SAVE_IDLE, form);
      setConfirming(false);
      onDeleted();
    });
  }

  const count = tab.pages.length;
  const description = nl
    ? `De categorie "${tab.labelNl}" en haar pagina /${tab.slug} verdwijnen uit de header.` +
      (count > 0
        ? ` De ${count} pagina('s) eronder worden niet verwijderd, maar komen onder "Niet gekoppeld" te staan en zijn dan niet meer bereikbaar via de navigatie.`
        : "") +
      " Dit kan niet ongedaan gemaakt worden."
    : `The category "${tab.labelEn}" and its page /${tab.slug} will disappear from the header.` +
      (count > 0
        ? ` The ${count} page(s) below it are not deleted, but move to "Unlinked" and will no longer be reachable through the navigation.`
        : "") +
      " This cannot be undone.";

  return (
    <>
      <Button variant="ghost" size="sm" type="button" onClick={() => setConfirming(true)}>
        {nl ? "Categorie verwijderen" : "Delete category"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={nl ? "Categorie verwijderen?" : "Delete category?"}
        description={description}
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

export function InspectorHead({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-vtk-ink">{title}</h2>
        {subtitle && <p className="truncate font-mono text-xs text-[#5c667f]">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-zinc-400 hover:text-zinc-700"
        aria-label="Sluiten"
      >
        ✕
      </button>
    </div>
  );
}


/**
 * Extra menu-items van een categorie. Rijen posten als
 * `link-<i>-{id,labelNl,labelEn,url}` plus een `linkCount`; de action vervangt
 * de volledige lijst in die volgorde en gebruikt het id om de kaartfoto te
 * behouden. De foto zelf wordt in de eigen link-inspector bewerkt.
 */
function MenuLinkRows({
  nl,
  initial,
}: {
  nl: boolean;
  initial: Array<{ id: string; labelNl: string; labelEn: string; url: string }>;
}) {
  type Row = { id: string | null; labelNl: string; labelEn: string; url: string };
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((row) => ({ id: row.id, labelNl: row.labelNl, labelEn: row.labelEn, url: row.url })),
  );

  function update(index: number, patch: Partial<{ labelNl: string; labelEn: string; url: string }>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length) return;
    setRows((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function addBuiltin(routePath: string) {
    const found = BUILTIN_ROUTES.find((r) => r.path === routePath);
    if (!found) return;
    setRows((current) => [
      ...current,
      { id: null, labelNl: found.labelNl, labelEn: found.labelEn, url: found.path },
    ]);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="linkCount" value={rows.length} />
      {rows.map((row, index) => (
        <div key={row.id ?? `new-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-center">
          <input type="hidden" name={`link-${index}-id`} value={row.id ?? ""} />
          <Input
            name={`link-${index}-labelNl`}
            value={row.labelNl}
            onChange={(event) => update(index, { labelNl: event.target.value })}
            placeholder={nl ? "Label (NL)" : "Label (NL)"}
            required
          />
          <Input
            name={`link-${index}-labelEn`}
            value={row.labelEn}
            onChange={(event) => update(index, { labelEn: event.target.value })}
            placeholder={nl ? "Label (EN)" : "Label (EN)"}
            required
          />
          <Input
            name={`link-${index}-url`}
            type="text"
            inputMode="url"
            value={row.url}
            onChange={(event) => update(index, { url: event.target.value })}
            placeholder={nl ? "/praesidium of https://..." : "/praesidium or https://..."}
            required
          />
          <div className="flex items-center gap-1">
            <IconButton
              type="button"
              disabled={index === 0}
              label={nl ? "Omhoog verplaatsen" : "Move up"}
              srLabel={`${nl ? "Omhoog verplaatsen" : "Move up"}: ${row.labelNl || row.url}`}
              onClick={() => move(index, index - 1)}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </IconButton>
            <IconButton
              type="button"
              disabled={index === rows.length - 1}
              label={nl ? "Omlaag verplaatsen" : "Move down"}
              srLabel={`${nl ? "Omlaag verplaatsen" : "Move down"}: ${row.labelNl || row.url}`}
              onClick={() => move(index, index + 1)}
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </IconButton>
            <IconButton
              label={nl ? "Verwijderen" : "Remove"}
              srLabel={`${nl ? "Verwijderen" : "Remove"}: ${row.labelNl || row.url}`}
              tone="danger"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              <TrashIcon />
            </IconButton>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setRows((current) => [
              ...current,
              { id: null, labelNl: "", labelEn: "", url: "" },
            ])
          }
        >
          + {nl ? "Item toevoegen" : "Add item"}
        </Button>
        <select
          aria-label={nl ? "Vaste pagina toevoegen" : "Add built-in page"}
          className="rounded-lg border border-vtk-blue/20 bg-white px-2.5 py-1 text-xs text-vtk-ink shadow-sm"
          value=""
          onChange={(e) => {
            if (e.target.value) {
              addBuiltin(e.target.value);
              e.target.value = "";
            }
          }}
        >
          <option value="">+ {nl ? "Vaste pagina kiezen..." : "Choose built-in page..."}</option>
          {BUILTIN_ROUTES.map((route) => (
            <option key={route.path} value={route.path}>
              {nl ? route.labelNl : route.labelEn} ({route.path})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
