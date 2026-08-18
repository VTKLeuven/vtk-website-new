"use client";

import { useState } from "react";
import { Card, Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { PencilIcon } from "@/components/ui/icons";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { saveErrorMessages } from "@/lib/saveMessages";
import {
  deleteAnnouncementAction,
  saveAnnouncementAction,
  setAnnouncementActiveAction,
} from "@/app/actions/announcements";

export type AnnouncementRow = {
  id: string;
  titleNl: string;
  titleEn: string;
  bodyNl: string;
  bodyEn: string;
  ctaLabelNl: string;
  ctaLabelEn: string;
  ctaUrl: string;
  /** "YYYY-MM-DDTHH:mm" voor de datetime-local-velden; leeg = geen grens. */
  startsAt: string;
  endsAt: string;
  active: boolean;
  /** Enkel de homepage, of elke publieke pagina. */
  scope: "HOME" | "SITE";
  status: "live" | "scheduled" | "expired" | "off";
  createdLabel: string;
  windowLabel: string;
  authorName: string | null;
};

const EMPTY: AnnouncementRow = {
  id: "",
  titleNl: "",
  titleEn: "",
  bodyNl: "",
  bodyEn: "",
  ctaLabelNl: "",
  ctaLabelEn: "",
  ctaUrl: "",
  startsAt: "",
  endsAt: "",
  active: true,
  scope: "HOME",
  status: "off",
  createdLabel: "",
  windowLabel: "",
  authorName: null,
};

const STATUS_LABELS = {
  nl: { live: "Nu zichtbaar", scheduled: "Gepland", expired: "Afgelopen", off: "Uit" },
  en: { live: "Live now", scheduled: "Scheduled", expired: "Ended", off: "Off" },
} as const;

const STATUS_CLASS = {
  live: "bg-emerald-50 text-emerald-800",
  scheduled: "bg-amber-50 text-amber-800",
  expired: "bg-vtk-blue-soft text-[#5c667f]",
  off: "bg-vtk-blue-soft text-[#5c667f]",
} as const;

/**
 * Aankondigingen beheren: bovenaan het formulier (nieuw of het geselecteerde
 * bericht), daaronder alles wat er ooit stond. Dezelfde lijst dient als
 * historiek; een afgelopen bericht verdwijnt niet, het zakt gewoon naar onder.
 */
export function AnnouncementsManager({
  locale,
  announcements,
}: {
  locale: Locale;
  announcements: AnnouncementRow[];
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const statusLabels = STATUS_LABELS[nl ? "nl" : "en"];
  const [editing, setEditing] = useState<AnnouncementRow>(EMPTY);

  // De gedeelde meldingen (o.a. INVALID_URL voor het knopadres) plus wat enkel
  // hier speelt; INVALID_INPUT is bewust specifieker dan de algemene tekst.
  const errorMessages = {
    ...saveErrorMessages(locale),
    ...(nl
      ? {
          INVALID_INPUT: "Vul minstens een titel en een bericht in, in beide talen.",
          WINDOW_INVALID: "De einddatum ligt voor de startdatum.",
          CTA_INCOMPLETE: "Een knop heeft zowel een tekst als een link nodig.",
        }
      : {
          INVALID_INPUT: "Fill in at least a title and a message, in both languages.",
          WINDOW_INVALID: "The end date is before the start date.",
          CTA_INCOMPLETE: "A button needs both a label and a link.",
        }),
  };

  const isNew = editing.id === "";

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {isNew
              ? nl
                ? "Nieuwe aankondiging"
                : "New announcement"
              : nl
                ? "Aankondiging bewerken"
                : "Edit announcement"}
          </h2>
          {!isNew && (
            <button
              type="button"
              className="text-sm text-[#5c667f] underline hover:text-vtk-ink"
              onClick={() => setEditing(EMPTY)}
            >
              {nl ? "Nieuwe beginnen" : "Start a new one"}
            </button>
          )}
        </div>

        <SaveForm
          // key: bij het wisselen van bericht moeten de velden opnieuw hun
          // defaultValue nemen in plaats van de vorige tekst te houden.
          key={editing.id || "new"}
          action={saveAnnouncementAction}
          className="space-y-4"
          submitLabel={isNew ? (nl ? "Aankondiging opslaan" : "Save announcement") : dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Aankondiging opgeslagen" : "Announcement saved"}
          errorMessages={errorMessages}
          fallbackErrorMessage={dict.common.saveError}
          onSuccess={() => setEditing(EMPTY)}
        >
          {!isNew && <input type="hidden" name="id" value={editing.id} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="titleNl">{nl ? "Titel (NL)" : "Title (NL)"}</Label>
              <Input id="titleNl" name="titleNl" defaultValue={editing.titleNl} required />
            </div>
            <div>
              <Label htmlFor="titleEn">{nl ? "Titel (EN)" : "Title (EN)"}</Label>
              <Input id="titleEn" name="titleEn" defaultValue={editing.titleEn} required />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <Label htmlFor="announcement-body-nl">{nl ? "Bericht (NL)" : "Message (NL)"}</Label>
              <MarkdownEditorField
                name="bodyNl"
                defaultValue={editing.bodyNl}
                locale={locale}
                rows={7}
                allowImages={false}
                textareaId="announcement-body-nl"
              />
            </div>
            <div>
              <Label htmlFor="announcement-body-en">{nl ? "Bericht (EN)" : "Message (EN)"}</Label>
              <MarkdownEditorField
                name="bodyEn"
                defaultValue={editing.bodyEn}
                locale={locale}
                rows={7}
                allowImages={false}
                textareaId="announcement-body-en"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="ctaLabelNl">{nl ? "Knoptekst (NL)" : "Button label (NL)"}</Label>
              <Input id="ctaLabelNl" name="ctaLabelNl" defaultValue={editing.ctaLabelNl} />
            </div>
            <div>
              <Label htmlFor="ctaLabelEn">{nl ? "Knoptekst (EN)" : "Button label (EN)"}</Label>
              <Input id="ctaLabelEn" name="ctaLabelEn" defaultValue={editing.ctaLabelEn} />
            </div>
            <div>
              <Label htmlFor="ctaUrl">{nl ? "Knop-link" : "Button link"}</Label>
              <Input
                id="ctaUrl"
                name="ctaUrl"
                placeholder={nl ? "/kalender of https://..." : "/kalender or https://..."}
                defaultValue={editing.ctaUrl}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="startsAt">{nl ? "Zichtbaar vanaf" : "Visible from"}</Label>
              <Input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                defaultValue={editing.startsAt}
              />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl ? "Leeg = meteen." : "Empty = right away."}
              </p>
            </div>
            <div>
              <Label htmlFor="endsAt">{nl ? "Zichtbaar tot" : "Visible until"}</Label>
              <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={editing.endsAt} />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl ? "Leeg = blijft staan." : "Empty = stays up."}
              </p>
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-vtk-ink">
              {nl ? "Waar verschijnt ze?" : "Where does it appear?"}
            </span>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scope"
                  value="HOME"
                  defaultChecked={editing.scope !== "SITE"}
                />
                {nl ? "Enkel de homepage" : "Homepage only"}
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scope"
                  value="SITE"
                  defaultChecked={editing.scope === "SITE"}
                />
                {nl ? "Elke pagina" : "Every page"}
              </label>
            </div>
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Wie via Google of een gedeelde link binnenkomt, landt zelden op de homepage. Kies “elke pagina” voor iets dat iedereen moet weten, zoals een afgelasting. Nooit in het beheer, op de ticketscanner of tijdens het afrekenen."
                : "People arriving from Google or a shared link rarely land on the homepage. Pick “every page” for something everyone needs to know, like a cancellation. Never in admin, on the ticket scanner or during checkout."}
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={editing.active} />
            {nl ? "Actief" : "Active"}
          </label>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "Enkel actieve aankondigingen binnen hun venster verschijnen. Staan er meerdere tegelijk klaar, dan toont de site de meest recente."
              : "Only active announcements inside their window appear. If several are live at once, the site shows the most recent one."}
          </p>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{nl ? "Alle aankondigingen" : "All announcements"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Nieuwste eerst. Afgelopen berichten blijven staan als historiek."
            : "Newest first. Past messages stay as history."}
        </p>

        {announcements.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {nl ? "Er is nog nooit een aankondiging gemaakt." : "No announcement has been made yet."}
          </p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {announcements.map((announcement) => (
              // `basis-48` op de titel: smal zakt het actieblok als geheel naar
              // een tweede regel, in plaats van de titel tussen drie knoppen te
              // pletten tot een paar letters.
              <li key={announcement.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[announcement.status]}`}
                >
                  {statusLabels[announcement.status]}
                </span>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm font-medium text-vtk-ink">
                    {nl ? announcement.titleNl : announcement.titleEn}
                  </span>
                  <span className="block text-xs text-[#5c667f]">
                    {announcement.scope === "SITE"
                      ? nl
                        ? "Elke pagina"
                        : "Every page"
                      : nl
                        ? "Homepage"
                        : "Homepage"}
                    {" · "}
                    {announcement.windowLabel}
                    {announcement.authorName ? ` · ${announcement.authorName}` : ""}
                  </span>
                </span>

                <div className="ml-auto flex shrink-0 items-center gap-3">
                  <form action={setAnnouncementActiveAction}>
                    <input type="hidden" name="id" value={announcement.id} />
                    <input type="hidden" name="active" value={announcement.active ? "0" : "1"} />
                    <button
                      type="submit"
                      className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-medium text-vtk-ink hover:bg-vtk-blue-soft/60"
                    >
                      {announcement.active
                        ? nl
                          ? "Uitzetten"
                          : "Turn off"
                        : nl
                          ? "Aanzetten"
                          : "Turn on"}
                    </button>
                  </form>

                  <IconButton
                    label={nl ? "Bewerken" : "Edit"}
                    srLabel={`${nl ? "Bewerken" : "Edit"}: ${nl ? announcement.titleNl : announcement.titleEn}`}
                    onClick={() => {
                      setEditing(announcement);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <PencilIcon />
                  </IconButton>

                  <DeleteIconButton
                    action={deleteAnnouncementAction}
                    fields={{ id: announcement.id }}
                    label={nl ? "Verwijderen" : "Delete"}
                    srLabel={`${nl ? "Verwijderen" : "Delete"}: ${nl ? announcement.titleNl : announcement.titleEn}`}
                    title={nl ? "Aankondiging verwijderen?" : "Delete announcement?"}
                    description={
                      nl
                        ? `"${announcement.titleNl}" verdwijnt ook uit de historiek. Wil je ze enkel van de site halen, zet ze dan op uit.`
                        : `"${announcement.titleEn}" also disappears from the history. To only take it off the site, turn it off instead.`
                    }
                    confirmLabel={nl ? "Verwijderen" : "Delete"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Aankondiging verwijderd" : "Announcement deleted"}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
