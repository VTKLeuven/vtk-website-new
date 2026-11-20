/**
 * De instelbare kant van het lidmaatschap: de prijs voor een niet-facultair lid
 * en voor een betalend erelid, en of die wegen naar een lidmaatschap openstaan.
 *
 * Bewust een `Setting` en geen constante: de prijs is een bestuursbeslissing die
 * per academiejaar kan wijzigen, en dat hoort geen deploy te vragen. De pure
 * parser staat hier los van prisma, zodat hij zonder database te testen is en
 * ook in een clientcomponent gelezen mag worden.
 */

export const MEMBERSHIP_CONFIG_KEY = "leden.config";

export type MembershipConfig = {
  /** Wat een niet-facultair lidmaatschap kost, in cent. */
  externalPriceCents: number;
  /** Staat de gratis weg open voor studenten van de faculteit? */
  facultyOpen: boolean;
  /** Staat de betalende weg open voor wie niet aan de faculteit studeert? */
  externalOpen: boolean;
  /** Wat een betalend erelidmaatschap voor één academiejaar kost, in cent. */
  honoraryPriceCents: number;
  /** Kan wie geen student is zichzelf betalend erelid maken op /lidmaatschap? */
  honoraryOpen: boolean;
  /**
   * De boekhoudcode die met het lidgeld meegaat in de betaalinfo. Null = de
   * standaard, 730000 Lidgelden (`MEMBERSHIP_DEFAULT_ACCOUNTING_CODE`). Een id
   * en geen code, zodat hernoemen of hernummeren in /admin/boekhoudcodes de
   * keuze niet breekt.
   */
  accountingCodeId: string | null;
};

export const DEFAULT_MEMBERSHIP_CONFIG: MembershipConfig = {
  externalPriceCents: 2500,
  facultyOpen: true,
  externalOpen: true,
  honoraryPriceCents: 7500,
  honoraryOpen: true,
  accountingCodeId: null,
};

/** Bovengrens op de prijs: een typfout van een nul mag geen €250 worden. */
export const MAX_MEMBERSHIP_PRICE_CENTS = 20_000;

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function price(value: unknown, fallback: number, min = 0): number {
  const cents = Number(value);
  return Number.isInteger(cents) && cents >= min && cents <= MAX_MEMBERSHIP_PRICE_CENTS
    ? cents
    : fallback;
}

/**
 * Alles wat we niet herkennen valt terug op de standaard. Een stukgelopen of
 * half ingevulde instelling mag het lidmaatschap nooit gratis maken.
 */
export function parseMembershipConfig(raw: unknown): MembershipConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_MEMBERSHIP_CONFIG;
  }
  const value = raw as Record<string, unknown>;
  return {
    externalPriceCents: price(value.externalPriceCents, DEFAULT_MEMBERSHIP_CONFIG.externalPriceCents),
    facultyOpen: boolean(value.facultyOpen, DEFAULT_MEMBERSHIP_CONFIG.facultyOpen),
    externalOpen: boolean(value.externalOpen, DEFAULT_MEMBERSHIP_CONFIG.externalOpen),
    // Een erelidmaatschap is altijd betalend: een prijs van 0 zou iedereen
    // zonder studie gratis erelid laten worden, en daar is de vlag voor.
    honoraryPriceCents: price(value.honoraryPriceCents, DEFAULT_MEMBERSHIP_CONFIG.honoraryPriceCents, 1),
    honoraryOpen: boolean(value.honoraryOpen, DEFAULT_MEMBERSHIP_CONFIG.honoraryOpen),
    accountingCodeId:
      typeof value.accountingCodeId === "string" && value.accountingCodeId
        ? value.accountingCodeId
        : null,
  };
}

/** "€25" of "€12,50": hele euro's krijgen geen nullen achter de komma. */
export function formatEuro(cents: number, locale: "nl" | "en" = "nl"): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
