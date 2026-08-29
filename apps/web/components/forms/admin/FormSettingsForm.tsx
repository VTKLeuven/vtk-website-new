"use client";

import { useState, type ReactNode } from "react";
import { saveFormSettingsAction } from "@/app/actions/forms";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { AutoSaveForm } from "@/components/ui/AutoSaveForm";
import { ExclusiveChoiceGroup } from "@/components/ui/ExclusiveChoiceGroup";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import type { AdminLocale } from "./format";

export type FormSettingsValues = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  introNl: string | null;
  introEn: string | null;
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
  pageId: string | null;
  /** Waar het paneel op de pagina komt, om de markering te kunnen uitleggen. */
  pageHasMarker: boolean;
};

type CalendarOption = { id: string; label: string };
type PageOption = { id: string; label: string };

export function FormSettingsForm({
  locale,
  values,
  calendarEvents,
  pages,
}: {
  locale: AdminLocale;
  values: FormSettingsValues;
  calendarEvents: CalendarOption[];
  pages: PageOption[];
}) {
  const nl = locale === "nl";
  const [localeMode, setLocaleMode] = useState(values.localeMode);
  const [confirmationEnabled, setConfirmationEnabled] = useState(values.confirmationEnabled);
  const [requireConsent, setRequireConsent] = useState(values.requireConsent);
  const [notifyMode, setNotifyMode] = useState(values.notifyMode);
  const [pageId, setPageId] = useState(values.pageId ?? "");

  const showEnglish = localeMode !== "NL_ONLY";
  const showDutch = localeMode !== "EN_ONLY";

  return (
    <AutoSaveForm
      action={saveFormSettingsAction}
      className="ticket-admin-form"
      savedMessage={nl ? "Alle wijzigingen opgeslagen" : "All changes saved"}
      dirtyMessage={nl ? "Wijzigingen worden zo opgeslagen" : "Changes will be saved shortly"}
      savingMessage={nl ? "Wijzigingen opslaan..." : "Saving changes..."}
      invalidMessage={
        nl ? "Vul de gemarkeerde velden aan om op te slaan" : "Complete the marked fields to save"
      }
      retryLabel={nl ? "Opnieuw proberen" : "Try again"}
      fallbackErrorMessage={nl ? "Opslaan is niet gelukt." : "Saving failed."}
      errorMessages={{
        TITLE_REQUIRED: nl ? "Geef de form een titel." : "Give the form a title.",
        SLUG_TAKEN: nl
          ? "Deze URL is al in gebruik door een andere form."
          : "This URL is already used by another form.",
        INVALID_SLUG: nl
          ? "Deze URL kan niet: gebruik letters, cijfers en koppeltekens."
          : "This URL will not work: use letters, digits and hyphens.",
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
          ? "Dat evenement hoort niet bij de eigenaarspost van deze form."
          : "That event does not belong to this form's owning post.",
        INVALID_PAGEID: nl ? "Die pagina bestaat niet meer." : "That page no longer exists.",
        PAGE_FORBIDDEN: nl
          ? "Je mag die pagina niet bewerken, dus je kan er ook geen form op zetten."
          : "You cannot edit that page, so you cannot put a form on it either.",
        PAGE_TAKEN: nl
          ? "Op die pagina staat al een andere form."
          : "That page already carries another form.",
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="formId" value={values.id} />

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "De form" : "The form"}</legend>
        <div className="form-admin-language-grid">
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
        </div>
        <div className="ticket-admin-form-grid form-admin-align-fields">
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
        </div>

        <div className="form-admin-language-grid">
          {showDutch ? (
            <div className="ticket-admin-field">
              <label htmlFor="settings-intro-nl">
                {nl ? "Introductie (NL)" : "Introduction (NL)"}
              </label>
              <MarkdownEditorField
                name="introNl"
                defaultValue={values.introNl}
                locale={locale}
                rows={7}
                textareaId="settings-intro-nl"
              />
            </div>
          ) : (
            <input type="hidden" name="introNl" value={values.introNl ?? ""} />
          )}
          {showEnglish ? (
            <div className="ticket-admin-field">
              <label htmlFor="settings-intro-en">
                {nl ? "Introductie (EN)" : "Introduction (EN)"}
              </label>
              <MarkdownEditorField
                name="introEn"
                defaultValue={values.introEn}
                locale={locale}
                rows={7}
                textareaId="settings-intro-en"
              />
            </div>
          ) : (
            <input type="hidden" name="introEn" value={values.introEn ?? ""} />
          )}
        </div>
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Talen" : "Languages"}</legend>
        <ExclusiveChoiceGroup
          name="localeMode"
          value={localeMode}
          onChange={setLocaleMode}
          ariaLabel={nl ? "Talen van de form" : "Form languages"}
          options={[
            {
              value: "BOTH",
              label: nl ? "Nederlands en Engels" : "Dutch and English",
              description: nl ? "Beide versies zijn beschikbaar." : "Both versions are available.",
            },
            {
              value: "NL_ONLY",
              label: nl ? "Enkel Nederlands" : "Dutch only",
              description: nl
                ? "Engelstaligen krijgen een melding."
                : "English visitors see a notice.",
            },
            {
              value: "EN_ONLY",
              label: nl ? "Enkel Engels" : "English only",
              description: nl
                ? "Nederlandstaligen krijgen een melding."
                : "Dutch visitors see a notice.",
            },
          ]}
        />
        {localeMode !== "BOTH" ? (
          <div className="ticket-admin-field">
            <label htmlFor="settings-unavailable">
              {localeMode === "NL_ONLY"
                ? nl
                  ? "Melding voor Engelstalige bezoekers"
                  : "Message for English visitors"
                : nl
                  ? "Melding voor Nederlandstalige bezoekers"
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
                  : "Sorry, deze form is enkel voor internationals."
              }
            />
            <span className="ticket-admin-help">
              {nl
                ? "Zonder eigen tekst verschijnt een standaardmelding."
                : "Without your own text a default message appears."}
            </span>
          </div>
        ) : null}
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
        <div className="ticket-admin-form-grid form-admin-align-fields">
          <div className="ticket-admin-field">
            <label htmlFor="settings-audience">
              {nl ? "Wie mag invullen?" : "Who can fill it in?"}
            </label>
            <ThemedSelect
              id="settings-audience"
              name="audience"
              defaultValue={values.audience}
              options={[
                { value: "PUBLIC", label: nl ? "Iedereen" : "Everyone" },
                {
                  value: "MEMBERS",
                  label: nl ? "Enkel ingelogde leden" : "Logged-in members only",
                },
              ]}
            />
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

        <div className="form-admin-toggle-grid">
          <SettingToggle
            name="listed"
            defaultChecked={values.listed}
            title={nl ? "Zichtbaar in het overzicht" : "Visible in the overview"}
            description={
              nl
                ? "Uitgeschakeld blijft de form bereikbaar via de rechtstreekse link."
                : "When off, the form remains reachable through its direct link."
            }
          />
          <SettingToggle
            name="allowWaitlist"
            defaultChecked={values.allowWaitlist}
            title={nl ? "Wachtlijst bij een volle form" : "Waiting list when full"}
            description={
              nl
                ? "Extra inzendingen claimen geen plaats en worden handmatig toegelaten."
                : "Extra entries hold no spot and are promoted manually."
            }
          />
          <SettingToggle
            name="stepBySections"
            defaultChecked={values.stepBySections}
            title={nl ? "Secties stap voor stap tonen" : "Show sections step by step"}
            description={
              nl
                ? "Nodig voor sprongen en toont vorige- en volgende-knoppen."
                : "Required for branching and shows back and next buttons."
            }
          />
          <SettingToggle
            name="allowMultipleSubmissions"
            defaultChecked={values.allowMultipleSubmissions}
            title={nl ? "Meerdere keren indienen" : "Allow multiple submissions"}
            description={
              nl
                ? "Dezelfde persoon mag meer dan één inzending versturen."
                : "The same person may send more than one entry."
            }
          />
          <SettingToggle
            name="allowEditAfterSubmit"
            defaultChecked={values.allowEditAfterSubmit}
            title={nl ? "Inzending nadien bewerken" : "Edit an entry afterwards"}
            description={
              nl
                ? "Enkel beschikbaar voor ingelogde leden."
                : "Available to logged-in members only."
            }
          />
          <SettingToggle
            name="allowDrafts"
            defaultChecked={values.allowDrafts}
            title={nl ? "Concept bewaren" : "Save a draft"}
            description={
              nl
                ? "Ingelogde leden kunnen later verdergaan."
                : "Logged-in members can continue later."
            }
          />
        </div>
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Na het indienen" : "After submitting"}</legend>
        <div className="form-admin-language-grid">
          {showDutch ? (
            <div className="ticket-admin-field">
              <label htmlFor="settings-thankyou-nl">
                {nl ? "Bedanktekst (NL)" : "Thank-you text (NL)"}
              </label>
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
              <label htmlFor="settings-thankyou-en">
                {nl ? "Bedanktekst (EN)" : "Thank-you text (EN)"}
              </label>
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
        </div>

        <SettingToggle
          name="confirmationEnabled"
          checked={confirmationEnabled}
          onChange={setConfirmationEnabled}
          title={nl ? "Bevestigingsmail versturen" : "Send a confirmation email"}
          description={
            nl
              ? "De inzender krijgt na verzending een mail op het opgegeven adres."
              : "The submitter receives an email after submitting."
          }
        />

        {confirmationEnabled ? (
          <div className="ticket-admin-form form-admin-nested-settings">
            <div className="form-admin-language-grid">
              {showDutch ? (
                <div className="ticket-admin-field">
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
                <div className="ticket-admin-field">
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
            </div>
            <div className="form-admin-language-grid">
              {showDutch ? (
                <div className="ticket-admin-field">
                  <label htmlFor="settings-confirm-body-nl">
                    {nl ? "Bericht (NL)" : "Message (NL)"}
                  </label>
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
                <div className="ticket-admin-field">
                  <label htmlFor="settings-confirm-body-en">
                    {nl ? "Bericht (EN)" : "Message (EN)"}
                  </label>
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
            </div>
            <div className="form-admin-toggle-grid">
              <SettingToggle
                name="confirmationIncludeAnswers"
                defaultChecked={values.confirmationIncludeAnswers}
                title={nl ? "Antwoorden meesturen" : "Include answers"}
                description={nl ? "Zet een kopie in de mail." : "Adds a copy to the email."}
              />
              {values.hasCalendarEvent ? (
                <SettingToggle
                  name="confirmationIncludeIcs"
                  defaultChecked={values.confirmationIncludeIcs}
                  title={nl ? "Agenda-item meesturen" : "Include calendar item"}
                  description={
                    nl ? "Voegt het gekoppelde evenement toe." : "Adds the linked event."
                  }
                />
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
        <ExclusiveChoiceGroup
          name="notifyMode"
          value={notifyMode}
          onChange={setNotifyMode}
          ariaLabel={nl ? "Moment van meldingen" : "Notification timing"}
          options={[
            {
              value: "NONE",
              label: nl ? "Geen meldingen" : "No notifications",
              description: nl ? "Bekijk inzendingen in de admin." : "Review entries in the admin.",
            },
            {
              value: "EACH",
              label: nl ? "Bij elke inzending" : "On every entry",
              description: nl ? "Meteen een e-mail per inzending." : "An email for every entry.",
            },
            {
              value: "DAILY",
              label: nl ? "Dagelijkse samenvatting" : "Daily summary",
              description: nl ? "Eén overzicht per dag." : "One overview each day.",
            },
          ]}
        />
        {notifyMode !== "NONE" ? (
          <div className="ticket-admin-field">
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
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Privacy" : "Privacy"}</legend>
        <p className="form-admin-hint">
          {nl
            ? "Vraag je gevoelige gegevens (gezondheid, allergieën, foto's, gegevens die je doorgeeft aan een bedrijf), dan moet de invuller daar expliciet mee akkoord gaan. Voor een gewone inschrijving met naam en e-mailadres is dat niet nodig."
            : "If you ask for sensitive data (health, allergies, photos, data you pass on to a company), the person filling it in must explicitly agree. A plain sign-up with a name and an e-mail address does not need this."}
        </p>
        <SettingToggle
          name="requireConsent"
          checked={requireConsent}
          onChange={setRequireConsent}
          title={
            nl
              ? "Akkoord vragen met wat er met deze gegevens gebeurt"
              : "Ask for consent on what happens with this data"
          }
          description={
            nl
              ? "Onderaan de form komt een verplicht vinkje met een tekst die je zelf schrijft. Zonder dat vinkje kan de bezoeker niet verzenden."
              : "A required checkbox with a text you write yourself appears at the bottom of the form. Without ticking it, the visitor cannot submit."
          }
        />
        {requireConsent ? (
          <div className="form-admin-language-grid">
            {showDutch ? (
              <div className="ticket-admin-field">
                <label htmlFor="settings-consent-nl">
                  {nl ? "Tekst naast het vinkje (NL)" : "Text next to the checkbox (NL)"}
                </label>
                <textarea
                  id="settings-consent-nl"
                  name="consentTextNl"
                  defaultValue={values.consentTextNl ?? ""}
                  rows={3}
                  maxLength={1_000}
                  placeholder={
                    nl
                      ? "Ik ga ermee akkoord dat VTK deze gegevens gebruikt om mijn inschrijving te verwerken."
                      : ""
                  }
                />
                <span className="ticket-admin-help">
                  {nl
                    ? "Zeg wat je met de gegevens doet en wie ze te zien krijgt, niet enkel dat de bezoeker akkoord gaat."
                    : "Say what you do with the data and who gets to see it, not only that the visitor agrees."}
                </span>
              </div>
            ) : (
              <input type="hidden" name="consentTextNl" value={values.consentTextNl ?? ""} />
            )}
            {showEnglish ? (
              <div className="ticket-admin-field">
                <label htmlFor="settings-consent-en">
                  {nl ? "Tekst naast het vinkje (EN)" : "Text next to the checkbox (EN)"}
                </label>
                <textarea
                  id="settings-consent-en"
                  name="consentTextEn"
                  defaultValue={values.consentTextEn ?? ""}
                  rows={3}
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

        <div className="ticket-admin-field form-admin-short-field">
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
              ? "Leeg betekent bewaren tot iemand de inzendingen zelf verwijdert."
              : "Empty means keeping entries until someone removes them manually."}
          </span>
        </div>
      </fieldset>

      {pages.length > 0 || values.pageId ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Op een pagina" : "On a page"}</legend>
          <div className="ticket-admin-field">
            <label htmlFor="settings-page">
              {nl ? "Staat op deze pagina" : "Shown on this page"}
            </label>
            <ThemedSelect
              id="settings-page"
              name="pageId"
              value={pageId}
              onChange={setPageId}
              options={[
                { value: "", label: nl ? "Geen pagina" : "No page" },
                ...pages.map((page) => ({ value: page.id, label: page.label })),
              ]}
            />
            <span className="ticket-admin-help">
              {pageId
                ? nl
                  ? values.pageHasMarker
                    ? "De form staat op de plaats van de markering [[formulier]] in de tekst van die pagina."
                    : "De form komt onderaan die pagina. Zet [[formulier]] op een eigen regel in de tekst om ze ergens anders te laten verschijnen."
                  : values.pageHasMarker
                    ? "The form sits where the [[formulier]] marker is in that page's text."
                    : "The form goes to the bottom of that page. Put [[formulier]] on its own line in the text to place it somewhere else."
                : nl
                  ? "Je kan enkel pagina's kiezen die je zelf mag bewerken. De form houdt hoe dan ook haar eigen adres."
                  : "You can only pick pages you may edit yourself. The form keeps its own address either way."}
            </span>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="pageId" value={values.pageId ?? ""} />
      )}

      {calendarEvents.length > 0 || values.calendarEventId ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Kalenderevenement" : "Calendar event"}</legend>
          <div className="ticket-admin-field">
            <label htmlFor="settings-calendar-event">
              {nl ? "Hangt aan dit evenement" : "Attached to this event"}
            </label>
            <ThemedSelect
              id="settings-calendar-event"
              name="calendarEventId"
              defaultValue={values.calendarEventId ?? ""}
              options={[
                { value: "", label: nl ? "Geen evenement" : "No event" },
                ...calendarEvents.map((event) => ({ value: event.id, label: event.label })),
              ]}
            />
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="calendarEventId" value={values.calendarEventId ?? ""} />
      )}
    </AutoSaveForm>
  );
}

function SettingToggle({
  name,
  title,
  description,
  defaultChecked,
  checked,
  onChange,
}: {
  name: string;
  title: ReactNode;
  description: ReactNode;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const controlled = checked !== undefined;
  return (
    <label className="form-admin-toggle">
      <input
        type="checkbox"
        name={name}
        {...(controlled
          ? { checked, onChange: (event) => onChange?.(event.target.checked) }
          : { defaultChecked })}
      />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}
