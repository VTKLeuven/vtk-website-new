"use client";

import { useState } from "react";
import { createFormAction } from "@/app/actions/forms";
import { SaveForm } from "@/components/ui/SaveForm";
import { slugify } from "@/lib/ticketing/slug";
import type { AdminLocale } from "./format";

type GroupOption = { id: string; name: string };
type CalendarOption = { id: string; label: string; groupId: string };

/**
 * Aanmaken vraagt bewust weinig: titel, eigenaar en doelpubliek. De rest (open-
 * en sluitmomenten, bevestigingsmail, toestemming) staat in de instellingen,
 * want anders zit je aan een scherm vol keuzes voor je één vraag getypt hebt.
 */
export function FormCreateForm({
  locale,
  groups,
  calendarEvents,
}: {
  locale: AdminLocale;
  groups: GroupOption[];
  calendarEvents: CalendarOption[];
}) {
  const nl = locale === "nl";
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");

  const effectiveSlug = slugTouched ? slug : slugify(title);
  const eventsForGroup = calendarEvents.filter((event) => event.groupId === groupId);

  return (
    <SaveForm
      action={createFormAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Formulier aanmaken" : "Create form"}
      savingLabel={nl ? "Bezig met aanmaken..." : "Creating..."}
      savedMessage={nl ? "Formulier aangemaakt" : "Form created"}
      fallbackErrorMessage={
        nl ? "Aanmaken is niet gelukt." : "The form could not be created."
      }
      errorMessages={{
        TITLE_REQUIRED: nl ? "Geef het formulier een titel." : "Give the form a title.",
        GROUP_REQUIRED: nl ? "Kies een eigenaar." : "Pick an owner.",
        FORBIDDEN: nl
          ? "Je mag geen formulieren aanmaken voor deze post."
          : "You cannot create forms for this post.",
        SLUG_TAKEN: nl
          ? "Deze URL is al in gebruik door een ander formulier."
          : "This URL is already used by another form.",
        INVALID_SLUG: nl
          ? "Deze URL kan niet: gebruik letters, cijfers en koppeltekens."
          : "This URL will not work: use letters, digits and hyphens.",
        INVALID_CALENDAREVENTID: nl
          ? "Dat evenement hoort niet bij de gekozen post."
          : "That event does not belong to the selected post.",
      }}
    >
      <input type="hidden" name="locale" value={locale} />

      <div className="ticket-admin-form-grid">
        <div className="ticket-admin-field" data-span="2">
          <label htmlFor="form-title-nl">{nl ? "Titel (NL)" : "Title (NL)"}</label>
          <input
            id="form-title-nl"
            name="titleNl"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={nl ? "Inschrijving galabal" : "Gala sign-up"}
            maxLength={200}
            required
          />
        </div>
        <div className="ticket-admin-field" data-span="2">
          <label htmlFor="form-title-en">{nl ? "Titel (EN, optioneel)" : "Title (EN, optional)"}</label>
          <input id="form-title-en" name="titleEn" maxLength={200} />
          <span className="ticket-admin-help">
            {nl
              ? "Laat leeg als het formulier enkel in het Nederlands bestaat; je kiest bij de instellingen wat een Engelstalige bezoeker dan ziet."
              : "Leave empty when the form only exists in Dutch; the settings decide what an English visitor sees."}
          </span>
        </div>

        <div className="ticket-admin-field" data-span="2">
          <label htmlFor="form-slug">URL</label>
          <input
            id="form-slug"
            name="slug"
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            pattern="[a-z0-9-]+"
            maxLength={80}
          />
          <span className="ticket-admin-help">
            /formulieren/{effectiveSlug || (nl ? "url-naam" : "url-name")}
          </span>
        </div>

        <div className="ticket-admin-field">
          <label htmlFor="form-owner">{nl ? "Eigenaar" : "Owner"}</label>
          <select
            id="form-owner"
            name="ownerGroupId"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            required
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <span className="ticket-admin-help">
            {nl
              ? "De post die dit formulier beheert. De leiding van die post krijgt meteen toegang."
              : "The post that owns this form. Its leads get access straight away."}
          </span>
        </div>

        <div className="ticket-admin-field">
          <label htmlFor="form-audience">{nl ? "Wie mag invullen?" : "Who can fill it in?"}</label>
          <select id="form-audience" name="audience" defaultValue="PUBLIC">
            <option value="PUBLIC">{nl ? "Iedereen" : "Everyone"}</option>
            <option value="MEMBERS">{nl ? "Enkel ingelogde leden" : "Logged-in members only"}</option>
          </select>
        </div>

        {eventsForGroup.length > 0 ? (
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor="form-calendar-event">
              {nl ? "Hangt aan een evenement (optioneel)" : "Attached to an event (optional)"}
            </label>
            <select id="form-calendar-event" name="calendarEventId" defaultValue="">
              <option value="">{nl ? "Geen evenement" : "No event"}</option>
              {eventsForGroup.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.label}
                </option>
              ))}
            </select>
            <span className="ticket-admin-help">
              {nl
                ? "Het formulier verschijnt dan bij dat evenement, en de bevestigingsmail kan er een agenda-item bij steken."
                : "The form then shows up with that event, and the confirmation mail can attach a calendar item."}
            </span>
          </div>
        ) : null}
      </div>
    </SaveForm>
  );
}
