"use client";

import { useState } from "react";
import { LayoutTemplate, Plus } from "lucide-react";
import {
  deleteTicketTemplateAction,
  saveTicketTemplateAction,
} from "@/app/actions/ticketTemplates";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { TicketTemplateTypeRows } from "@/components/ticketing/admin/TicketTemplateTypeRows";
import { formatMoney, type AdminLocale } from "@/components/ticketing/admin/format";
import {
  blankTicketTemplate,
  formatMinutesBefore,
  templateTimeOfDay,
  type TicketEventTemplate,
} from "@/lib/ticketing/templates";

/**
 * Het beheer van de ticketsjablonen.
 *
 * Eén lijst met hoogstens één bewerktaak tegelijk open, zoals het beheer van de
 * shiftsjablonen: een lang formulier naast een tweede lang formulier leest als
 * twee schermen die elkaar tegenspreken.
 *
 * Wat je hier zet is het vertrekpunt van een nieuw ticketevent, niet de regel.
 * Bestaande events blijven ongemoeid; enkel wat iemand hierna aanmaakt, vertrekt
 * van de nieuwe waarden.
 */

const errorMessages = (nl: boolean): Record<string, string> => ({
  LABEL_REQUIRED: nl ? "Geef het sjabloon een naam." : "Give the template a name.",
  NO_TICKET_TYPES: nl
    ? "Een sjabloon heeft minstens één ticket nodig."
    : "A template needs at least one ticket.",
  INVALID_SALES_WINDOW: nl
    ? "De verkoop moet sluiten nadat ze opent."
    : "Sales must close after they open.",
  TEMPLATE_GONE: nl
    ? "Dit sjabloon bestaat niet meer; iemand verwijderde het intussen."
    : "This template no longer exists; someone deleted it in the meantime.",
  INVALID_INPUT: nl ? "Controleer de ingevulde gegevens." : "Check the entered data.",
});

