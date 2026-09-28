import {
  TICKET_TARGET_AUDIENCES,
  ticketAudienceLabel,
} from "@/lib/ticketing/audience";

/**
 * De keuzes voor "wie mag dit ticket kopen?", gedeeld door het ticketformulier,
 * het bewerkpaneel en de sjablonen. De doelgroepen staan in een eigen groep:
 * het zijn geen strengere varianten van "leden", maar een ander soort keuze.
 */
export function AudienceOptions({
  locale,
  publicLabel,
}: {
  locale: "nl" | "en";
  /** De sjablonen zeggen "Iedereen"; het ticketformulier "Leden en niet-leden". */
  publicLabel?: string;
}) {
  const nl = locale === "nl";
  return (
    <>
      <option value="PUBLIC">{publicLabel ?? ticketAudienceLabel("PUBLIC", locale)}</option>
      <option value="MEMBERS">{ticketAudienceLabel("MEMBERS", locale)}</option>
      {/* Onzichtbaar voor iedereen behalve ereleden; niet uitgegrijsd maar echt
          weggefilterd, zodat de rest van de site die uitzondering niet ziet. */}
      <option value="HONORARY">{ticketAudienceLabel("HONORARY", locale)}</option>
      <optgroup label={nl ? "Doelgroep (uit het profiel)" : "Target group (from the profile)"}>
        {TICKET_TARGET_AUDIENCES.map((audience) => (
          <option key={audience} value={audience}>
            {ticketAudienceLabel(audience, locale)}
          </option>
        ))}
      </optgroup>
    </>
  );
}
