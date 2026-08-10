"use client";

import { useState } from "react";
import { saveFormSettingsAction } from "@/app/actions/forms";
import { SaveForm } from "@/components/ui/SaveForm";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import type { AdminLocale } from "./format";

export type FormSettingsValues = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  introNl: string | null;
  introEn: string | null;
  status: string;
  audience: string;
  listed: boolean;
  localeMode: string;
  unavailableNl: string | null;
  unavailableEn: string | null;
  opensAt: string;
  closesAt: string;
  maxEntries: number | null;
  allowWaitlist: boolean;
  stepBySections: boolean;
  allowMultipleSubmissions: boolean;
  allowEditAfterSubmit: boolean;
  allowDrafts: boolean;
  confirmationEnabled: boolean;
  confirmationSubjectNl: string | null;
  confirmationSubjectEn: string | null;
  confirmationBodyNl: string | null;
  confirmationBodyEn: string | null;
  confirmationIncludeAnswers: boolean;
  confirmationIncludeIcs: boolean;
  notifyMode: string;
  notifyEmails: string[];
  thankYouNl: string | null;
  thankYouEn: string | null;
  requireConsent: boolean;
  consentTextNl: string | null;
  consentTextEn: string | null;
  retentionDays: number | null;
  calendarEventId: string | null;
  hasCalendarEvent: boolean;
};

type CalendarOption = { id: string; label: string };

