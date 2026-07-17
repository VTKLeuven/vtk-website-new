"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ConfirmDialog } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { SlugField, isValidSlug } from "@/components/ui/SlugField";
import { deletePageAction, savePageSettingsAction } from "@/app/actions/pages";
import { SAVE_IDLE } from "@/lib/saveState";
import { saveErrorMessages } from "@/lib/saveMessages";
import { losesOwnPageAccess } from "@/lib/pageAccess";

export type SettingsRole = { id: string; name: string };

/** Zelfde set, ongeacht volgorde? */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Instellingen onderaan de inhoudseditor: jaarlijks nakijken en wie de pagina
 * mag bewerken. Staat bewust apart van het opslaan van de inhoud: dit wijzigt
 * zelden, en een bewerkrol per ongeluk uitvinken heeft grote gevolgen.
 *
 * Daarom committen de bewerkrollen pas na een expliciete bevestiging (vinkje +
 * knop). Neemt de wijziging je eigen toegang weg, dan komt daar nog een
 * bevestigingsdialoog bij en ga je na het opslaan terug naar het overzicht: op
 * deze pagina blijven zou enkel een foutmelding opleveren.
 */
export function PageSettingsCard({
  locale,
  pageId,
  roles,
  myRoleIds,
  canEditAll,
  canDelete,
  canPublish,
  pageTitle,
  assetCount,
  initialSlug,
  initialPublished,
  initialNeedsYearlyEdit,
  initialRoleIds,
}: {
  locale: Locale;
  pageId: string;
  roles: SettingsRole[];
  /** Rollen die de gebruiker dit werkingsjaar draagt; bepaalt of hij zichzelf buitensluit. */
  myRoleIds: string[];
  canEditAll: boolean;
  canDelete: boolean;
  /** `pages.publish` of `pages.manage`: zonder dit blijft de publicatiestatus zoals ze is. */
  canPublish: boolean;
  pageTitle: string;
  assetCount: number;
  initialSlug: string;
  initialPublished: boolean;
  initialNeedsYearlyEdit: boolean;
  initialRoleIds: string[];
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const overview = nl ? "/admin/paginas" : "/en/admin/paginas";

  // Wat er nu in de DB staat; na een geslaagde opslag is dit de nieuwe basis.
  const [savedSlug, setSavedSlug] = useState(initialSlug);
  const [savedPublished, setSavedPublished] = useState(initialPublished);
  const [savedYearly, setSavedYearly] = useState(initialNeedsYearlyEdit);
  const [savedRoles, setSavedRoles] = useState<string[]>(initialRoleIds);

  const [slug, setSlug] = useState(initialSlug);
  const [published, setPublished] = useState(initialPublished);
  const [yearly, setYearly] = useState(initialNeedsYearlyEdit);
  const [roleIds, setRoleIds] = useState<string[]>(initialRoleIds);
  const [askLoseAccess, setAskLoseAccess] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  const rolesChanged = !sameSet(roleIds, savedRoles);
  const yearlyChanged = yearly !== savedYearly;
  const slugChanged = slug.trim() !== savedSlug;
  const publishedChanged = published !== savedPublished;
  const slugValid = isValidSlug(slug);
  const dirty = rolesChanged || yearlyChanged || slugChanged || publishedChanged;

  const wouldLoseAccess = useMemo(
    () => rolesChanged && losesOwnPageAccess({ canEditAll, myRoleIds, nextRoleIds: roleIds }),
    [canEditAll, rolesChanged, roleIds, myRoleIds],
  );

  const canSubmit = dirty && slugValid && !pending;

  function toggleRole(id: string) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function reset() {
    setSlug(savedSlug);
    setPublished(savedPublished);
    setYearly(savedYearly);
    setRoleIds(savedRoles);
  }

  function submit() {
    const form = new FormData();
    form.append("id", pageId);
    form.append("slug", slug.trim());
    if (yearly) form.append("needsYearlyEdit", "on");
    // Enkel meesturen wie ook mag publiceren: de action laat de publicatiestatus
    // ongemoeid wanneer het veld ontbreekt, zodat een gewone bewerker een
    // gepubliceerde pagina niet per ongeluk offline haalt door op te slaan.
    if (canPublish) form.append("published", published ? "on" : "off");
    for (const id of roleIds) form.append("editorRoleIds", id);

    const losing = wouldLoseAccess;
    startTransition(async () => {
      const res = await savePageSettingsAction(SAVE_IDLE, form);
      setAskLoseAccess(false);
      if (res.status === "error") {
        showToast({
          message: saveErrorMessages(locale)[res.code] ?? (nl ? "Niet opgeslagen." : "Not saved."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      setSavedSlug(slug.trim());
      setSavedPublished(published);
      setSavedYearly(yearly);
      setSavedRoles(roleIds);
      showToast({
        message: losing
          ? nl
            ? "Opgeslagen. Je hebt je eigen toegang tot deze pagina opgeheven."
            : "Saved. You removed your own access to this page."
          : nl
            ? "Instellingen opgeslagen"
            : "Settings saved",
        variant: "success",
      });
      // Blijven staan zou enkel een foutmelding opleveren: de editor is nu
      // verboden terrein voor deze gebruiker.
      if (losing) router.push(overview);
    });
  }

  function remove() {
    const form = new FormData();
    form.append("id", pageId);
    startTransition(async () => {
      const res = await deletePageAction(SAVE_IDLE, form);
      setAskDelete(false);
      if (res.status === "error") {
        showToast({
          message: saveErrorMessages(locale)[res.code] ?? (nl ? "Niet verwijderd." : "Not deleted."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: nl ? "Pagina verwijderd" : "Page deleted",
        variant: "success",
      });
      // De pagina bestaat niet meer; hier blijven staan kan niet.
      router.push(overview);
    });
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-vtk-ink">
        {nl ? "Instellingen" : "Settings"}
      </h2>
      <p className="mt-1 text-xs text-[#5c667f]">
        {nl
          ? "Deze instellingen wijzigen zelden. Ze gelden voor de hele pagina, niet per taal."
          : "These settings rarely change. They apply to the whole page, not per language."}
      </p>

      <div className="mt-4 max-w-md">
        <SlugField locale={locale} id={`${uid}-slug`} value={slug} onChange={setSlug} />
      </div>

      {canPublish && (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-vtk-ink">
              {nl ? "Gepubliceerd" : "Published"}
            </span>
            <span className="block text-xs text-[#5c667f]">
              {nl
                ? "Een gepubliceerde pagina is voor iedereen zichtbaar op de site. Een concept zie je enkel hier."
                : "A published page is visible to everyone on the site. A draft is only visible here."}
            </span>
          </span>
        </label>
      )}

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={yearly}
          onChange={(e) => setYearly(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-vtk-ink">
            {nl ? "Jaarlijks nakijken" : "Yearly review"}
          </span>
          <span className="block text-xs text-[#5c667f]">
            {nl
              ? "De pagina bevat info die elk werkingsjaar verandert (namen, nummers, ...). Ze komt bovenaan het paginaoverzicht tot de inhoud dit jaar opgeslagen is."
              : "The page holds info that changes every working year (names, numbers, ...). It stays on top of the pages overview until the content is saved this year."}
          </span>
        </span>
      </label>

      <fieldset className="mt-5 border-t border-vtk-blue/10 pt-4">
        <legend className="text-sm font-semibold text-vtk-ink">
          {nl ? "Wie mag deze pagina bewerken?" : "Who can edit this page?"}
        </legend>
        <p className="mt-1 text-xs text-[#5c667f]">
          {nl
            ? 'Leden met een aangevinkte rol (en het recht "Toegewezen pagina\'s bewerken") kunnen de inhoud van deze pagina bewerken.'
            : 'Members holding a checked role (plus the "Edit assigned pages" permission) can edit this page\'s content.'}
        </p>

        <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {roles.map((role) => {
            const mine = myRoleIds.includes(role.id);
            return (
              <label key={role.id} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                />
                <span className="text-vtk-ink">{role.name}</span>
                {mine && (
                  <span className="rounded-full bg-vtk-blue-soft/70 px-1.5 py-0.5 text-[10px] font-medium text-[#5c667f]">
                    {nl ? "jouw rol" : "your role"}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {roles.length === 0 && (
          <p className="mt-2 text-sm text-[#5c667f]">
            {nl ? "Er zijn nog geen rollen." : "There are no roles yet."}
          </p>
        )}

        {roleIds.length === 0 && (
          <p className="mt-3 rounded-xl border border-vtk-yellow-dark/30 bg-vtk-yellow/10 px-3 py-2 text-xs text-[#34405e]">
            {nl
              ? 'Zonder rollen is deze pagina vergrendeld: enkel wie "Alle pagina\'s bewerken" heeft of superadmin is, raakt er nog aan.'
              : 'With no roles this page is locked: only holders of "Edit all pages" or a super admin can still touch it.'}
          </p>
        )}

      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => (wouldLoseAccess ? setAskLoseAccess(true) : submit())}
        >
          {pending ? (nl ? "Bezig..." : "Saving...") : nl ? "Wijzigen" : "Change"}
        </Button>
        {dirty && !pending && (
          <button
            type="button"
            onClick={reset}
            className="text-sm font-medium text-[#5c667f] hover:text-vtk-ink"
          >
            {nl ? "Annuleren" : "Cancel"}
          </button>
        )}
      </div>

      {canDelete && (
        <div className="mt-6 border-t border-vtk-blue/10 pt-5">
          <Button variant="ghost" size="sm" type="button" onClick={() => setAskDelete(true)}>
            {nl ? "Pagina verwijderen" : "Delete page"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={askDelete}
        title={nl ? "Pagina verwijderen?" : "Delete page?"}
        description={
          nl
            ? `"${pageTitle}" (/${savedSlug}) wordt permanent verwijderd, samen met de inhoud en ${assetCount} bijlage(n). Dit kan niet ongedaan gemaakt worden.`
            : `"${pageTitle}" (/${savedSlug}) will be permanently deleted, along with its content and ${assetCount} attachment(s). This cannot be undone.`
        }
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={remove}
        onCancel={() => setAskDelete(false)}
      />

      <ConfirmDialog
        open={askLoseAccess}
        title={nl ? "Je eigen toegang opheffen?" : "Remove your own access?"}
        description={
          nl
            ? "Geen van de aangevinkte rollen is er één van jou. Na het opslaan kan je deze pagina niet meer bewerken en ga je terug naar het overzicht. Enkel iemand met \"Alle pagina's bewerken\" of een superadmin kan dit terugdraaien."
            : "None of the checked roles is one of yours. After saving you can no longer edit this page and you will return to the overview. Only someone with \"Edit all pages\" or a super admin can undo this."
        }
        confirmLabel={nl ? "Toch opslaan" : "Save anyway"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={submit}
        onCancel={() => setAskLoseAccess(false)}
      />
    </Card>
  );
}
