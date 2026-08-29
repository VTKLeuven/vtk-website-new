"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Card, Input, Label } from "@vtk/ui";
import { Check, ClipboardList, Copy } from "lucide-react";
import type { Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import {
  createFormForPageAction,
  linkFormToPageAction,
  unlinkFormFromPageAction,
} from "@/app/actions/pageForm";
import { FORM_MARKER } from "@/lib/pageForm";

export type PageFormOption = { id: string; label: string };
export type PageFormGroup = { id: string; name: string };

export type LinkedForm = {
  id: string;
  slug: string;
  title: string;
  status: string;
  fieldCount: number;
  entryCount: number;
};

/**
 * Het formulier van deze pagina, beheerd vanaf de pagina.
 *
 * Dezelfde koppeling die je ook bij de instellingen van een formulier kan
 * leggen, maar dan vanuit de kant waar een redacteur toch al bezig is. Er zijn
 * drie toestanden: er hangt er een aan (tonen wat en waar), je kan er een
 * bestaande kiezen, of je maakt er meteen een nieuwe voor.
 */
export function PageFormCard({
  locale,
  pageId,
  pageTitle,
  linked,
  forms,
  groups,
  hasMarker,
}: {
  locale: Locale;
  pageId: string;
  pageTitle: string;
  linked: LinkedForm | null;
  /** Formulieren die deze gebruiker beheert en die nog nergens anders staan. */
  forms: PageFormOption[];
  /** Posten waarvoor deze gebruiker een formulier mag aanmaken. */
  groups: PageFormGroup[];
  /** Staat de markering in de tekst van de pagina? */
  hasMarker: boolean;
}) {
  const nl = locale === "nl";
  const uid = useId();
  const base = nl ? "" : "/en";
  const [mode, setMode] = useState<"pick" | "create">("pick");

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-vtk-ink">
        <ClipboardList size={16} aria-hidden="true" />
        {nl ? "Formulier op deze pagina" : "Form on this page"}
      </h2>
      <p className="mt-1 text-xs text-[#5c667f]">
        {nl
          ? "Een formulier verschijnt als paneel in de tekst, en krijgt een eigen knop in de “Op deze pagina”-lijst. Het houdt daarnaast gewoon zijn eigen adres op /formulieren."
          : "A form shows up as a panel inside the text and gets its own button in the “On this page” list. It also keeps its own address under /formulieren."}
      </p>

      {linked ? (
        <LinkedFormPanel
          locale={locale}
          pageId={pageId}
          pageTitle={pageTitle}
          linked={linked}
          hasMarker={hasMarker}
        />
      ) : forms.length === 0 && groups.length === 0 ? (
        <p className="mt-4 rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/40 px-4 py-3 text-sm text-[#34405e]">
          {nl
            ? "Je beheert geen formulieren en mag er ook geen aanmaken. Vraag iemand van de post met het formulierrecht om er een te maken; die kan het daarna aan deze pagina hangen."
            : "You manage no forms and cannot create one either. Ask someone on the post with the forms permission to make one; they can attach it to this page afterwards."}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {forms.length > 0 && groups.length > 0 ? (
            <div className="flex w-fit rounded-lg border border-vtk-blue/15 p-0.5" role="tablist">
              <ModeTab active={mode === "pick"} onClick={() => setMode("pick")}>
                {nl ? "Bestaand formulier" : "Existing form"}
              </ModeTab>
              <ModeTab active={mode === "create"} onClick={() => setMode("create")}>
                {nl ? "Nieuw formulier" : "New form"}
              </ModeTab>
            </div>
          ) : null}

          {forms.length > 0 && (groups.length === 0 || mode === "pick") ? (
            <SaveForm
              action={linkFormToPageAction}
              className="space-y-3"
              submitLabel={nl ? "Koppelen" : "Attach"}
              savingLabel={nl ? "Bezig met koppelen..." : "Attaching..."}
              savedMessage={nl ? "Formulier staat op deze pagina" : "Form is on this page"}
              errorMessages={linkErrors(nl)}
              fallbackErrorMessage={nl ? "Koppelen is niet gelukt." : "Attaching failed."}
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="pageId" value={pageId} />
              <div className="max-w-xl">
                <Label htmlFor={`${uid}-form`}>{nl ? "Welk formulier?" : "Which form?"}</Label>
                <ThemedSelect
                  id={`${uid}-form`}
                  name="formId"
                  defaultValue={forms[0]?.id ?? ""}
                  options={forms.map((form) => ({ value: form.id, label: form.label }))}
                />
              </div>
              <p className="text-xs text-[#5c667f]">
                {nl
                  ? "Enkel formulieren die je zelf beheert en die nog op geen andere pagina staan."
                  : "Only forms you manage yourself that are not on another page yet."}
              </p>
            </SaveForm>
          ) : null}

          {groups.length > 0 && (forms.length === 0 || mode === "create") ? (
            <SaveForm
              action={createFormForPageAction}
              className="space-y-3"
              submitLabel={nl ? "Formulier maken" : "Create form"}
              savingLabel={nl ? "Bezig met aanmaken..." : "Creating..."}
              savedMessage={nl ? "Formulier aangemaakt" : "Form created"}
              errorMessages={linkErrors(nl)}
              fallbackErrorMessage={nl ? "Aanmaken is niet gelukt." : "Creating failed."}
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="pageId" value={pageId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${uid}-title`}>{nl ? "Titel" : "Title"}</Label>
                  <Input
                    id={`${uid}-title`}
                    name="titleNl"
                    maxLength={200}
                    defaultValue={pageTitle}
                    placeholder={nl ? "Inschrijving IFB" : "IFB sign-up"}
                  />
                </div>
                <div>
                  <Label htmlFor={`${uid}-group`}>{nl ? "Eigenaar" : "Owner"}</Label>
                  <ThemedSelect
                    id={`${uid}-group`}
                    name="ownerGroupId"
                    defaultValue={groups[0]?.id ?? ""}
                    options={groups.map((group) => ({ value: group.id, label: group.name }))}
                  />
                </div>
              </div>
              <p className="text-xs text-[#5c667f]">
                {nl
                  ? "Je komt hierna in de veldeditor terecht om de vragen op te stellen. Het formulier staat als concept klaar en gaat pas online wanneer je het publiceert."
                  : "You land in the field editor afterwards to write the questions. The form starts as a draft and only goes live once you publish it."}
              </p>
            </SaveForm>
          ) : null}
        </div>
      )}

      {linked ? null : (
        <p className="mt-4 text-xs text-[#5c667f]">
          {nl ? (
            <>
              Alle formulieren staan onder{" "}
              <Link href={`${base}/admin/formulieren`} className="underline">
                Formulieren
              </Link>
              .
            </>
          ) : (
            <>
              All forms live under{" "}
              <Link href={`${base}/admin/formulieren`} className="underline">
                Forms
              </Link>
              .
            </>
          )}
        </p>
      )}
    </Card>
  );
}

/** Wat er nu op de pagina staat, waar precies, en hoe je het er weer af haalt. */
function LinkedFormPanel({
  locale,
  pageId,
  pageTitle,
  linked,
  hasMarker,
}: {
  locale: Locale;
  pageId: string;
  pageTitle: string;
  linked: LinkedForm;
  hasMarker: boolean;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/30 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium text-vtk-ink">{linked.title}</p>
          <StatusPill locale={locale} status={linked.status} />
        </div>
        <p className="mt-1 text-xs text-[#5c667f]">
          <span className="font-mono text-[11px]">/formulieren/{linked.slug}</span>
          {" · "}
          {nl
            ? `${linked.fieldCount} ${linked.fieldCount === 1 ? "vraag" : "vragen"}`
            : `${linked.fieldCount} ${linked.fieldCount === 1 ? "question" : "questions"}`}
          {" · "}
          {nl
            ? `${linked.entryCount} ${linked.entryCount === 1 ? "inzending" : "inzendingen"}`
            : `${linked.entryCount} ${linked.entryCount === 1 ? "entry" : "entries"}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`${base}/admin/formulieren/${linked.id}/velden`}
            className="rounded-full border border-vtk-blue/20 bg-white px-3 py-1.5 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
          >
            {nl ? "Vragen bewerken" : "Edit questions"}
          </Link>
          <Link
            href={`${base}/admin/formulieren/${linked.id}/inzendingen`}
            className="rounded-full border border-vtk-blue/20 bg-white px-3 py-1.5 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
          >
            {nl ? "Inzendingen" : "Entries"}
          </Link>
          <Link
            href={`${base}/admin/formulieren/${linked.id}/instellingen`}
            className="rounded-full border border-vtk-blue/20 bg-white px-3 py-1.5 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
          >
            {nl ? "Instellingen" : "Settings"}
          </Link>
        </div>
      </div>

      <div>
        <p className="text-sm text-[#34405e]">
          {hasMarker
            ? nl
              ? "Het paneel staat op de plaats van de markering in de tekst."
              : "The panel sits where the marker is in the text."
            : nl
              ? "Het paneel staat onderaan de pagina. Zet de markering op een eigen regel in de tekst om het ergens anders te laten verschijnen."
              : "The panel sits at the bottom of the page. Put the marker on its own line in the text to place it somewhere else."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-vtk-blue-soft px-2 py-1 font-mono text-[13px] text-vtk-ink">
            {FORM_MARKER}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(FORM_MARKER).then(() => setCopied(true));
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-vtk-blue/20 px-3 py-1.5 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
            title={nl ? "Markering kopiëren" : "Copy marker"}
          >
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            {copied
              ? nl
                ? "Gekopieerd"
                : "Copied"
              : nl
                ? "Markering kopiëren"
                : "Copy marker"}
          </button>
        </div>
      </div>

      {linked.status === "DRAFT" ? (
        <p className="rounded-xl border border-vtk-yellow-dark/30 bg-vtk-yellow/10 px-3 py-2 text-xs text-[#34405e]">
          {nl
            ? "Dit formulier staat nog op concept: bezoekers zien het paneel nog niet. Publiceer het bij de instellingen van het formulier."
            : "This form is still a draft: visitors do not see the panel yet. Publish it in the form's own settings."}
        </p>
      ) : null}

      <div className="border-t border-vtk-blue/10 pt-4">
        <DeleteButton
          action={unlinkFormFromPageAction}
          fields={{ pageId, locale }}
          title={nl ? "Formulier van de pagina halen?" : "Take the form off the page?"}
          description={
            nl
              ? `Het paneel verdwijnt van "${pageTitle}". Het formulier zelf blijft bestaan met zijn ${linked.entryCount} inzending(en) en blijft bereikbaar op /formulieren/${linked.slug}; er wordt niets verwijderd.`
              : `The panel disappears from "${pageTitle}". The form itself keeps existing with its ${linked.entryCount} entry/entries and stays available at /formulieren/${linked.slug}; nothing is deleted.`
          }
          confirmLabel={nl ? "Van de pagina halen" : "Take off the page"}
          cancelLabel={nl ? "Annuleren" : "Cancel"}
          successMessage={nl ? "Formulier staat niet meer op deze pagina" : "Form is off this page"}
        >
          {nl ? "Formulier van de pagina halen" : "Take the form off the page"}
        </DeleteButton>
      </div>
    </div>
  );
}

function StatusPill({ locale, status }: { locale: Locale; status: string }) {
  const nl = locale === "nl";
  const label =
    status === "PUBLISHED"
      ? nl
        ? "online"
        : "live"
      : status === "CLOSED"
        ? nl
          ? "gesloten"
          : "closed"
        : status === "ARCHIVED"
          ? nl
            ? "gearchiveerd"
            : "archived"
          : nl
            ? "concept"
            : "draft";
  return (
    <span
      className={[
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "PUBLISHED"
          ? "bg-vtk-yellow/40 text-[#34405e]"
          : "bg-white text-[#5c667f] border border-vtk-blue/15",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function linkErrors(nl: boolean): Record<string, string> {
  return {
    FORM_NOT_FOUND: nl ? "Kies een formulier." : "Pick a form.",
    PAGE_NOT_FOUND: nl ? "Deze pagina bestaat niet meer." : "This page no longer exists.",
    PAGE_FORBIDDEN: nl
      ? "Je mag deze pagina niet bewerken."
      : "You cannot edit this page.",
    PAGE_TAKEN: nl
      ? "Op deze pagina staat al een formulier. Haal dat er eerst af."
      : "This page already carries a form. Take that one off first.",
    FORBIDDEN: nl
      ? "Je mag geen formulieren aanmaken voor deze post."
      : "You cannot create forms for this post.",
    TITLE_REQUIRED: nl ? "Geef het formulier een titel." : "Give the form a title.",
    GROUP_REQUIRED: nl ? "Kies een eigenaar." : "Pick an owner.",
    SLUG_TAKEN: nl
      ? "Er bestaan al te veel formulieren met deze naam; kies een andere titel."
      : "Too many forms share this name already; pick another title.",
  };
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-vtk-ink text-white" : "text-[#5c667f] hover:text-vtk-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