export function TicketTemplateManager({
  templates,
  groups,
  locale,
}: {
  templates: TicketEventTemplate[];
  groups: { id: string; nameNl: string; nameEn: string }[];
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const open = templates.find((template) => template.id === openId) ?? null;

  function openTemplate(id: string) {
    setCreating(false);
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <h1>{nl ? "Ticketsjablonen" : "Ticket templates"}</h1>
          <p>
            {nl
              ? "De verkoopomgeving van een evenement dat telkens terugkomt. Kies ze bij het aanmaken van een ticketevent; daar blijft alles aanpasbaar."
              : "The sales setup of a recurring event. Pick one when creating a ticket event; everything stays editable there."}
          </p>
        </div>
        <div className="ticket-admin-actions">
          <button
            type="button"
            className="ticket-admin-button"
            data-variant="primary"
            onClick={() => {
              setOpenId(null);
              setCreating(true);
            }}
          >
            <Plus aria-hidden="true" size={16} />
            {nl ? "Nieuw sjabloon" : "New template"}
          </button>
        </div>
      </div>

      <section className="ticket-admin-section">
        {templates.length === 0 ? (
          <AdminEmptyState
            icon={LayoutTemplate}
            title={nl ? "Nog geen sjablonen" : "No templates yet"}
            description={
              nl
                ? "Zet de tickets van een evenement dat telkens terugkomt hier één keer neer; daarna staat een nieuwe editie in twee klikken klaar."
                : "Set up the tickets of a recurring event here once; a new edition then takes two clicks."
            }
          />
        ) : (
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-admin-clickable-rows">
              <thead>
                <tr>
                  <th>{nl ? "Sjabloon" : "Template"}</th>
                  <th>{nl ? "Post" : "Post"}</th>
                  <th>{nl ? "Start" : "Start"}</th>
                  <th>{nl ? "Tickets" : "Tickets"}</th>
                  <th>{nl ? "Prijzen" : "Prices"}</th>
                  <th>{nl ? "Capaciteit" : "Capacity"}</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => {
                  const active = template.types.filter((type) => type.enabled);
                  const prices = active.map((type) => type.unitPriceCents);
                  const group = groups.find((candidate) => candidate.id === template.ownerGroupId);
                  return (
                    <tr
                      key={template.id}
                      data-open={template.id === openId ? "true" : undefined}
                      onClick={() => openTemplate(template.id)}
                    >
                      <td>
                        {/* Een echt focusbaar element: een rij die enkel op een
                            klik reageert bestaat niet voor een toetsenbord. */}
                        <button
                          type="button"
                          className="ticket-admin-linkbutton"
                          onClick={(clicked) => {
                            clicked.stopPropagation();
                            openTemplate(template.id);
                          }}
                        >
                          {template.label}
                        </button>
                        {template.note ? <p className="ticket-admin-help">{template.note}</p> : null}
                      </td>
                      <td>{group ? (nl ? group.nameNl : group.nameEn) : "—"}</td>
                      <td className="tabular-nums">{templateTimeOfDay(template)}</td>
                      <td className="tabular-nums">
                        {active.length}
                        {active.length !== template.types.length ? (
                          <span className="ticket-admin-help">
                            {" "}
                            (+{template.types.length - active.length} {nl ? "uit" : "off"})
                          </span>
                        ) : null}
                      </td>
                      <td className="tabular-nums">
                        {prices.length === 0
                          ? "—"
                          : prices.length === 1 || Math.min(...prices) === Math.max(...prices)
                            ? formatMoney(prices[0], "EUR", locale)
                            : `${formatMoney(Math.min(...prices), "EUR", locale)} – ${formatMoney(Math.max(...prices), "EUR", locale)}`}
                      </td>
                      <td className="tabular-nums">{template.capacity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating ? (
        <TemplateEditor
          key="new"
          template={blankTicketTemplate()}
          groups={groups}
          locale={locale}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {open ? (
        <TemplateEditor
          key={open.id}
          template={open}
          groups={groups}
          locale={locale}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------

/** Een duur als getal plus eenheid, met de minuten in een verborgen veld. */
function OffsetField({
  id,
  name,
  label,
  help,
  value,
  locale,
}: {
  id: string;
  name: string;
  label: string;
  help?: string;
  value: number | null;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const initialUnit = value !== null && value !== 0 && value % 1_440 === 0 ? "days" : "hours";
  const [unit, setUnit] = useState<"hours" | "days">(initialUnit);
  const [amount, setAmount] = useState<string>(
    value === null ? "" : String(value / (initialUnit === "days" ? 1_440 : 60))
  );

  const parsed = amount.trim() === "" ? null : Number(amount);
  const minutes =
    parsed === null || !Number.isFinite(parsed)
      ? null
      : Math.round(parsed * (unit === "days" ? 1_440 : 60));

  return (
    <div className="ticket-admin-field">
      <label htmlFor={id}>{label}</label>
      <input type="hidden" name={name} value={minutes === null ? "" : String(minutes)} />
      <div className="ticket-admin-inline-fields">
        <input
          id={id}
          type="number"
          min="0"
          step="0.5"
          value={amount}
          placeholder={nl ? "leeg = niet instellen" : "empty = not set"}
          onChange={(changed) => setAmount(changed.target.value)}
        />
        <label className="sr-only" htmlFor={`${id}-unit`}>
          {nl ? "Eenheid" : "Unit"}
        </label>
        <select
          id={`${id}-unit`}
          value={unit}
          onChange={(changed) => setUnit(changed.target.value as "hours" | "days")}
        >
          <option value="hours">{nl ? "uur" : "hours"}</option>
          <option value="days">{nl ? "dagen" : "days"}</option>
        </select>
      </div>
      <span className="ticket-admin-help">
        {formatMinutesBefore(minutes, locale)}
        {help ? ` · ${help}` : ""}
      </span>
    </div>
  );
}

function TemplateEditor({
  template,
  groups,
  locale,
  onClose,
}: {
  template: TicketEventTemplate;
  groups: { id: string; nameNl: string; nameEn: string }[];
  locale: AdminLocale;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const isNew = template.id === "";
  // Een meegeleverd sjabloon heeft nog geen rij in de databank zolang de seed
  // niet liep; dan maakt opslaan er een echte van.
  const id = template.id.startsWith("builtin:") ? "" : template.id;

  return (
    <section className="ticket-admin-section">
      <div className="ticket-admin-section-head">
        <div className="ticket-admin-section-heading">
          <span className="ticket-admin-section-icon">
            <LayoutTemplate aria-hidden="true" size={17} />
          </span>
          <div>
            <h2>{isNew ? (nl ? "Nieuw sjabloon" : "New template") : template.label}</h2>
            <p>
              {nl
                ? "Bestaande ticketevents blijven zoals ze zijn; dit geldt voor wat je hierna aanmaakt."
                : "Existing ticket events stay as they are; this applies to what you create from now on."}
            </p>
          </div>
        </div>
      </div>

      <SaveForm
        action={saveTicketTemplateAction}
        submitLabel={nl ? "Sjabloon opslaan" : "Save template"}
        savingLabel={nl ? "Opslaan..." : "Saving..."}
        savedMessage={
          isNew
            ? nl
              ? "Sjabloon aangemaakt. Het staat nu in de keuzelijst bij een nieuw ticketevent."
              : "Template created. It now appears in the list when creating a ticket event."
            : nl
              ? "Sjabloon opgeslagen. Bestaande ticketevents blijven zoals ze zijn."
              : "Template saved. Existing ticket events are untouched."
        }
        errorMessages={errorMessages(nl)}
        fallbackErrorMessage={nl ? "Opslaan mislukt." : "Saving failed."}
        // Een net aangemaakt sjabloon niet in "nieuw" laten staan: een tweede
        // klik op opslaan zou er een duplicaat van maken.
        onSuccess={isNew ? onClose : undefined}
        resetOnSuccess={false}
      >
        <input type="hidden" name="templateId" value={id} />

        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor={`label-${id || "new"}`}>{nl ? "Naam van het sjabloon" : "Template name"}</label>
            <input
              id={`label-${id || "new"}`}
              name="label"
              defaultValue={template.label}
              placeholder="Cantus"
              required
            />
            <span className="ticket-admin-help">
              {nl ? "Dit staat in de keuzelijst bij een nieuw event." : "This is what the list shows."}
            </span>
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor={`note-${id || "new"}`}>{nl ? "Uitleg (optioneel)" : "Explanation (optional)"}</label>
            <input
              id={`note-${id || "new"}`}
              name="note"
              defaultValue={template.note ?? ""}
              placeholder={nl ? "Eén regel onder de keuzelijst." : "One line below the list."}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`group-${id || "new"}`}>{nl ? "Post" : "Post"}</label>
            <select id={`group-${id || "new"}`} name="ownerGroupId" defaultValue={template.ownerGroupId ?? ""}>
              <option value="">{nl ? "Geen" : "None"}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {nl ? group.nameNl : group.nameEn}
                </option>
              ))}
            </select>
            <span className="ticket-admin-help">
              {nl
                ? "Enkel een toelichting in de lijst; het sjabloon blijft voor iedereen bruikbaar."
                : "Only a hint in the list; the template stays usable by everyone."}
            </span>
          </div>
        </div>

        <h3 className="ticket-admin-subheading">{nl ? "Het event" : "The event"}</h3>
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor={`titleNl-${id || "new"}`}>{nl ? "Titel (NL)" : "Title (NL)"}</label>
            <input id={`titleNl-${id || "new"}`} name="titleNl" defaultValue={template.titleNl} />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`titleEn-${id || "new"}`}>{nl ? "Titel (EN)" : "Title (EN)"}</label>
            <input id={`titleEn-${id || "new"}`} name="titleEn" defaultValue={template.titleEn} />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`location-${id || "new"}`}>{nl ? "Locatie" : "Location"}</label>
            <input id={`location-${id || "new"}`} name="location" defaultValue={template.location} />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`time-${id || "new"}`}>{nl ? "Startuur" : "Start time"}</label>
            <input
              id={`time-${id || "new"}`}
              name="timeOfDay"
              type="time"
              defaultValue={templateTimeOfDay(template)}
            />
            <span className="ticket-admin-help">
              {nl ? "De datum kies je bij het aanmaken." : "The date is picked when creating."}
            </span>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`duration-${id || "new"}`}>{nl ? "Duur (minuten)" : "Duration (minutes)"}</label>
            <input
              id={`duration-${id || "new"}`}
              name="durationMinutes"
              type="number"
              min="15"
              step="15"
              defaultValue={template.durationMinutes}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`capacity-${id || "new"}`}>{nl ? "Capaciteit" : "Capacity"}</label>
            <input
              id={`capacity-${id || "new"}`}
              name="capacity"
              type="number"
              min="1"
              defaultValue={template.capacity}
            />
          </div>
          <OffsetField
            id={`opens-${id || "new"}`}
            name="salesOpensMinutesBefore"
            label={nl ? "Verkoop opent" : "Sales open"}
            help={nl ? "vóór de start van het event" : "before the event starts"}
            value={template.salesOpensMinutesBefore}
            locale={locale}
          />
          <OffsetField
            id={`closes-${id || "new"}`}
            name="salesClosesMinutesBefore"
            label={nl ? "Verkoop sluit" : "Sales close"}
            help={nl ? "0 = bij de start" : "0 = at the start"}
            value={template.salesClosesMinutesBefore}
            locale={locale}
          />
          <div className="ticket-admin-field">
            <label htmlFor={`max-${id || "new"}`}>
              {nl ? "Max. tickets per bestelling" : "Max. tickets per order"}
            </label>
            <input
              id={`max-${id || "new"}`}
              name="maxTicketsPerOrder"
              type="number"
              min="1"
              max="50"
              defaultValue={template.maxTicketsPerOrder}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`contact-${id || "new"}`}>{nl ? "Contact-e-mail" : "Contact email"}</label>
            <input
              id={`contact-${id || "new"}`}
              name="contactEmail"
              type="email"
              defaultValue={template.contactEmail ?? ""}
            />
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label className="ticket-admin-check" htmlFor={`card-${id || "new"}`}>
              <input type="hidden" name="cardCheckIn" value="false" />
              <input
                id={`card-${id || "new"}`}
                name="cardCheckIn"
                type="checkbox"
                value="true"
                defaultChecked={template.cardCheckIn}
              />
              <span>{nl ? "Check-in met de studentenkaart" : "Check in with the student card"}</span>
            </label>
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label className="ticket-admin-check" htmlFor={`scan-${id || "new"}`}>
              <input type="hidden" name="openScanning" value="false" />
              <input
                id={`scan-${id || "new"}`}
                name="openScanning"
                type="checkbox"
                value="true"
                defaultChecked={template.openScanning}
              />
              <span>{nl ? "Elke praesidiumpost mag scannen" : "Every praesidium post may scan"}</span>
            </label>
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label className="ticket-admin-check" htmlFor={`presale-${id || "new"}`}>
              <input type="hidden" name="presalePraesidium" value="false" />
              <input
                id={`presale-${id || "new"}`}
                name="presalePraesidium"
                type="checkbox"
                value="true"
                defaultChecked={template.presalePraesidium}
              />
              <span>{nl ? "Voorverkoop voor het praesidium" : "Presale for the praesidium"}</span>
            </label>
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label className="ticket-admin-check" htmlFor={`presale-helpers-${id || "new"}`}>
              <input type="hidden" name="presaleHelpers" value="false" />
              <input
                id={`presale-helpers-${id || "new"}`}
                name="presaleHelpers"
                type="checkbox"
                value="true"
                defaultChecked={template.presaleHelpers}
              />
              <span>
                {nl ? "Voorverkoop voor de vaste medewerkers" : "Presale for the regular helpers"}
              </span>
            </label>
          </div>
          <OffsetField
            id={`lead-${id || "new"}`}
            name="presaleLeadMinutes"
            label={nl ? "Voorverkoop begint" : "Presale starts"}
            help={nl ? "vóór de verkoopstart" : "before sales open"}
            value={template.presaleLeadMinutes}
            locale={locale}
          />
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor={`descNl-${id || "new"}`}>{nl ? "Beschrijving (NL)" : "Description (NL)"}</label>
            <textarea
              id={`descNl-${id || "new"}`}
              name="descriptionNl"
              rows={6}
              defaultValue={template.descriptionNl}
            />
            <span className="ticket-admin-help">
              {nl
                ? "De vaste blokken (locatie, timing, prijzen). De datum vul je per editie in."
                : "The fixed blocks (location, timing, prices). The date is filled in per edition."}
            </span>
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor={`descEn-${id || "new"}`}>{nl ? "Beschrijving (EN)" : "Description (EN)"}</label>
            <textarea
              id={`descEn-${id || "new"}`}
              name="descriptionEn"
              rows={4}
              defaultValue={template.descriptionEn}
            />
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor={`confirmNl-${id || "new"}`}>
              {nl ? "Bevestigingsbericht (NL)" : "Confirmation message (NL)"}
            </label>
            <textarea
              id={`confirmNl-${id || "new"}`}
              name="confirmationMessageNl"
              rows={3}
              defaultValue={template.confirmationMessageNl}
            />
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor={`confirmEn-${id || "new"}`}>
              {nl ? "Bevestigingsbericht (EN)" : "Confirmation message (EN)"}
            </label>
            <textarea
              id={`confirmEn-${id || "new"}`}
              name="confirmationMessageEn"
              rows={3}
              defaultValue={template.confirmationMessageEn}
            />
          </div>
        </div>

        <h3 className="ticket-admin-subheading">{nl ? "De tickets" : "The tickets"}</h3>
        <TicketTemplateTypeRows
          name="typesData"
          initial={template.types}
          locale={locale}
          showOffsets
        />
        <input type="hidden" name="questionsData" value={JSON.stringify(template.questions)} />
        {template.questions.length > 0 ? (
          <p className="ticket-admin-help">
            {nl
              ? `Dit sjabloon draagt ${template.questions.length} deelnemersvra${template.questions.length === 1 ? "ag" : "gen"} mee. Die bewerk je op een event zelf; hier blijven ze bewaard.`
              : `This template carries ${template.questions.length} attendee question(s). You edit those on an event itself; here they are kept.`}
          </p>
        ) : null}
      </SaveForm>

      {/* Verwijderen staat in het detail en niet in de rij: het is de enige
          onomkeerbare actie hier. */}
      {!isNew && !template.builtIn ? (
        <div className="ticket-admin-section-foot">
          <DeleteButton
            action={deleteTicketTemplateAction}
            fields={{ templateId: template.id }}
            title={nl ? "Sjabloon verwijderen?" : "Delete template?"}
            description={
              nl
                ? `"${template.label}" en zijn ${template.types.length} ticketrij(en) verdwijnen uit de keuzelijst. Ticketevents die er al mee aangemaakt zijn, blijven volledig zoals ze zijn, met hun bestellingen; enkel het sjabloon gaat weg.`
                : `"${template.label}" and its ${template.types.length} ticket row(s) disappear from the list. Ticket events already created from it stay exactly as they are, including their orders; only the template goes.`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Sjabloon verwijderd." : "Template deleted."}
          >
            {nl ? "Sjabloon verwijderen" : "Delete template"}
          </DeleteButton>
        </div>
      ) : null}
      {!isNew && template.builtIn ? (
        <p className="ticket-admin-section-foot ticket-admin-help">
          {nl
            ? "Dit sjabloon wordt meegeleverd en kan niet verwijderd worden, zodat er altijd één werkend vertrekpunt staat. Aanpassen mag wel."
            : "This template ships with the site and cannot be deleted, so there is always one working starting point. Editing is fine."}
        </p>
      ) : null}
    </section>
  );
}