export function FormSettingsForm({
  locale,
  values,
  calendarEvents,
}: {
  locale: AdminLocale;
  values: FormSettingsValues;
  calendarEvents: CalendarOption[];
}) {
  const nl = locale === "nl";
  const [localeMode, setLocaleMode] = useState(values.localeMode);
  const [confirmationEnabled, setConfirmationEnabled] = useState(values.confirmationEnabled);
  const [requireConsent, setRequireConsent] = useState(values.requireConsent);
  const [notifyMode, setNotifyMode] = useState(values.notifyMode);

  const showEnglish = localeMode !== "NL_ONLY";
  const showDutch = localeMode !== "EN_ONLY";

  return (
    <SaveForm
      action={saveFormSettingsAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Instellingen opgeslagen" : "Settings saved"}
      fallbackErrorMessage={nl ? "Opslaan is niet gelukt." : "Saving failed."}
      errorMessages={{
        TITLE_REQUIRED: nl ? "Geef het formulier een titel." : "Give the form a title.",
        SLUG_TAKEN: nl
          ? "Deze URL is al in gebruik door een ander formulier."
          : "This URL is already used by another form.",
        INVALID_SLUG: nl
          ? "Deze URL kan niet: gebruik letters, cijfers en koppeltekens."
          : "This URL will not work: use letters, digits and hyphens.",
        NO_FIELDS_TO_PUBLISH: nl
          ? "Voeg eerst minstens één veld toe voor je het formulier online zet."
          : "Add at least one field before putting the form online.",
        CONSENT_TEXT_REQUIRED: nl
          ? "Schrijf de tekst bij het toestemmingsvinkje."
          : "Write the text next to the consent checkbox.",
        INVALID_CLOSESAT: nl
          ? "Het sluitmoment moet na het openingsmoment liggen."
          : "The closing time must be after the opening time.",
        INVALID_OPENSAT: nl ? "Dat openingsmoment kan niet." : "That opening time is not valid.",
        INVALID_MAXENTRIES: nl
          ? "Het maximum aantal inzendingen moet tussen 1 en 100.000 liggen."
          : "The entry limit must be between 1 and 100,000.",
        INVALID_RETENTIONDAYS: nl
          ? "De bewaartermijn moet tussen 1 en 3650 dagen liggen."
          : "The retention period must be between 1 and 3,650 days.",
        INVALID_NOTIFYEMAILS: nl
          ? "Een van de meldingsadressen klopt niet."
          : "One of the notification addresses is not valid.",
        INVALID_CALENDAREVENTID: nl
          ? "Dat evenement hoort niet bij de eigenaarspost van dit formulier."
          : "That event does not belong to this form's owning post.",
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="formId" value={values.id} />

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Het formulier" : "The form"}</legend>
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="settings-title-nl">{nl ? "Titel (NL)" : "Title (NL)"}</label>
            <input
              id="settings-title-nl"
              name="titleNl"
              defaultValue={values.titleNl}
              maxLength={200}
              required
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="settings-title-en">{nl ? "Titel (EN)" : "Title (EN)"}</label>
            <input
              id="settings-title-en"
              name="titleEn"
              defaultValue={values.titleEn ?? ""}
              maxLength={200}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="settings-slug">URL</label>
            <input
              id="settings-slug"
              name="slug"
              defaultValue={values.slug}
              pattern="[a-z0-9-]+"
              maxLength={80}
              required
            />
            <span className="ticket-admin-help">/formulieren/{values.slug}</span>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="settings-status">Status</label>
            <select id="settings-status" name="status" defaultValue={values.status}>
              <option value="DRAFT">{nl ? "Concept (niet zichtbaar)" : "Draft (not visible)"}</option>
              <option value="PUBLISHED">{nl ? "Online" : "Online"}</option>
              <option value="CLOSED">{nl ? "Gesloten" : "Closed"}</option>
              <option value="ARCHIVED">{nl ? "Gearchiveerd" : "Archived"}</option>
            </select>
          </div>
        </div>

        {showDutch ? (
          <div className="ticket-admin-field">
            <label htmlFor="settings-intro-nl">{nl ? "Introductie (NL)" : "Introduction (NL)"}</label>
            <MarkdownEditorField
              name="introNl"
              defaultValue={values.introNl}
              locale={locale}
              rows={8}
              textareaId="settings-intro-nl"
            />
          </div>
        ) : null}
        {showEnglish ? (
          <div className="ticket-admin-field">
            <label htmlFor="settings-intro-en">{nl ? "Introductie (EN)" : "Introduction (EN)"}</label>
            <MarkdownEditorField
              name="introEn"
              defaultValue={values.introEn}
              locale={locale}
              rows={8}
              textareaId="settings-intro-en"
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Talen" : "Languages"}</legend>
        <div className="ticket-admin-field">
          <label htmlFor="settings-locale-mode">
            {nl ? "In welke talen bestaat dit formulier?" : "Which languages does this form have?"}
          </label>
          <select
            id="settings-locale-mode"
            name="localeMode"
            value={localeMode}
            onChange={(event) => setLocaleMode(event.target.value)}
          >
            <option value="BOTH">{nl ? "Nederlands en Engels" : "Dutch and English"}</option>
            <option value="NL_ONLY">{nl ? "Enkel Nederlands" : "Dutch only"}</option>
            <option value="EN_ONLY">{nl ? "Enkel Engels" : "English only"}</option>
          </select>
        </div>
        {localeMode !== "BOTH" ? (
          <div className="ticket-admin-field">
            <label htmlFor="settings-unavailable">
              {localeMode === "NL_ONLY"
                ? nl
                  ? "Bericht voor Engelstalige bezoekers"
                  : "Message for English visitors"
                : nl
                  ? "Bericht voor Nederlandstalige bezoekers"
                  : "Message for Dutch visitors"}
            </label>
            <textarea
              id="settings-unavailable"
              name={localeMode === "NL_ONLY" ? "unavailableEn" : "unavailableNl"}
              defaultValue={
                (localeMode === "NL_ONLY" ? values.unavailableEn : values.unavailableNl) ?? ""
              }
              rows={2}
              maxLength={1_000}
              placeholder={
                localeMode === "NL_ONLY"
                  ? "Sorry, this form is only available in Dutch."
                  : "Sorry, dit formulier is enkel voor internationals."
              }
            />
            <span className="ticket-admin-help">
              {nl
                ? "Zonder eigen tekst staat er een standaardbericht; in geen geval een halfleeg formulier of een 404."
                : "Without your own text a default message appears; never a half-empty form or a 404."}
            </span>
          </div>
        ) : null}
        {/* Het veld van de andere taal blijft meegaan, anders wist opslaan het. */}
        {localeMode === "NL_ONLY" ? (
          <input type="hidden" name="unavailableNl" value={values.unavailableNl ?? ""} />
        ) : null}
        {localeMode === "EN_ONLY" ? (
          <input type="hidden" name="unavailableEn" value={values.unavailableEn ?? ""} />
        ) : null}
        {localeMode === "BOTH" ? (
          <>
            <input type="hidden" name="unavailableNl" value={values.unavailableNl ?? ""} />
            <input type="hidden" name="unavailableEn" value={values.unavailableEn ?? ""} />
          </>
        ) : null}
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Wie, wanneer en hoeveel" : "Who, when and how many"}</legend>
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="settings-audience">{nl ? "Wie mag invullen?" : "Who can fill it in?"}</label>
            <select id="settings-audience" name="audience" defaultValue={values.audience}>
              <option value="PUBLIC">{nl ? "Iedereen" : "Everyone"}</option>
              <option value="MEMBERS">
                {nl ? "Enkel ingelogde leden" : "Logged-in members only"}
              </option>
            </select>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="settings-max-entries">
              {nl ? "Maximum aantal inzendingen" : "Maximum number of entries"}
            </label>
            <input
              id="settings-max-entries"
              name="maxEntries"
              type="number"
              min={1}
              max={100_000}
              defaultValue={values.maxEntries ?? ""}
              placeholder={nl ? "Onbeperkt" : "Unlimited"}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="settings-opens-at">{nl ? "Opent op" : "Opens at"}</label>
            <input
              id="settings-opens-at"
              name="opensAt"
              type="datetime-local"
              defaultValue={values.opensAt}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="settings-closes-at">{nl ? "Sluit op" : "Closes at"}</label>
            <input
              id="settings-closes-at"
              name="closesAt"
              type="datetime-local"
              defaultValue={values.closesAt}
            />
            <span className="ticket-admin-help">
              {nl
                ? "Bezoekers zien op de pagina hoelang ze nog hebben."
                : "Visitors see how long they still have on the page."}
            </span>
          </div>
        </div>

        <label className="ticket-admin-check">
          <input
            type="checkbox"
            name="listed"
            defaultChecked={values.listed}
          />
          {nl ? "Toon dit formulier in het overzicht op /formulieren" : "List this form on /formulieren"}
        </label>
        <p className="form-admin-hint">
          {nl
            ? "Staat dit uit, dan blijft het formulier gewoon bereikbaar via zijn link; het staat enkel niet in de lijst. Handig voor een sollicitatie die je gericht deelt."
            : "When off the form stays reachable through its link; it is only left out of the list. Useful for an application you share on purpose."}
        </p>

        <label className="ticket-admin-check">
          <input type="checkbox" name="allowWaitlist" defaultChecked={values.allowWaitlist} />
          {nl
            ? "Blijf inzendingen aanvaarden als het vol zit (wachtlijst)"
            : "Keep accepting entries when full (waiting list)"}
        </label>
        <p className="form-admin-hint">
          {nl
            ? "Wie na het maximum indient, komt op de wachtlijst en claimt geen plaats. Je haalt zo iemand er zelf bij zodra er iets vrijkomt. Ditzelfde kan je per keuzeoptie instellen bij Velden."
            : "Anyone submitting past the limit lands on the waiting list and holds no spot. You promote them yourself when one frees up. The same setting exists per choice option under Fields."}
        </p>

        <label className="ticket-admin-check">
          <input type="checkbox" name="stepBySections" defaultChecked={values.stepBySections} />
          {nl
            ? "Toon de secties één voor één, met een vorige- en volgende-knop"
            : "Show the sections one by one, with back and next buttons"}
        </label>
        <p className="form-admin-hint">
          {nl
            ? "Nodig om te kunnen springen: naar een sectie verderop springen heeft geen betekenis wanneer alles toch al op één pagina staat. Je stelt de sprongen in bij Velden."
            : "Required for jumping: jumping to a later section means nothing when everything is on one page already. You set the jumps under Fields."}
        </p>

        <label className="ticket-admin-check">
          <input
            type="checkbox"
            name="allowMultipleSubmissions"
            defaultChecked={values.allowMultipleSubmissions}
          />
          {nl ? "Iemand mag meerdere keren indienen" : "Someone may submit more than once"}
        </label>
        <label className="ticket-admin-check">
          <input
            type="checkbox"
            name="allowEditAfterSubmit"
            defaultChecked={values.allowEditAfterSubmit}
          />
          {nl ? "Ingelogde leden mogen hun inzending nadien bewerken" : "Logged-in members may edit their entry afterwards"}
        </label>
        <label className="ticket-admin-check">
          <input type="checkbox" name="allowDrafts" defaultChecked={values.allowDrafts} />
          {nl
            ? "Ingelogde leden mogen een concept bewaren en later verdergaan"
            : "Logged-in members may save a draft and continue later"}
        </label>
        <p className="form-admin-hint">
          {nl
            ? "Bewerken en concepten gelden enkel voor wie ingelogd is: een anonieme inzending heeft geen eigenaar om ze aan terug te geven."
            : "Editing and drafts only apply to logged-in visitors: an anonymous entry has no owner to hand it back to."}
        </p>
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Na het indienen" : "After submitting"}</legend>
        {showDutch ? (
          <div className="ticket-admin-field">
            <label htmlFor="settings-thankyou-nl">{nl ? "Bedanktekst (NL)" : "Thank-you text (NL)"}</label>
            <textarea
              id="settings-thankyou-nl"
              name="thankYouNl"
              defaultValue={values.thankYouNl ?? ""}
              rows={3}
              maxLength={5_000}
              placeholder={nl ? "Bedankt, we hebben je inzending goed ontvangen." : ""}
            />
          </div>
        ) : (
          <input type="hidden" name="thankYouNl" value={values.thankYouNl ?? ""} />
        )}
        {showEnglish ? (
          <div className="ticket-admin-field">
            <label htmlFor="settings-thankyou-en">{nl ? "Bedanktekst (EN)" : "Thank-you text (EN)"}</label>
            <textarea
              id="settings-thankyou-en"
              name="thankYouEn"
              defaultValue={values.thankYouEn ?? ""}
              rows={3}
              maxLength={5_000}
            />
          </div>
        ) : (
          <input type="hidden" name="thankYouEn" value={values.thankYouEn ?? ""} />
        )}

        <label className="ticket-admin-check">
          <input
            type="checkbox"
            name="confirmationEnabled"
            checked={confirmationEnabled}
            onChange={(event) => setConfirmationEnabled(event.target.checked)}
          />
          {nl ? "Stuur een bevestigingsmail naar de inzender" : "Send a confirmation mail to the submitter"}
        </label>

        {confirmationEnabled ? (
          <div className="ticket-admin-form-grid">
            {showDutch ? (
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="settings-confirm-subject-nl">
                  {nl ? "Onderwerp (NL)" : "Subject (NL)"}
                </label>
                <input
                  id="settings-confirm-subject-nl"
                  name="confirmationSubjectNl"
                  defaultValue={values.confirmationSubjectNl ?? ""}
                  maxLength={200}
                />
              </div>
            ) : (
              <input
                type="hidden"
                name="confirmationSubjectNl"
                value={values.confirmationSubjectNl ?? ""}
              />
            )}
            {showEnglish ? (
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="settings-confirm-subject-en">
                  {nl ? "Onderwerp (EN)" : "Subject (EN)"}
                </label>
                <input
                  id="settings-confirm-subject-en"
                  name="confirmationSubjectEn"
                  defaultValue={values.confirmationSubjectEn ?? ""}
                  maxLength={200}
                />
              </div>
            ) : (
              <input
                type="hidden"
                name="confirmationSubjectEn"
                value={values.confirmationSubjectEn ?? ""}
              />
            )}
            {showDutch ? (
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="settings-confirm-body-nl">{nl ? "Bericht (NL)" : "Message (NL)"}</label>
                <textarea
                  id="settings-confirm-body-nl"
                  name="confirmationBodyNl"
                  defaultValue={values.confirmationBodyNl ?? ""}
                  rows={4}
                  maxLength={10_000}
                />
              </div>
            ) : (
              <input
                type="hidden"
                name="confirmationBodyNl"
                value={values.confirmationBodyNl ?? ""}
              />
            )}
            {showEnglish ? (
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="settings-confirm-body-en">{nl ? "Bericht (EN)" : "Message (EN)"}</label>
                <textarea
                  id="settings-confirm-body-en"
                  name="confirmationBodyEn"
                  defaultValue={values.confirmationBodyEn ?? ""}
                  rows={4}
                  maxLength={10_000}
                />
              </div>
            ) : (
              <input
                type="hidden"
                name="confirmationBodyEn"
                value={values.confirmationBodyEn ?? ""}
              />
            )}
            <div className="ticket-admin-field" data-span="2">
              <label className="ticket-admin-check">
                <input
                  type="checkbox"
                  name="confirmationIncludeAnswers"
                  defaultChecked={values.confirmationIncludeAnswers}
                />
                {nl
                  ? "Zet een kopie van de eigen antwoorden in de mail"
                  : "Include a copy of the submitted answers"}
              </label>
              {values.hasCalendarEvent ? (
                <label className="ticket-admin-check">
                  <input
                    type="checkbox"
                    name="confirmationIncludeIcs"
                    defaultChecked={values.confirmationIncludeIcs}
                  />
                  {nl
                    ? "Steek het agenda-item van het gekoppelde evenement bij de mail"
                    : "Attach the calendar item of the linked event"}
                </label>
              ) : (
                <input
                  type="hidden"
                  name="confirmationIncludeIcs"
                  value={values.confirmationIncludeIcs ? "true" : ""}
                />
              )}
            </div>
          </div>
        ) : (
          // De mail staat uit, maar de tekst die er ooit in stond mag niet
          // verdwijnen: wie de mail morgen weer aanzet, wil ze terugvinden.
          <>
            <input
              type="hidden"
              name="confirmationSubjectNl"
              value={values.confirmationSubjectNl ?? ""}
            />
            <input
              type="hidden"
              name="confirmationSubjectEn"
              value={values.confirmationSubjectEn ?? ""}
            />
            <input
              type="hidden"
              name="confirmationBodyNl"
              value={values.confirmationBodyNl ?? ""}
            />
            <input
              type="hidden"
              name="confirmationBodyEn"
              value={values.confirmationBodyEn ?? ""}
            />
            <input
              type="hidden"
              name="confirmationIncludeAnswers"
              value={values.confirmationIncludeAnswers ? "true" : ""}
            />
            <input
              type="hidden"
              name="confirmationIncludeIcs"
              value={values.confirmationIncludeIcs ? "true" : ""}
            />
          </>
        )}
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Meldingen aan de organisatoren" : "Notifications to the organisers"}</legend>
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="settings-notify-mode">{nl ? "Wanneer melden?" : "When to notify?"}</label>
            <select
              id="settings-notify-mode"
              name="notifyMode"
              value={notifyMode}
              onChange={(event) => setNotifyMode(event.target.value)}
            >
              <option value="NONE">{nl ? "Nooit" : "Never"}</option>
              <option value="EACH">{nl ? "Bij elke inzending" : "On every entry"}</option>
              <option value="DAILY">{nl ? "Eén samenvatting per dag" : "One daily summary"}</option>
            </select>
          </div>
          {notifyMode !== "NONE" ? (
            <div className="ticket-admin-field" data-span="2">
              <label htmlFor="settings-notify-emails">
                {nl ? "Naar welke adressen?" : "To which addresses?"}
              </label>
              <textarea
                id="settings-notify-emails"
                name="notifyEmails"
                defaultValue={values.notifyEmails.join("\n")}
                rows={3}
                placeholder="cursusdienst@vtk.be"
              />
              <span className="ticket-admin-help">
                {nl ? "Eén adres per regel." : "One address per line."}
              </span>
            </div>
          ) : (
            <input type="hidden" name="notifyEmails" value={values.notifyEmails.join("\n")} />
          )}
        </div>
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Privacy" : "Privacy"}</legend>
        <label className="ticket-admin-check">
          <input
            type="checkbox"
            name="requireConsent"
            checked={requireConsent}
            onChange={(event) => setRequireConsent(event.target.checked)}
          />
          {nl
            ? "Vraag een expliciet vinkje voor toestemming"
            : "Ask for an explicit consent checkbox"}
        </label>
        {requireConsent ? (
          <div className="ticket-admin-form-grid">
            {showDutch ? (
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="settings-consent-nl">{nl ? "Tekst (NL)" : "Text (NL)"}</label>
                <textarea
                  id="settings-consent-nl"
                  name="consentTextNl"
                  defaultValue={values.consentTextNl ?? ""}
                  rows={2}
                  maxLength={1_000}
                  placeholder={
                    nl
                      ? "Ik ga ermee akkoord dat VTK deze gegevens gebruikt om mijn inschrijving te verwerken."
                      : ""
                  }
                />
              </div>
            ) : (
              <input type="hidden" name="consentTextNl" value={values.consentTextNl ?? ""} />
            )}
            {showEnglish ? (
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="settings-consent-en">{nl ? "Tekst (EN)" : "Text (EN)"}</label>
                <textarea
                  id="settings-consent-en"
                  name="consentTextEn"
                  defaultValue={values.consentTextEn ?? ""}
                  rows={2}
                  maxLength={1_000}
                />
              </div>
            ) : (
              <input type="hidden" name="consentTextEn" value={values.consentTextEn ?? ""} />
            )}
          </div>
        ) : (
          <>
            <input type="hidden" name="consentTextNl" value={values.consentTextNl ?? ""} />
            <input type="hidden" name="consentTextEn" value={values.consentTextEn ?? ""} />
          </>
        )}

        <div className="ticket-admin-field">
          <label htmlFor="settings-retention">
            {nl ? "Bewaartermijn inzendingen (dagen)" : "Entry retention (days)"}
          </label>
          <input
            id="settings-retention"
            name="retentionDays"
            type="number"
            min={1}
            max={3_650}
            defaultValue={values.retentionDays ?? ""}
            placeholder={nl ? "Niet automatisch verwijderen" : "Do not delete automatically"}
          />
          <span className="ticket-admin-help">
            {nl
              ? "Na dit aantal dagen verdwijnen de inzendingen en hun bestanden vanzelf. Leeg laten betekent bewaren tot iemand ze zelf verwijdert."
              : "After this many days entries and their files disappear by themselves. Leave empty to keep them until someone deletes them."}
          </span>
        </div>
      </fieldset>

      {calendarEvents.length > 0 || values.calendarEventId ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Kalenderevenement" : "Calendar event"}</legend>
          <div className="ticket-admin-field">
            <label htmlFor="settings-calendar-event">
              {nl ? "Hangt aan dit evenement" : "Attached to this event"}
            </label>
            <select
              id="settings-calendar-event"
              name="calendarEventId"
              defaultValue={values.calendarEventId ?? ""}
            >
              <option value="">{nl ? "Geen evenement" : "No event"}</option>
              {calendarEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="calendarEventId" value={values.calendarEventId ?? ""} />
      )}
    </SaveForm>
  );
}
