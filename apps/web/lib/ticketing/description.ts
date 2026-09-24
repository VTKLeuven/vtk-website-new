import { markdownToPlainText } from "@/lib/markdown";

/**
 * Bovengrens voor de beschrijving van een ticketevent, per taal. De editor en de
 * server action lezen dezelfde waarde, zodat de editor afkapt voor de action
 * weigert. Ruim genoeg voor markdown met links; de kalender kent geen grens, en
 * een gekoppeld event neemt die tekst ongemoeid over.
 */
export const TICKET_DESCRIPTION_MAX_LENGTH = 20_000;

/**
 * De eerste alinea van de beschrijving als platte tekst, voor de eventkaart op
 * /tickets. Een kop of een losse afbeelding bovenaan is geen samenvatting: de
 * kaart zou dan "Praktisch" of de alt-tekst van een foto tonen.
 */
export function ticketDescriptionExcerpt(description: string | null | undefined): string {
  for (const block of (description ?? "").split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (/^#{1,6}\s/.test(trimmed) && !trimmed.includes("\n")) continue;
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(trimmed)) continue;
    const text = markdownToPlainText(trimmed);
    if (text) return text;
  }
  return "";
}
