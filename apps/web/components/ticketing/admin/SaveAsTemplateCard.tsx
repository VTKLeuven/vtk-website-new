"use client";

import { LayoutTemplate } from "lucide-react";
import Link from "@/components/ui/Link";
import { saveTicketTemplateFromEventAction } from "@/app/actions/ticketTemplates";
import { SaveForm } from "@/components/ui/SaveForm";
import { SettingsPanel } from "./SettingsPanel";
import { ticketBase, type AdminLocale } from "./format";

/**
 * "Bewaar als sjabloon" op een bestaand ticketevent.
 *
 * Het eerste sjabloon van een post bestaat meestal al: het is de cantus die
 * vorige week verkocht werd. Die in een leeg beheerscherm overtypen is precies
 * het werk dat een sjabloon moest wegnemen, dus kan het event zelf het sjabloon
 * worden. De datums worden daarbij duurtijden ("verkoop opent drie dagen
 * vooraf"), zodat het op elke volgende editie past.
 */
export function SaveAsTemplateCard({
  eventId,
  eventTitle,
  ticketTypeCount,
  questionCount,
  locale,
}: {
  eventId: string;
  eventTitle: string;
  ticketTypeCount: number;
  questionCount: number;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const base = ticketBase(locale);

  return (
    <SettingsPanel
      id="bewaar-als-sjabloon"
      title={nl ? "Bewaar als sjabloon" : "Save as template"}
      status={
        nl
          ? `${ticketTypeCount} tickettype(s)${questionCount > 0 ? `, ${questionCount} vraag/vragen` : ""}`
          : `${ticketTypeCount} ticket type(s)${questionCount > 0 ? `, ${questionCount} question(s)` : ""}`
      }
      icon={<LayoutTemplate aria-hidden="true" size={17} />}
    >
      <p className="ticket-admin-help">
        {nl
          ? `Komt dit evenement terug, dan hoef je het niet opnieuw in te tikken. De tickets, prijzen, capaciteit, vragen, teksten en instellingen van "${eventTitle}" worden een sjabloon; de datums worden duurtijden, zodat een volgende editie enkel nog een dag nodig heeft.`
          : `If this event comes back, you do not have to type it again. The tickets, prices, capacity, questions, texts and settings of "${eventTitle}" become a template; dates become durations, so a next edition only needs a day.`}
      </p>
      <SaveForm
        className="ticket-admin-form"
        action={saveTicketTemplateFromEventAction}
        submitLabel={nl ? "Bewaar als sjabloon" : "Save as template"}
        savingLabel={nl ? "Bewaren..." : "Saving..."}
        savedMessage={
          nl
            ? "Sjabloon bewaard. Het staat nu in de keuzelijst bij een nieuw ticketevent."
            : "Template saved. It now appears in the list when creating a ticket event."
        }
        errorMessages={{
          LABEL_REQUIRED: nl ? "Geef het sjabloon een naam." : "Give the template a name.",
          FORBIDDEN: nl
            ? "Je hebt geen recht om sjablonen te beheren."
            : "You may not manage templates.",
          NO_TICKET_TYPES: nl
            ? "Dit event heeft geen actief tickettype om te bewaren."
            : "This event has no active ticket type to save.",
        }}
        fallbackErrorMessage={nl ? "Bewaren mislukt." : "Saving failed."}
        resetOnSuccess={false}
      >
        <input type="hidden" name="eventId" value={eventId} />
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="template-label">{nl ? "Naam van het sjabloon" : "Template name"}</label>
            <input id="template-label" name="label" defaultValue={eventTitle} required />
            <span className="ticket-admin-help">
              {nl ? "Dit staat in de keuzelijst bij een nieuw event." : "This is what the list shows."}
            </span>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="template-note">{nl ? "Uitleg (optioneel)" : "Explanation (optional)"}</label>
            <input
              id="template-note"
              name="note"
              placeholder={nl ? "Eén regel onder de keuzelijst." : "One line below the list."}
            />
          </div>
        </div>
      </SaveForm>
      <p className="ticket-admin-help">
        <Link href={`${base}/admin/tickets/sjablonen`}>
          {nl ? "Alle sjablonen beheren" : "Manage all templates"}
        </Link>
      </p>
    </SettingsPanel>
  );
}
