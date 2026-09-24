"use client";

import Link from "@/components/ui/Link";
import {
  submitTicketEventFormAction,
  type TicketEventFormActionState,
} from "@/app/actions/tickets";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Info,
  LoaderCircle,
  Plus,
  Save,
  Ticket,
} from "lucide-react";
import { useActionState, useState } from "react";
import { toDatetimeLocal, type AdminLocale } from "./format";
import { AddressPicker } from "./AddressPicker";
import { PresaleFields, type PresaleGroupOption } from "./PresaleFields";
import { SettingsPanel } from "./SettingsPanel";
import { TicketTemplateTypeRows } from "./TicketTemplateTypeRows";
import type { TicketEventTemplate } from "@/lib/ticketing/templates";
import { TICKET_DESCRIPTION_MAX_LENGTH } from "@/lib/ticketing/description";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";

const initialState: TicketEventFormActionState = { status: "idle" };

const formErrorMessages: Record<string, { nl: string; en: string }> = {
  GROUP_REQUIRED: { nl: "Kies een verantwoordelijke groep.", en: "Choose a responsible group." },
  FORBIDDEN: { nl: "Je hebt geen toegang om dit ticketevent te wijzigen.", en: "You cannot change this ticket event." },
  INVALID_CALENDAR_EVENT: { nl: "Het gekozen kalenderevent hoort niet bij deze groep.", en: "The selected calendar event does not belong to this group." },
  TITLE_REQUIRED: { nl: "Vul een Nederlandse titel in.", en: "Enter a Dutch title." },
  INVALID_EVENT_DATES: { nl: "De eindtijd moet na de starttijd liggen.", en: "The end time must be after the start time." },
  INVALID_SALES_DATES: { nl: "Het einde van de verkoop moet na de start liggen.", en: "Sales must end after they start." },
  PRESALE_NEEDS_SALES_START: { nl: "Vul een start verkoop in: de voorverkoop is een duur daarvoor.", en: "Set a sales start: the presale is a duration before it." },
  PRESALE_NEEDS_AUDIENCE: { nl: "Kies wie er in de voorverkoop mag: het praesidium of minstens één groep.", en: "Choose who may buy during the presale: the praesidium or at least one group." },
  INVALID_PRESALELEADVALUE: { nl: "De voorverkoop moet een geheel aantal uren of dagen zijn, hoogstens een jaar.", en: "The presale must be a whole number of hours or days, at most a year." },
  INVALID_SLUG: { nl: "Vul een geldige URL-naam in.", en: "Enter a valid URL slug." },
  SLUG_ALREADY_EXISTS: { nl: "Deze URL-naam is al in gebruik.", en: "This URL slug is already in use." },
  TICKET_TYPE_REQUIRED_TO_PUBLISH: { nl: "Voeg een actief tickettype toe voordat je publiceert.", en: "Add an active ticket type before publishing." },
};

function formErrorMessage(code: string | undefined, locale: AdminLocale): string {
  if (code && formErrorMessages[code]) return formErrorMessages[code][locale];
  return locale === "nl"
    ? "Controleer de ingevulde gegevens en probeer opnieuw."
    : "Check the entered information and try again.";
}

type TicketEventFormValue = {
  id?: string;
  calendarEventId?: string | null;
  ownerGroupId?: string;
  slug?: string;
  titleNl?: string;
  titleEn?: string | null;
  descriptionNl?: string | null;
  descriptionEn?: string | null;
  location?: string | null;
  locationAddress?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  startsAt?: Date;
  endsAt?: Date;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
  presaleLeadMinutes?: number | null;
  presalePraesidium?: boolean;
  presaleHelpers?: boolean;
  presaleGroupIds?: readonly string[];
  status?: string;
  maxTicketsPerOrder?: number;
  cardCheckIn?: boolean;
  contactEmail?: string | null;
  confirmationMessageNl?: string | null;
  confirmationMessageEn?: string | null;
};

/** Korte datum voor de statusregel in een dichte kop; leeg wordt een streepje. */
function formatShortDate(value: Date | null | undefined, locale: AdminLocale): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

