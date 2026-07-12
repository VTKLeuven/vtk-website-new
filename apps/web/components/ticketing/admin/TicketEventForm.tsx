"use client";

import {
  submitTicketEventFormAction,
  type TicketEventFormActionState,
} from "@/app/actions/tickets";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileText,
  Info,
  LoaderCircle,
  Plus,
  Save,
} from "lucide-react";
import { useActionState } from "react";
import { toDatetimeLocal, type AdminLocale } from "./format";

const initialState: TicketEventFormActionState = { status: "idle" };

const formErrorMessages: Record<string, { nl: string; en: string }> = {
  GROUP_REQUIRED: { nl: "Kies een verantwoordelijke groep.", en: "Choose a responsible group." },
  FORBIDDEN: { nl: "Je hebt geen toegang om dit ticketevent te wijzigen.", en: "You cannot change this ticket event." },
  INVALID_CALENDAR_EVENT: { nl: "Het gekozen kalenderevent hoort niet bij deze groep.", en: "The selected calendar event does not belong to this group." },
  TITLE_REQUIRED: { nl: "Vul een Nederlandse titel in.", en: "Enter a Dutch title." },
  INVALID_EVENT_DATES: { nl: "De eindtijd moet na de starttijd liggen.", en: "The end time must be after the start time." },
  INVALID_SALES_DATES: { nl: "Het einde van de verkoop moet na de start liggen.", en: "Sales must end after they start." },
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
  startsAt?: Date;
  endsAt?: Date;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
  status?: string;
  maxTicketsPerOrder?: number;
  contactEmail?: string | null;
  termsUrl?: string | null;
  termsVersion?: string | null;
  confirmationMessageNl?: string | null;
  confirmationMessageEn?: string | null;
};

type GroupOption = { id: string; nameNl: string; nameEn: string };
type CalendarOption = {
  id: string;
  titleNl: string;
  titleEn: string | null;
  start: Date;
};

