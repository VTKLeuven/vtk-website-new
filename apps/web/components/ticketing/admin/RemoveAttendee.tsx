import { removeTicketAttendeeAction } from "@/app/actions/tickets";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import type { AdminLocale } from "./format";

/**
 * Eén deelnemer uit een bestelling halen, in het uitklappaneel van die
 * deelnemer op het tabblad Deelnemers. Per ticket en niet per bestelling: wie
 * er vijf kocht, houdt het ticket dat wel voor hemzelf was.
 *
 * Terugbetalen is een vinkje in de bevestiging, enkel waar de site dat zelf kan
 * (Mollie, met het recht `REFUND`). Bancontact betaalt niet terug via de API;
 * daar zegt de uitleg waar het met de hand moet.
 */
export function RemoveAttendee({
  locale,
  eventId,
  orderItemId,
  attendeeName,
  checkedIn,
  otherTickets,
  canVoid,
  refundable,
  manualProvider,
  amount,
}: {
  locale: AdminLocale;
  eventId: string;
  orderItemId: string;
  attendeeName: string;
  checkedIn: boolean;
  /** Geldige tickets in dezelfde bestelling naast dit ene. */
  otherTickets: number;
  /** Mag intrekken zonder terugbetaling (`MANAGE_ORDERS`). */
  canVoid: boolean;
  /** Kan via de site terugbetaald worden: Mollie, niet gratis, recht `REFUND`. */
  refundable: boolean;
  /** Betaald met Bancontact: terugbetalen gebeurt met de hand. */
  manualProvider: boolean;
  amount: string;
}) {
  if (!canVoid && !refundable) return null;
  const nl = locale === "nl";
  const heading = nl ? "Ticket verwijderen" : "Remove ticket";

  if (checkedIn) {
    return (
      <div className="ticket-admin-detail-section">
        <h3>{heading}</h3>
        <p className="ticket-admin-empty-copy">
          {nl
            ? "Dit ticket is al gescand aan de ingang en kan niet meer verwijderd worden."
            : "This ticket was already scanned at the entrance and can no longer be removed."}
        </p>
      </div>
    );
  }

  const others =
    otherTickets === 0
      ? nl
        ? "Er zijn geen andere geldige tickets in deze bestelling."
        : "There are no other valid tickets in this order."
      : nl
        ? `${otherTickets === 1 ? "Het andere ticket" : `De ${otherTickets} andere tickets`} van deze bestelling ${otherTickets === 1 ? "blijft" : "blijven"} geldig.`
        : `The ${otherTickets === 1 ? "other ticket" : `${otherTickets} other tickets`} in this order ${otherTickets === 1 ? "stays" : "stay"} valid.`;

  let money: string;
  if (refundable && !canVoid) {
    money = nl
      ? `${amount} gaat via Mollie terug naar de koper.`
      : `${amount} is refunded to the buyer through Mollie.`;
  } else if (refundable) {
    money = nl
      ? "Kies hieronder of het geld teruggaat."
      : "Choose below whether the money goes back.";
  } else if (manualProvider) {
    money = nl
      ? `Er gaat geen geld terug: deze bestelling is met Bancontact betaald, en dat kan de site niet terugstorten. Moet ${amount} terug, stort het dan zelf terug en gebruik "Met de hand terugbetalen" bij de bestelling op het tabblad Bestellingen; dat verwijdert het ticket ook.`
      : `No money goes back: this order was paid with Bancontact, which the site cannot refund. If ${amount} must go back, transfer it yourself and use "Refund by hand" on the order in the Orders tab; that removes the ticket as well.`;
  } else {
    money = nl ? "Er gaat geen geld terug." : "No money goes back.";
  }

  const description = `${
    nl
      ? `Het ticket van ${attendeeName} werkt niet meer aan de ingang en de plaats komt terug vrij. Dit kan je niet ongedaan maken.`
      : `${attendeeName}'s ticket no longer works at the entrance and the place becomes available again. This cannot be undone.`
  } ${others} ${money}`;

  return (
    <div className="ticket-admin-detail-section">
      <h3>{heading}</h3>
      <p className="ticket-admin-empty-copy">
        {nl
          ? "Voor een ticket dat er niet had mogen zijn, zoals een voorverkoopticket dat voor iemand anders gekocht werd. Enkel dit ticket verdwijnt; de rest van de bestelling blijft."
          : "For a ticket that should not exist, such as a presale ticket bought for someone else. Only this ticket goes; the rest of the order stays."}
      </p>
      <DeleteButton
        action={removeTicketAttendeeAction}
        fields={{
          locale,
          eventId,
          orderItemId,
          ...(refundable && !canVoid ? { refund: "on" } : {}),
        }}
        title={nl ? `Ticket van ${attendeeName} verwijderen?` : `Remove ${attendeeName}'s ticket?`}
        description={description}
        confirmLabel={nl ? "Ticket verwijderen" : "Remove ticket"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        option={
          refundable && canVoid
            ? {
                name: "refund",
                label: nl ? `Ook ${amount} terugbetalen via Mollie` : `Also refund ${amount} through Mollie`,
                hint: nl
                  ? "Uitgevinkt blijft het geld staan. Achteraf terugbetalen kan dan niet meer via de site, enkel rechtstreeks in Mollie."
                  : "Unchecked, the money stays. Refunding afterwards is then no longer possible through the site, only directly in Mollie.",
              }
            : undefined
        }
        successMessage={nl ? `Ticket van ${attendeeName} verwijderd.` : `${attendeeName}'s ticket removed.`}
        errorMessages={
          nl
            ? {
                ATTENDEE_NOT_FOUND: "Niet verwijderd: deze deelnemer bestaat niet meer.",
                TICKET_NOT_VALID: "Niet verwijderd: dit ticket is niet meer geldig. Misschien deed een collega het net.",
                TICKET_NOT_REFUNDABLE: "Niet verwijderd: dit ticket is niet meer geldig. Misschien deed een collega het net.",
                TICKET_ALREADY_CHECKED_IN: "Niet verwijderd: dit ticket is intussen gescand aan de ingang.",
                REFUND_ALREADY_REQUESTED: "Niet verwijderd: voor dit ticket loopt al een terugbetaling.",
                REFUND_MANUAL_ONLY: "Niet verwijderd: deze bestelling is met Bancontact betaald en kan niet via de site terugbetaald worden.",
                PAYMENT_NOT_FOUND: "Niet verwijderd: er is geen geslaagde betaling om van terug te betalen.",
                PAYMENT_REFERENCE_MISSING: "Niet verwijderd: de betaling heeft geen referentie bij Mollie, dus terugbetalen lukt niet. Verwijder zonder terugbetaling en betaal terug in Mollie.",
              }
            : {
                ATTENDEE_NOT_FOUND: "Not removed: this attendee no longer exists.",
                TICKET_NOT_VALID: "Not removed: this ticket is no longer valid. A colleague may have just done it.",
                TICKET_NOT_REFUNDABLE: "Not removed: this ticket is no longer valid. A colleague may have just done it.",
                TICKET_ALREADY_CHECKED_IN: "Not removed: this ticket has meanwhile been scanned at the entrance.",
                REFUND_ALREADY_REQUESTED: "Not removed: a refund is already running for this ticket.",
                REFUND_MANUAL_ONLY: "Not removed: this order was paid with Bancontact and cannot be refunded through the site.",
                PAYMENT_NOT_FOUND: "Not removed: there is no successful payment to refund from.",
                PAYMENT_REFERENCE_MISSING: "Not removed: the payment has no Mollie reference, so the refund cannot go through. Remove without refund and refund in Mollie.",
              }
        }
        errorFallback={nl ? "Ticket niet verwijderd." : "Ticket was not removed."}
      >
        {heading}
      </DeleteButton>
    </div>
  );
}