/** "2880" wordt "2 dagen": hele dagen als dat opgaat, anders uren. */
function describeLead(minutes: number, locale: AdminLocale): string {
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return `${days} ${locale === "nl" ? (days === 1 ? "dag" : "dagen") : days === 1 ? "day" : "days"}`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} ${locale === "nl" ? "uur" : hours === 1 ? "hour" : "hours"}`;
}

type GroupOption = { id: string; nameNl: string; nameEn: string };
type CalendarOption = {
  id: string;
  titleNl: string;
  titleEn: string | null;
  start: Date;
};

/** Het gekoppelde kalenderevent waar dit ticketevent zijn gegevens van erft. */
export type LinkedCalendarEvent = {
  id: string;
  titleNl: string;
  titleEn: string | null;
  location: string | null;
  start: Date;
  end: Date;
};

/**
 * Toont wat het ticketevent overneemt van zijn kalenderevent, in plaats van
 * dezelfde velden een tweede keer te laten intikken. Eén bron van waarheid: pas
 * je de datum aan in de kalender, dan verschuift de ticketverkoop mee, en kan
 * /tickets nooit een andere datum tonen dan /kalender.
 */
function InheritedFromCalendar({
  event,
  locale,
}: {
  event: LinkedCalendarEvent;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const fmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="ticket-admin-inherited">
      <div className="ticket-admin-inherited-head">
        <strong>{nl ? "Overgenomen van het kalenderevent" : "Inherited from the calendar event"}</strong>
        <Link href={`${base}/admin/kalender/${event.id}`}>
          {nl ? "Aanpassen in de kalender" : "Edit in the calendar"}
        </Link>
      </div>
      <dl className="ticket-admin-inherited-list">
        <div>
          <dt>{nl ? "Titel" : "Title"}</dt>
          <dd>{nl ? event.titleNl : (event.titleEn ?? event.titleNl)}</dd>
        </div>
        <div>
          <dt>{nl ? "Wanneer" : "When"}</dt>
          <dd>
            {fmt.format(event.start)} – {fmt.format(event.end)}
          </dd>
        </div>
        <div>
          <dt>{nl ? "Locatie" : "Location"}</dt>
          <dd>{event.location || (nl ? "Nog te bevestigen" : "To be confirmed")}</dd>
        </div>
      </dl>
    </div>
  );
}

export function TicketEventForm({
  event = {},
  groups,
  presaleGroups = [],
  calendarEvents,
  hasActiveTicketType = false,
  template = null,
  linkedCalendarEvent,
  locale,
}: {
  event?: TicketEventFormValue;
  groups: GroupOption[];
  /** De groepen die naast het praesidium in de voorverkoop kunnen; leeg bij aanmaken. */
  presaleGroups?: PresaleGroupOption[];
  calendarEvents: CalendarOption[];
  hasActiveTicketType?: boolean;
  /**
   * Het sjabloon waaruit dit event ontstaat; enkel bij aanmaken. De velden zijn
   * dan voorgevuld en het paneel "Eerste ticket" toont de tickets van het
   * sjabloon, elk nog aanpasbaar.
   */
  template?: TicketEventTemplate | null;
  /**
   * Gezet wanneer dit ticketevent aan een kalenderevent hangt. Titel,
   * beschrijving, locatie en datums worden dan niet gevraagd maar overgenomen.
   */
  linkedCalendarEvent?: LinkedCalendarEvent | null;
  locale: AdminLocale;
}) {
  const isEdit = Boolean(event.id);
  // Gecontroleerd, omdat de voorverkoop eronder de uitkomst toont: "48 uur
  // eerder" zegt pas iets samen met de datum waar het van afgetrokken wordt.
  const [salesStart, setSalesStart] = useState(toDatetimeLocal(event.salesStartAt));
  const [state, formAction, pending] = useActionState(
    submitTicketEventFormAction,
    initialState
  );

  /**
   * Een verplicht veld in een dichtgeklapt venster blokkeert het opslaan zonder
   * dat de gebruiker iets ziet: de browser weigert te versturen omdat ze een
   * ongeldig veld niet in beeld kan brengen. Daarom het venster eromheen openen
   * voor de melding verschijnt. In de capture-fase, want `invalid` bubbelt niet.
   */
  function revealInvalidField(event_: React.InvalidEvent<HTMLFormElement>) {
    const field = event_.target as HTMLElement | null;
    const panel = field?.closest("details");
    if (panel && !panel.open) panel.open = true;
  }

  const nl = locale === "nl";
  const basicsStatus = [event.titleNl, event.slug ? `/${event.slug}` : null]
    .filter(Boolean)
    .join(" · ");
  const salesStatus = event.salesStartAt || event.salesEndAt
    ? `${nl ? "Verkoop" : "Sales"} ${formatShortDate(event.salesStartAt, locale)} – ${formatShortDate(event.salesEndAt, locale)}`
    : nl
      ? "Geen verkoopvenster ingesteld"
      : "No sales window set";
  const presaleStatus = event.presaleLeadMinutes
    ? ` · ${nl ? "voorverkoop" : "presale"} ${describeLead(event.presaleLeadMinutes, locale)}`
    : "";

  return (
    <form action={formAction} className="ticket-admin-form" onInvalidCapture={revealInvalidField}>
      <input type="hidden" name="locale" value={locale} />
      {event.id ? <input type="hidden" name="eventId" value={event.id} /> : null}
      {template && !isEdit ? <input type="hidden" name="templateSlug" value={template.slug} /> : null}

      <SettingsPanel
        title={locale === "nl" ? "Basisinformatie" : "Basic information"}
        status={isEdit ? basicsStatus : undefined}
        icon={<Info aria-hidden="true" size={17} />}
        defaultOpen
      >
        <p className="ticket-admin-help">
          {locale === "nl"
            ? "De informatie die kopers in de ticketshop zien."
            : "The information buyers see in the ticket shop."}
        </p>
        {linkedCalendarEvent ? (
          <InheritedFromCalendar event={linkedCalendarEvent} locale={locale} />
        ) : null}
        <div className="ticket-admin-form-grid">
          {linkedCalendarEvent ? null : (
            <>
              <div className="ticket-admin-field">
                <label htmlFor="ticket-title-nl">Titel (NL)</label>
                <input id="ticket-title-nl" name="titleNl" defaultValue={event.titleNl ?? ""} required />
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="ticket-title-en">Titel (EN)</label>
                <input id="ticket-title-en" name="titleEn" defaultValue={event.titleEn ?? ""} />
              </div>
            </>
          )}
          <div className="ticket-admin-field">
            <label htmlFor="ticket-slug">URL-naam</label>
            <input
              id="ticket-slug"
              name="slug"
              defaultValue={event.slug ?? ""}
              placeholder="galabal-2027"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
            <span className="ticket-admin-help">
              {locale === "nl" ? "Kleine letters, cijfers en koppeltekens." : "Lowercase letters, numbers and hyphens."}
            </span>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="ticket-owner-group">
              {locale === "nl" ? "Verantwoordelijke groep" : "Responsible group"}
            </label>
            <select
              id="ticket-owner-group"
              name="ownerGroupId"
              defaultValue={event.ownerGroupId ?? groups[0]?.id ?? ""}
              disabled={isEdit}
              required
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {locale === "en" ? group.nameEn : group.nameNl}
                </option>
              ))}
            </select>
          </div>
          {linkedCalendarEvent ? (
            // De koppeling zelf gaat als hidden mee; wisselen doe je door te
            // ontkoppelen, niet door hier een ander evenement te kiezen.
            <input type="hidden" name="calendarEventId" value={linkedCalendarEvent.id} />
          ) : (
            <div className="ticket-admin-field">
              <label htmlFor="ticket-calendar-event">
                {locale === "nl" ? "Gekoppeld kalenderevent" : "Linked calendar event"}
              </label>
              <select
                id="ticket-calendar-event"
                name="calendarEventId"
                defaultValue={event.calendarEventId ?? ""}
                disabled={isEdit}
              >
                <option value="">{locale === "nl" ? "Niet gekoppeld" : "Not linked"}</option>
                {calendarEvents.map((calendarEvent) => (
                  <option key={calendarEvent.id} value={calendarEvent.id}>
                    {locale === "en" && calendarEvent.titleEn
                      ? calendarEvent.titleEn
                      : calendarEvent.titleNl}
                  </option>
                ))}
              </select>
            </div>
          )}
          {linkedCalendarEvent ? null : (
            <div className="ticket-admin-field">
              <label htmlFor="ticket-location">{locale === "nl" ? "Locatie" : "Location"}</label>
              <input id="ticket-location" name="location" defaultValue={event.location ?? ""} />
              <small>
                {locale === "nl"
                  ? "De naam die bezoekers zien. Een vrije naam zoals \"Theokot\" mag."
                  : "The name buyers see. A free-form name such as \"Theokot\" is fine."}
              </small>
            </div>
          )}
          <div className="ticket-admin-field">
            <label htmlFor="ticket-contact-email">{locale === "nl" ? "Contact e-mail" : "Contact email"}</label>
            <input
              id="ticket-contact-email"
              name="contactEmail"
              type="email"
              defaultValue={event.contactEmail ?? ""}
            />
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title={locale === "nl" ? "Planning en verkoop" : "Schedule and sales"}
        status={isEdit ? `${salesStatus}${presaleStatus}` : undefined}
        icon={<CalendarRange aria-hidden="true" size={17} />}
      >
        <p className="ticket-admin-help">
          {locale === "nl"
            ? "Datums worden geïnterpreteerd in Europe/Brussels."
            : "Dates are interpreted in Europe/Brussels."}
        </p>
        <div className="ticket-admin-form-grid">
          {linkedCalendarEvent ? null : (
            <>
              <div className="ticket-admin-field">
                <label htmlFor="ticket-starts-at">{locale === "nl" ? "Start evenement" : "Event start"}</label>
                <input
                  id="ticket-starts-at"
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(event.startsAt)}
                  required
                />
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="ticket-ends-at">{locale === "nl" ? "Einde evenement" : "Event end"}</label>
                <input
                  id="ticket-ends-at"
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(event.endsAt)}
                  required
                />
              </div>
            </>
          )}
          <div className="ticket-admin-field">
            <label htmlFor="ticket-sales-start">{locale === "nl" ? "Start verkoop" : "Sales start"}</label>
            <input
              id="ticket-sales-start"
              name="salesStartAt"
              type="datetime-local"
              value={salesStart}
              onChange={(changed) => setSalesStart(changed.target.value)}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="ticket-sales-end">{locale === "nl" ? "Einde verkoop" : "Sales end"}</label>
            <input
              id="ticket-sales-end"
              name="salesEndAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(event.salesEndAt)}
            />
          </div>
          {isEdit ? (
            <PresaleFields
              salesStartLocal={salesStart}
              leadMinutes={event.presaleLeadMinutes}
              praesidium={event.presalePraesidium ?? true}
              helpers={event.presaleHelpers ?? true}
              groupIds={event.presaleGroupIds}
              groups={presaleGroups}
              locale={locale}
            />
          ) : null}
          {isEdit ? (
            <div className="ticket-admin-field">
              <label htmlFor="ticket-status">Status</label>
              <select id="ticket-status" name="status" defaultValue={event.status ?? "DRAFT"}>
                <option value="DRAFT">{locale === "nl" ? "Concept" : "Draft"}</option>
                <option value="PUBLISHED" disabled={!hasActiveTicketType}>
                  {locale === "nl" ? "Gepubliceerd" : "Published"}
                </option>
                <option value="SALES_PAUSED">{locale === "nl" ? "Verkoop gepauzeerd" : "Sales paused"}</option>
                <option value="SALES_CLOSED">{locale === "nl" ? "Verkoop gesloten" : "Sales closed"}</option>
                <option value="CANCELLED">{locale === "nl" ? "Geannuleerd" : "Cancelled"}</option>
                <option value="ARCHIVED">{locale === "nl" ? "Gearchiveerd" : "Archived"}</option>
              </select>
              <span className="ticket-admin-help">
                {hasActiveTicketType ? (
                  locale === "nl" ? (
                    "Er is een actief tickettype; dit event kan gepubliceerd worden."
                  ) : (
                    "An active ticket type exists; this event can be published."
                  )
                ) : (
                  <>
                    {locale === "nl"
                      ? "Voeg eerst een tickettype met prijs toe. "
                      : "First add a ticket type with a price. "}
                    <a href="#tickettype-aanmaken">
                      {locale === "nl" ? "Tickettype en prijs instellen" : "Set ticket type and price"}
                    </a>
                  </>
                )}
              </span>
            </div>
          ) : (
            <div className="ticket-admin-field">
              <span className="ticket-admin-label">Status</span>
              <span className="ticket-admin-readonly">{locale === "nl" ? "Concept" : "Draft"}</span>
            </div>
          )}
          <div className="ticket-admin-field">
            <label htmlFor="ticket-max-order">
              {locale === "nl" ? "Maximum tickets per bestelling" : "Maximum tickets per order"}
            </label>
            <input
              id="ticket-max-order"
              name="maxTicketsPerOrder"
              type="number"
              min="1"
              max="50"
              defaultValue={event.maxTicketsPerOrder ?? 8}
              required
            />
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label className="ticket-admin-check" htmlFor="ticket-card-checkin">
              <input type="hidden" name="cardCheckIn" value="false" />
              <input
                id="ticket-card-checkin"
                type="checkbox"
                name="cardCheckIn"
                value="true"
                defaultChecked={event.cardCheckIn ?? false}
              />
              {locale === "nl"
                ? "Aanmelden met de studentenkaart aan de deur"
                : "Check in with a student card at the door"}
            </label>
            <span className="ticket-admin-help">
              {locale === "nl"
                ? "Voor een cantus of een ander event waar het snel moet gaan. Het KU Leuven-nummer van de ingelogde koper komt op zijn ticket te staan; wie voor meerdere mensen bestelt, vult de rest aan op de deelnemerspagina. De QR blijft voor iedereen werken."
                : "For a cantus or another event where the queue has to move. The KU Leuven number of the logged-in buyer is stored on their ticket; anyone ordering for several people fills in the rest on the attendees page. The QR keeps working for everyone."}
            </span>
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title={locale === "nl" ? "Beschrijving en adres" : "Description and address"}
        status={locale === "nl" ? "Optioneel · extra informatie voor bezoekers" : "Optional · extra visitor information"}
      >
        <div className="ticket-admin-form-grid">
          {/* Het adres hoort bij het ticketevent, niet bij het kalenderevent:
              het bestaat enkel om de geofence op de walletpas te voeden. Het
              blijft dus ook staan wanneer titel, locatie en beschrijving van de
              kalender overgenomen worden; anders was het veld onbereikbaar voor
              precies de events die aan de kalender hangen. */}
          <AddressPicker
            defaultAddress={event.locationAddress}
            defaultLatitude={event.locationLatitude}
            defaultLongitude={event.locationLongitude}
            locale={locale}
          />
          {/* Markdown, zoals de beschrijving van een kalenderevent: een gekoppeld
              event neemt die tekst letterlijk over. Geen uploads: /api/admin/upload
              kent de ticketrechten niet, dus wie enkel tickets beheert, kreeg
              een uploadknop die altijd faalt. De poster komt al van de kalender. */}
          {linkedCalendarEvent ? null : (
            <>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="ticket-description-nl">Beschrijving (NL)</label>
                <MarkdownEditorField
                  name="descriptionNl"
                  defaultValue={event.descriptionNl}
                  locale={locale}
                  rows={8}
                  textareaId="ticket-description-nl"
                  allowImages={false}
                  maxLength={TICKET_DESCRIPTION_MAX_LENGTH}
                />
              </div>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="ticket-description-en">Beschrijving (EN)</label>
                <MarkdownEditorField
                  name="descriptionEn"
                  defaultValue={event.descriptionEn}
                  locale={locale}
                  rows={8}
                  textareaId="ticket-description-en"
                  allowImages={false}
                  maxLength={TICKET_DESCRIPTION_MAX_LENGTH}
                />
              </div>
            </>
          )}
        </div>
      </SettingsPanel>

      {/* Alleen bij aanmaken. Voorheen vroeg dit formulier enkel een capaciteit,
          waarmee je een voorraadpot kreeg maar nog geen verkoopbaar ticket; je
          moest daarna alsnog naar de instellingen om een tickettype met een prijs
          aan te maken. Nu staat dat eerste ticket hier, en is het event na één
          keer opslaan te publiceren. Extra types (vroegboek, alumni, ...) voeg je
          nadien toe. */}
      {!isEdit ? (
        <section className="ticket-admin-section">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon"><Ticket aria-hidden="true" size={17} /></span>
              <div>
                <h2>
                  {template
                    ? locale === "nl"
                      ? "Tickets uit het sjabloon"
                      : "Tickets from the template"
                    : locale === "nl"
                      ? "Eerste ticket"
                      : "First ticket"}
                </h2>
                <p>
                  {template
                    ? locale === "nl"
                      ? "Dit wordt aangemaakt. Pas gerust een naam, een prijs of het aantal aan; wat hier staat, wordt verkocht."
                      : "This is what gets created. Adjust a name, a price or the number; what is here is what will be sold."
                    : locale === "nl"
                      ? "Het ticket dat kopers meteen kunnen kiezen. Zonder dit valt er niets te verkopen."
                      : "The ticket buyers can pick straight away. Without it there is nothing to sell."}
                </p>
              </div>
            </div>
          </div>
          {template ? (
            <>
              <TicketTemplateTypeRows
                name="templateTypesData"
                initial={template.types}
                locale={locale}
              />
              <div className="ticket-admin-form-grid">
                <div className="ticket-admin-field">
                  <label htmlFor="ticket-capacity">
                    {locale === "nl" ? "Aantal beschikbaar" : "Available quantity"}
                  </label>
                  <input
                    id="ticket-capacity"
                    name="capacity"
                    type="number"
                    min="1"
                    defaultValue={template.capacity}
                    required
                  />
                  <span className="ticket-admin-help">
                    {locale === "nl"
                      ? "De totale capaciteit; alle tickets hierboven delen ze."
                      : "The total capacity; all tickets above share it."}
                  </span>
                </div>
              </div>
              {template.questions.length > 0 || template.design ? (
                <p className="ticket-admin-help">
                  {locale === "nl"
                    ? `Het sjabloon brengt ook ${[
                        template.questions.length > 0
                          ? `${template.questions.length} deelnemersvra${template.questions.length === 1 ? "ag" : "gen"}`
                          : null,
                        template.design ? "het ticketontwerp" : null,
                      ]
                        .filter(Boolean)
                        .join(" en ")} mee. Die pas je aan na het aanmaken, in de instellingen.`
                    : `The template also brings ${[
                        template.questions.length > 0
                          ? `${template.questions.length} attendee question(s)`
                          : null,
                        template.design ? "the ticket design" : null,
                      ]
                        .filter(Boolean)
                        .join(" and ")}. You adjust those after creating, in the settings.`}
                </p>
              ) : null}
            </>
          ) : (
            <div className="ticket-admin-form-grid">
              <div className="ticket-admin-field">
                <label htmlFor="ticket-first-name">{locale === "nl" ? "Naam" : "Name"}</label>
                <input
                  id="ticket-first-name"
                  name="firstTicketName"
                  defaultValue={locale === "nl" ? "Standaardticket" : "Standard ticket"}
                  required
                />
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="ticket-first-price">
                  {locale === "nl" ? "Prijs (EUR)" : "Price (EUR)"}
                </label>
                <input
                  id="ticket-first-price"
                  name="firstTicketPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  required
                />
                <span className="ticket-admin-help">
                  {locale === "nl" ? "0 voor een gratis ticket." : "0 for a free ticket."}
                </span>
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="ticket-capacity">
                  {locale === "nl" ? "Aantal beschikbaar" : "Available quantity"}
                </label>
                <input
                  id="ticket-capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  defaultValue="100"
                  required
                />
              </div>
            </div>
          )}
        </section>
      ) : null}

      <SettingsPanel
        title={locale === "nl" ? "Bevestigingsbericht en voorwaarden" : "Confirmation message and terms"}
        status={locale === "nl" ? "Optioneel · tekst voor kopers na aankoop" : "Optional · text for buyers after purchase"}
      >
        <p className="ticket-admin-help">{locale === "nl" ? "Het bevestigingsbericht is een extra mededeling die kopers te zien krijgen op het scherm zodra hun bestelling betaald is, én die meegestuurd wordt in de bevestigingsmail met hun tickets (bijv. praktische afspraken, wat mee te brengen of richtlijnen voor de ingang). Laat leeg als je niets wilt toevoegen." : "The confirmation message is an additional note shown to buyers on the order screen once paid, and included in the ticket confirmation email (e.g. practical instructions or what to bring). Leave empty if you have nothing to add."}</p>
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <span className="ticket-admin-help">
              <Link
                href={`${locale === "en" ? "/en" : ""}/tickets/voorwaarden`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {locale === "nl" ? "Algemene voorwaarden bekijken" : "View general terms"}
              </Link>
            </span>
          </div>
          {isEdit ? (
            <>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="ticket-confirmation-nl">{locale === "nl" ? "Bevestigingsbericht na betaling en in e-mail (NL)" : "Confirmation message after payment and in email (NL)"}</label>
                <textarea
                  id="ticket-confirmation-nl"
                  name="confirmationMessageNl"
                  defaultValue={event.confirmationMessageNl ?? ""}
                  placeholder={locale === "nl" ? "Bijv. 'Vergeet je studentenkaart en identiteitskaart niet mee te nemen naar de ingang.'" : "E.g. 'Please bring your student card and ID to the entrance.'"}
                  rows={3}
                />
              </div>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="ticket-confirmation-en">{locale === "nl" ? "Bevestigingsbericht na betaling en in e-mail (EN)" : "Confirmation message after payment and in email (EN)"}</label>
                <textarea
                  id="ticket-confirmation-en"
                  name="confirmationMessageEn"
                  defaultValue={event.confirmationMessageEn ?? ""}
                  placeholder={locale === "nl" ? "Bijv. 'Please bring your student ID and identity card to the entrance.'" : "E.g. 'Please bring your student ID and identity card to the entrance.'"}
                  rows={3}
                />
              </div>
            </>
          ) : null}
        </div>
      </SettingsPanel>

      {state.status === "error" ? (
        <div className="ticket-admin-alert" data-tone="danger" role="alert">
          <AlertTriangle aria-hidden="true" size={17} />
          <span>
            {formErrorMessage(state.code, locale)}
            {state.code === "TICKET_TYPE_REQUIRED_TO_PUBLISH" && isEdit ? (
              <a className="ticket-admin-alert-link" href="#tickettype-aanmaken">
                {locale === "nl" ? "Tickettype en prijs instellen" : "Set ticket type and price"}
              </a>
            ) : null}
          </span>
        </div>
      ) : state.status === "success" ? (
        <div className="ticket-admin-alert" data-tone="success" role="status">
          <CheckCircle2 aria-hidden="true" size={17} />
          <span>{locale === "nl" ? "De wijzigingen zijn opgeslagen." : "Changes saved."}</span>
        </div>
      ) : null}

      <div className="ticket-admin-actions">
        <button className="ticket-admin-button" data-variant="primary" type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" size={16} />
          ) : isEdit ? (
            <Save aria-hidden="true" size={16} />
          ) : (
            <Plus aria-hidden="true" size={16} />
          )}
          {pending
            ? locale === "nl"
              ? "Opslaan..."
              : "Saving..."
            : isEdit
            ? locale === "nl"
              ? "Wijzigingen opslaan"
              : "Save changes"
            : locale === "nl"
              ? "Ticketevent aanmaken"
              : "Create ticket event"}
        </button>
      </div>
    </form>
  );
}