export function TicketEventForm({
  event = {},
  groups,
  calendarEvents,
  locale,
}: {
  event?: TicketEventFormValue;
  groups: GroupOption[];
  calendarEvents: CalendarOption[];
  locale: AdminLocale;
}) {
  const isEdit = Boolean(event.id);
  const [state, formAction, pending] = useActionState(
    submitTicketEventFormAction,
    initialState
  );

  return (
    <form action={formAction} className="ticket-admin-form">
      <input type="hidden" name="locale" value={locale} />
      {event.id ? <input type="hidden" name="eventId" value={event.id} /> : null}

      <section className="ticket-admin-section">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><Info aria-hidden="true" size={17} /></span>
            <div>
            <h2>{locale === "nl" ? "Basisinformatie" : "Basic information"}</h2>
            <p>
              {locale === "nl"
                ? "De informatie die kopers in de ticketshop zien."
                : "The information buyers see in the ticket shop."}
            </p>
            </div>
          </div>
        </div>
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="ticket-title-nl">Titel (NL)</label>
            <input id="ticket-title-nl" name="titleNl" defaultValue={event.titleNl ?? ""} required />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="ticket-title-en">Titel (EN)</label>
            <input id="ticket-title-en" name="titleEn" defaultValue={event.titleEn ?? ""} />
          </div>
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
          <div className="ticket-admin-field">
            <label htmlFor="ticket-location">{locale === "nl" ? "Locatie" : "Location"}</label>
            <input id="ticket-location" name="location" defaultValue={event.location ?? ""} />
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor="ticket-description-nl">Beschrijving (NL)</label>
            <textarea
              id="ticket-description-nl"
              name="descriptionNl"
              defaultValue={event.descriptionNl ?? ""}
              rows={4}
            />
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor="ticket-description-en">Beschrijving (EN)</label>
            <textarea
              id="ticket-description-en"
              name="descriptionEn"
              defaultValue={event.descriptionEn ?? ""}
              rows={4}
            />
          </div>
        </div>
      </section>

      <section className="ticket-admin-section">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><CalendarRange aria-hidden="true" size={17} /></span>
            <div>
            <h2>{locale === "nl" ? "Planning en verkoop" : "Schedule and sales"}</h2>
            <p>
              {locale === "nl"
                ? "Datums worden geïnterpreteerd in Europe/Brussels."
                : "Dates are interpreted in Europe/Brussels."}
            </p>
            </div>
          </div>
        </div>
        <div className="ticket-admin-form-grid">
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
          <div className="ticket-admin-field">
            <label htmlFor="ticket-sales-start">{locale === "nl" ? "Start verkoop" : "Sales start"}</label>
            <input
              id="ticket-sales-start"
              name="salesStartAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(event.salesStartAt)}
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
            <div className="ticket-admin-field">
              <label htmlFor="ticket-status">Status</label>
              <select id="ticket-status" name="status" defaultValue={event.status ?? "DRAFT"}>
                <option value="DRAFT">{locale === "nl" ? "Concept" : "Draft"}</option>
                <option value="PUBLISHED">{locale === "nl" ? "Gepubliceerd" : "Published"}</option>
                <option value="SALES_PAUSED">{locale === "nl" ? "Verkoop gepauzeerd" : "Sales paused"}</option>
                <option value="SALES_CLOSED">{locale === "nl" ? "Verkoop gesloten" : "Sales closed"}</option>
                <option value="CANCELLED">{locale === "nl" ? "Geannuleerd" : "Cancelled"}</option>
                <option value="ARCHIVED">{locale === "nl" ? "Gearchiveerd" : "Archived"}</option>
              </select>
              <span className="ticket-admin-help">
                {locale === "nl"
                  ? "Publiceren kan zodra minstens één actief tickettype bestaat."
                  : "Publishing requires at least one active ticket type."}
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
          {!isEdit ? (
            <div className="ticket-admin-field">
              <label htmlFor="ticket-capacity">
                {locale === "nl" ? "Initiële capaciteit" : "Initial capacity"}
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
          ) : null}
        </div>
      </section>

      <section className="ticket-admin-section">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><FileText aria-hidden="true" size={17} /></span>
            <div>
            <h2>{locale === "nl" ? "Communicatie en voorwaarden" : "Communication and terms"}</h2>
            </div>
          </div>
        </div>
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="ticket-contact-email">{locale === "nl" ? "Contact e-mail" : "Contact email"}</label>
            <input
              id="ticket-contact-email"
              name="contactEmail"
              type="email"
              defaultValue={event.contactEmail ?? ""}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="ticket-terms-url">{locale === "nl" ? "URL voorwaarden" : "Terms URL"}</label>
            <input
              id="ticket-terms-url"
              name="termsUrl"
              type="url"
              defaultValue={event.termsUrl ?? ""}
              placeholder="https://"
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="ticket-terms-version">{locale === "nl" ? "Versie voorwaarden" : "Terms version"}</label>
            <input
              id="ticket-terms-version"
              name="termsVersion"
              defaultValue={event.termsVersion ?? ""}
              placeholder="2027-01"
            />
          </div>
          {isEdit ? (
            <>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="ticket-confirmation-nl">Bevestigingsbericht (NL)</label>
                <textarea
                  id="ticket-confirmation-nl"
                  name="confirmationMessageNl"
                  defaultValue={event.confirmationMessageNl ?? ""}
                  rows={3}
                />
              </div>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="ticket-confirmation-en">Bevestigingsbericht (EN)</label>
                <textarea
                  id="ticket-confirmation-en"
                  name="confirmationMessageEn"
                  defaultValue={event.confirmationMessageEn ?? ""}
                  rows={3}
                />
              </div>
            </>
          ) : null}
        </div>
      </section>

      {state.status === "error" ? (
        <div className="ticket-admin-alert" data-tone="danger" role="alert">
          <AlertTriangle aria-hidden="true" size={17} />
          <span>{formErrorMessage(state.code, locale)}</span>
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
