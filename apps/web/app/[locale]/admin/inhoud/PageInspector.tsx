"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { SlugField } from "@/components/ui/SlugField";
import { savePageAction } from "@/app/actions/pages";
import { contentErrorMessages } from "./messages";
import { InspectorHead } from "./TabInspector";
import type { PageNode, RoleOption, TabNode } from "./ContentManager";

/**
 * Instellingen van een pagina in de rechterkolom: titels, slug, categorie,
 * publicatie, bewerkrollen en excerpts.
 *
 * De INHOUD, de bijlagen en het verwijderen van een pagina horen hier niet:
 * die zitten in de editor (`/admin/paginas/[id]`, knop bovenaan). Dit scherm
 * gaat enkel over waar een pagina hangt en hoe ze heet.
 */
export function PageInspector({
  locale,
  page,
  tabs,
  roles,
  onClose,
}: {
  locale: Locale;
  page: PageNode;
  tabs: TabNode[];
  roles: RoleOption[];
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const uid = useId();
  const base = nl ? "" : "/en";
  const [slug, setSlug] = useState(page.slug);

  return (
    <Card className="p-5">
      <InspectorHead title={page.titleNl} subtitle={`/${page.slug}`} onClose={onClose} />

      <div className="mb-5">
        <Link
          href={`${base}/admin/paginas/${page.id}`}
          className="inline-flex items-center gap-2 rounded-full bg-vtk-ink px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          {nl ? "Inhoud bewerken" : "Edit content"}
        </Link>
      </div>

      <SaveForm
        action={savePageAction}
        className="space-y-5"
        submitLabel={dict.admin.save}
        savingLabel={dict.common.saving}
        savedMessage={dict.common.saved}
        errorMessages={contentErrorMessages(locale)}
        fallbackErrorMessage={dict.common.saveError}
      >
        <input type="hidden" name="id" value={page.id} />
        <input type="hidden" name="order" value={page.order} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-titleNl`}>{nl ? "Titel (NL)" : "Title (NL)"}</Label>
            <Input id={`${uid}-titleNl`} name="titleNl" defaultValue={page.titleNl} required />
          </div>
          <div>
            <Label htmlFor={`${uid}-titleEn`}>{nl ? "Titel (EN)" : "Title (EN)"}</Label>
            <Input id={`${uid}-titleEn`} name="titleEn" defaultValue={page.titleEn ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SlugField
            locale={locale}
            id={`${uid}-slug`}
            name="slug"
            value={slug}
            onChange={setSlug}
          />
          <div>
            <Label htmlFor={`${uid}-headerTabId`}>{nl ? "Categorie" : "Category"}</Label>
            <Select id={`${uid}-headerTabId`} name="headerTabId" defaultValue={page.headerTabId ?? ""}>
              <option value="">— {nl ? "niet gekoppeld" : "unlinked"} —</option>
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {nl ? t.labelNl : t.labelEn} (/{t.slug})
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? '"Niet gekoppeld" haalt de pagina uit de navigatie; ze blijft bestaan en bereikbaar op /p/<slug>.'
                : '"Unlinked" takes the page out of the navigation; it keeps existing and stays reachable at /p/<slug>.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="visibleInHeader" defaultChecked={page.visibleInHeader} />
            {nl ? "Tonen in overzicht" : "Show in overview"}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={page.published} />
            {nl ? "Gepubliceerd" : "Published"}
          </label>
        </div>

        <PageRightsFields locale={locale} page={page} roles={roles} uid={uid} />

        <div className="grid grid-cols-1 gap-4 border-t border-vtk-blue/10 pt-5 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-excerptNl`}>
              {nl ? "Korte beschrijving (NL)" : "Excerpt (NL)"}
            </Label>
            <Textarea id={`${uid}-excerptNl`} name="excerptNl" rows={2} defaultValue={page.excerptNl ?? ""} />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Verschijnt op de kaart op de categoriepagina."
                : "Shows on the card on the category page."}
            </p>
          </div>
          <div>
            <Label htmlFor={`${uid}-excerptEn`}>
              {nl ? "Korte beschrijving (EN)" : "Excerpt (EN)"}
            </Label>
            <Textarea id={`${uid}-excerptEn`} name="excerptEn" rows={2} defaultValue={page.excerptEn ?? ""} />
          </div>
        </div>
      </SaveForm>
    </Card>
  );
}

/**
 * Compacte weergave van de rechten: jaarlijks nakijken en wie mag bewerken. Dit
 * wijzigt zelden, dus standaard staat er enkel een samenvatting; "Bewerken"
 * klapt de volledige rollenlijst open.
 *
 * De checkboxes blijven ALTIJD gemonteerd (enkel visueel verborgen). Zouden ze
 * uit de DOM verdwijnen, dan stuurt het formulier geen `editorRoleIds` mee en
 * zou opslaan alle bewerkrollen wissen.
 */
function PageRightsFields({
  locale,
  page,
  roles,
  uid,
}: {
  locale: Locale;
  page: PageNode;
  roles: RoleOption[];
  uid: string;
}) {
  const nl = locale === "nl";
  const [editing, setEditing] = useState(false);
  const [yearly, setYearly] = useState(page.needsYearlyEdit);
  const [roleIds, setRoleIds] = useState<string[]>(page.editorRoleIds);

  const assigned = roles.filter((r) => roleIds.includes(r.id));

  function toggleRole(id: string) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <fieldset className="border-t border-vtk-blue/10 pt-5">
      <div className="flex items-start justify-between gap-3">
        <legend className="text-sm font-semibold text-vtk-ink">
          {nl ? "Rechten" : "Rights"}
        </legend>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="shrink-0 rounded-full border border-vtk-blue/20 px-3 py-1 text-xs font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
        >
          {editing ? (nl ? "Klaar" : "Done") : nl ? "Bewerken" : "Edit"}
        </button>
      </div>

      <label className="mt-2 inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="needsYearlyEdit"
          checked={yearly}
          onChange={(e) => setYearly(e.target.checked)}
        />
        {nl ? "Jaarlijks nakijken" : "Yearly review"}
      </label>

      {/* Samenvatting: enkel de rollen die deze pagina mogen bewerken. */}
      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#5c667f]">{nl ? "Mag bewerken:" : "Can edit:"}</span>
          {assigned.length === 0 ? (
            <span className="text-xs text-[#34405e]">
              {nl
                ? "niemand (enkel Alle pagina's bewerken / superadmin)"
                : "nobody (only Edit all pages / super admin)"}
            </span>
          ) : (
            assigned.map((r) => (
              <span
                key={r.id}
                className="rounded-full bg-vtk-blue-soft/70 px-2 py-0.5 text-[11px] font-medium text-[#34405e]"
              >
                {r.name}
              </span>
            ))
          )}
        </div>
      )}

      <div className={editing ? "mt-3" : "hidden"}>
        <p className="mb-2 text-xs text-[#5c667f]">
          {nl
            ? 'Leden met een aangevinkte rol (en het recht "Toegewezen pagina\'s bewerken") kunnen de inhoud van deze pagina bewerken.'
            : 'Members holding a checked role (plus the "Edit assigned pages" permission) can edit this page\'s content.'}
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {roles.map((role) => (
            <label key={role.id} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="editorRoleIds"
                value={role.id}
                checked={roleIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
                id={`${uid}-role-${role.id}`}
              />
              {role.name}
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
