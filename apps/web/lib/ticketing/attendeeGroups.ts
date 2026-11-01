/**
 * Wie er met een ticket komt: praesidium, erelid, lid of niet-lid.
 *
 * Eén groep per deelnemer, in deze volgorde van voorrang: wie in het praesidium
 * zit en ook lid is, telt als praesidium. Zo telt het overzicht in de
 * statistieken op tot het totaal, en zegt een filter op de deelnemerslijst
 * hetzelfde als dat getal.
 *
 * Het gaat om de **deelnemer**, niet om de koper: een lid dat vier tickets koopt
 * voor vrienden, brengt geen vier leden mee. Een deelnemer koppelen we aan een
 * account langs zijn e-mailadres (het eerste ticket van een ingelogde koper
 * draagt dat van zijn account), zijn r-nummer, of, zonder e-mailadres, de naam
 * van de koper. Wie we zo niet terugvinden, is niet-lid: dat is precies wat we
 * van die persoon weten. Een ticket aan de ereledenprijs is altijd een erelid.
 *
 * Puur, zodat het zonder databank te testen is; het opzoeken van de accounts
 * staat in `attendeeAccounts.ts`.
 */

export const ATTENDEE_GROUPS = ["PRAESIDIUM", "HONORARY", "MEMBER", "NON_MEMBER"] as const;
export type AttendeeGroup = (typeof ATTENDEE_GROUPS)[number];

export function parseAttendeeGroup(value: string | null | undefined): AttendeeGroup | null {
  return ATTENDEE_GROUPS.find((group) => group === value) ?? null;
}

/** Wat we over het account van een deelnemer weten. */
export type AttendeeAccount = {
  id: string;
  email: string;
  rNumber: string | null;
  /** In een praesidiumpost van het lopende werkingsjaar. */
  praesidium: boolean;
  honorary: boolean;
  /** Lid volgens `lib/membership` (FirW-student of een actief lidmaatschap). */
  member: boolean;
};

export type AttendeeGroupItem = {
  attendeeName: string;
  attendeeEmail: string | null;
  rNumber: string | null;
  honoraryPrice: boolean;
  order: { buyerUserId: string | null; buyerName: string };
};

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-BE");
}

/**
 * Hoort deze deelnemer bij het account van de koper zelf? Enkel zonder eigen
 * e-mailadres en met dezelfde naam: met een e-mailadres beslist dat adres.
 */
export function isBuyersOwnTicket(item: AttendeeGroupItem): boolean {
  return (
    item.order.buyerUserId !== null &&
    !item.attendeeEmail &&
    normalizedName(item.attendeeName) === normalizedName(item.order.buyerName)
  );
}

export type AttendeeAccountIndex = {
  byEmail: Map<string, AttendeeAccount>;
  byRNumber: Map<string, AttendeeAccount>;
  byId: Map<string, AttendeeAccount>;
};

export function indexAttendeeAccounts(accounts: AttendeeAccount[]): AttendeeAccountIndex {
  const index: AttendeeAccountIndex = { byEmail: new Map(), byRNumber: new Map(), byId: new Map() };
  for (const account of accounts) {
    index.byEmail.set(account.email.toLowerCase(), account);
    if (account.rNumber) index.byRNumber.set(account.rNumber.toLowerCase(), account);
    index.byId.set(account.id, account);
  }
  return index;
}

export function attendeeAccount(
  item: AttendeeGroupItem,
  index: AttendeeAccountIndex,
): AttendeeAccount | null {
  if (item.attendeeEmail) {
    const byEmail = index.byEmail.get(item.attendeeEmail.toLowerCase());
    if (byEmail) return byEmail;
  }
  if (item.rNumber) {
    const byRNumber = index.byRNumber.get(item.rNumber.toLowerCase());
    if (byRNumber) return byRNumber;
  }
  if (isBuyersOwnTicket(item)) return index.byId.get(item.order.buyerUserId!) ?? null;
  return null;
}

export function attendeeGroup(item: AttendeeGroupItem, account: AttendeeAccount | null): AttendeeGroup {
  if (account?.praesidium) return "PRAESIDIUM";
  if (item.honoraryPrice || account?.honorary) return "HONORARY";
  if (account?.member) return "MEMBER";
  return "NON_MEMBER";
}

export function attendeeGroupLabel(group: AttendeeGroup, locale: "nl" | "en", plural = false): string {
  const labels: Record<AttendeeGroup, { nl: [string, string]; en: [string, string] }> = {
    PRAESIDIUM: { nl: ["Praesidium", "Praesidium"], en: ["Praesidium", "Praesidium"] },
    HONORARY: { nl: ["Erelid", "Ereleden"], en: ["Honorary member", "Honorary members"] },
    MEMBER: { nl: ["Lid", "Leden"], en: ["Member", "Members"] },
    NON_MEMBER: { nl: ["Niet-lid", "Niet-leden"], en: ["Non-member", "Non-members"] },
  };
  return labels[group][locale][plural ? 1 : 0];
}
