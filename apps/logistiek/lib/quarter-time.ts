/**
 * De kwartieren waarop een rit gepland kan worden, en het uit elkaar halen van
 * een `datetime-local`-waarde.
 *
 * De server weigert een uur dat niet op een kwartier valt (`isOnQuarterHour`).
 * Dit is de kant van dat contract die het invoerveld nodig heeft: hier staan de
 * enige uren die je mag kiezen.
 */

/** Alle kwartieren van een dag, als `HH:MM`, van 00:00 tot 23:45. */
export const QUARTERS: readonly string[] = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

/** `2026-08-26T14:15` uit elkaar halen; eventuele seconden gooien we weg. */
export function splitMoment(value: string): { date: string; time: string } {
  const [date = '', rest = ''] = value.split('T');
  return { date, time: rest.slice(0, 5) };
}

/**
 * De twee helften weer samen.
 *
 * Half ingevuld telt als leeg: een formulier dat enkel op "niet leeg" controleert
 * mag een datum zonder uur niet als ingevuld zien en doorsturen.
 */
export function joinMoment(date: string, time: string): string {
  return date && time ? `${date}T${time}` : '';
}

/**
 * De uren die in de lijst horen te staan.
 *
 * Een bestaand uur dat geen kwartier is (oudere data, of een rit die ooit met de
 * hand verschoven werd) komt erbij, want anders staat de keuzelijst leeg en
 * lijkt het uur van die rit verdwenen.
 */
export function quarterOptions(current: string): readonly string[] {
  if (!current || QUARTERS.includes(current)) return QUARTERS;
  return [...QUARTERS, current].sort();
}

/**
 * Minuten sinds het begin van de kalenderdag als klok, "08:30" (F6.25).
 *
 * Een kalenderdag kan voorbij middernacht doortellen (het intekenscherm loopt van
 * 05:00 tot 05:00, zie `dayStartHour`), maar de klok niet. **Enkel 24:00 zelf
 * blijft staan**: dat is het einde van de dag en niet het begin van de volgende,
 * en zo leest een band tot middernacht ook. Alles erna is de ochtend erna.
 *
 * Dit stond op `hours > 24`, en dat vergelijkt uren in plaats van minuten: 24:35
 * is nog "24 uur", bleef dus staan, en een band tot 00:35 stond als "24:35" op het
 * scherm. Logistiek las dat als "er zit blijkbaar meer dan 24u in een dag".
 */
export function clockLabel(minutes: number): string {
  const total = Math.round(minutes);
  const wrapped = total > 24 * 60 ? total % (24 * 60) : total;
  const hours = Math.floor(wrapped / 60);
  const rest = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
