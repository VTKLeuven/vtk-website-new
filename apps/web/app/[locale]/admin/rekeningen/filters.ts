import "server-only";

import type { Prisma } from "@prisma/client";
import {
  normaliseIban,
  parseDateInput,
  parsePostOptionValue,
  type ExpenseStatus,
  type ReimbursementState,
} from "@/lib/rekeningen/expenses";

/**
 * De filters van het overzicht, uit de URL en terug.
 *
 * Alles staat in de querystring en niets in clientstate: zo is een gefilterde
 * lijst een deelbare link ("de openstaande van Fakbar"), werkt de terugknop, en
 * blijft het filteren in de database gebeuren. Billsheet haalde álle rekeningen
 * op en filterde ze in de browser met Fuse.js; dat werkt tot het niet meer werkt.
 */

/**
 * Op indiendatum (de standaard) of op de datum van de uitgave. Op die laatste
 * zakte een rekening van een maand geleden die vandaag binnenkwam meteen onder
 * de vouw, en zag niemand ze.
 */
export type ExpenseSort = "submitted" | "spent";

export type ExpenseFilters = {
  year: number | "all";
  /** De workflowstap; enkel in de volledige weergave van Beheer. */
  status: ExpenseStatus | "all";
  /** Terugbetaald of niet; de weergave voor wie geen Beheer is. */
  reimbursement: ReimbursementState | "all";
  sort: ExpenseSort;
  q: string;
  groupId: string;
  from: string;
  to: string;
  min: string;
  max: string;
  payer: string;
  page: number;
  selected: string;
};

export type ExpenseSearchParams = Record<string, string | string[] | undefined>;

function one(params: ExpenseSearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

const STATUS_BY_SLUG: Record<string, ExpenseStatus> = {
  terugbetalen: "TO_REIMBURSE",
  doorsturen: "TO_SEND",
  inboeken: "TO_BOOK",
  klaar: "DONE",
};

export const STATUS_SLUGS: Record<ExpenseStatus, string> = {
  TO_REIMBURSE: "terugbetalen",
  TO_SEND: "doorsturen",
  TO_BOOK: "inboeken",
  DONE: "klaar",
};

const REIMBURSEMENT_BY_SLUG: Record<string, ReimbursementState> = {
  terugbetalen: "OPEN",
  terugbetaald: "PAID",
  kaart: "CARD",
};

export const REIMBURSEMENT_SLUGS: Record<ReimbursementState, string> = {
  OPEN: "terugbetalen",
  PAID: "terugbetaald",
  CARD: "kaart",
};

/** `?sorteer=datum` sorteert op de uitgave; zonder parameter op indiendatum. */
export const SPENT_SORT_SLUG = "datum";

/**
 * `full` is de volledige workflow van Beheer. Zonder geldt `?status=` als
 * terugbetaalfilter, zodat een gedeelde link uit de volledige weergave een lid
 * niet alsnog op "In te boeken" laat filteren.
 */
export function readFilters(
  params: ExpenseSearchParams,
  fallbackYear: number,
  full = true,
): ExpenseFilters {
  const rawYear = one(params, "jaar");
  let year: number | "all" = fallbackYear;
  if (rawYear === "alles") {
    year = "all";
  } else if (rawYear) {
    const parsedYear = Number(rawYear);
    if (Number.isInteger(parsedYear) && parsedYear > 0) {
      year = parsedYear;
    }
  }
  const statusSlug = one(params, "status");
  const status = full ? (STATUS_BY_SLUG[statusSlug] ?? "all") : "all";
  const reimbursement = full ? "all" : (REIMBURSEMENT_BY_SLUG[statusSlug] ?? "all");

  return {
    year,
    status,
    reimbursement,
    sort: one(params, "sorteer") === SPENT_SORT_SLUG ? "spent" : "submitted",
    q: one(params, "q").slice(0, 120),
    groupId: one(params, "post").slice(0, 80),
    from: one(params, "van").slice(0, 10),
    to: one(params, "tot").slice(0, 10),
    min: one(params, "min").slice(0, 20),
    max: one(params, "max").slice(0, 20),
    payer: one(params, "wie").slice(0, 120),
    page: Math.max(1, Number(one(params, "p")) || 1),
    selected: one(params, "sel").slice(0, 40),
  };
}

/** Een bedrag uit een filterveld naar centen. Nul mag hier wél. */
function filterCents(raw: string): number | null {
  if (!raw) return null;
  const normalised = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const value = Number(normalised);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** De `where` die bij deze filters hoort, zonder de statusselectie. */
export function filterWhere(filters: ExpenseFilters): Prisma.ExpenseWhereInput {
  const and: Prisma.ExpenseWhereInput[] = [];

  if (filters.year !== "all") and.push({ workingYear: filters.year });
  if (filters.groupId) {
    // `id:Praeses` is een deelpost van een opgesplitste post (Groep 5); de
    // deelpost staat in `postLabel`.
    const { groupId, sub } = parsePostOptionValue(filters.groupId);
    and.push(sub ? { groupId, postLabel: sub } : { groupId });
  }
  if (filters.payer) {
    and.push({ payerName: { contains: filters.payer, mode: "insensitive" } });
  }

  const from = parseDateInput(filters.from);
  const to = parseDateInput(filters.to);
  if (from || to) {
    and.push({ spentOn: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  }

  const min = filterCents(filters.min);
  const max = filterCents(filters.max);
  if (min !== null || max !== null) {
    and.push({
      amountCents: { ...(min !== null ? { gte: min } : {}), ...(max !== null ? { lte: max } : {}) },
    });
  }

  if (filters.q) {
    // Billsheet zocht "fuzzy" over dezelfde velden. Serverkant is dat een
    // OR van deelstrings; minder tolerant voor tikfouten, maar het zoekt wel over
    // de volledige historiek in plaats van over de bladzijde die toevallig
    // ingeladen was.
    const or: Prisma.ExpenseWhereInput[] = [
      { description: { contains: filters.q, mode: "insensitive" } },
      { activity: { contains: filters.q, mode: "insensitive" } },
      { comment: { contains: filters.q, mode: "insensitive" } },
      { payerName: { contains: filters.q, mode: "insensitive" } },
      { postLabel: { contains: filters.q, mode: "insensitive" } },
      { iban: { contains: normaliseIban(filters.q), mode: "insensitive" } },
    ];
    const asAmount = filterCents(filters.q);
    if (asAmount !== null) or.push({ amountCents: asAmount });
    and.push({ OR: or });
  }

  return and.length > 0 ? { AND: and } : {};
}

/** De `where` van één workflowstap. Zie `expenseStatus` voor de afleiding. */
export function statusWhere(status: ExpenseStatus): Prisma.ExpenseWhereInput {
  switch (status) {
    case "TO_REIMBURSE":
      return { bookedAt: null, paidAt: null };
    case "TO_SEND":
      return { bookedAt: null, paidAt: { not: null }, sentAt: null };
    case "TO_BOOK":
      return { bookedAt: null, paidAt: { not: null }, sentAt: { not: null } };
    case "DONE":
      return { bookedAt: { not: null } };
  }
}

/** De `where` van een terugbetaalstand. Zie `reimbursementState`. */
export function reimbursementWhere(state: ReimbursementState): Prisma.ExpenseWhereInput {
  switch (state) {
    case "OPEN":
      return { paymentMethod: "PERSONAL", paidAt: null };
    case "PAID":
      return { paymentMethod: "PERSONAL", paidAt: { not: null } };
    case "CARD":
      return { paymentMethod: "VTK_CARD" };
  }
}

/** De sortering van de lijst; de id als laatste sleutel houdt de paginering stabiel. */
export function expenseOrderBy(sort: ExpenseSort): Prisma.ExpenseOrderByWithRelationInput[] {
  return sort === "spent"
    ? [{ spentOn: "desc" }, { createdAt: "desc" }, { id: "desc" }]
    : [{ createdAt: "desc" }, { id: "desc" }];
}

/** Welke filters staan er aan, met de link die er één uitzet. */
export function activeFilterChips(
  filters: ExpenseFilters,
  nl: boolean,
  postName: (id: string) => string,
): Array<{ key: keyof ExpenseFilters | "amount" | "period"; label: string; clear: Partial<Record<string, string>> }> {
  const chips: Array<{
    key: keyof ExpenseFilters | "amount" | "period";
    label: string;
    clear: Partial<Record<string, string>>;
  }> = [];

  if (filters.q) {
    chips.push({ key: "q", label: `${nl ? "Zoeken" : "Search"}: ${filters.q}`, clear: { q: "" } });
  }
  if (filters.groupId) {
    chips.push({
      key: "groupId",
      label: `${nl ? "Post" : "Post"}: ${postName(filters.groupId)}`,
      clear: { post: "" },
    });
  }
  if (filters.payer) {
    chips.push({
      key: "payer",
      label: `${nl ? "Wie" : "Who"}: ${filters.payer}`,
      clear: { wie: "" },
    });
  }
  if (filters.from || filters.to) {
    chips.push({
      key: "period",
      label: `${nl ? "Periode" : "Period"}: ${filters.from || "…"} → ${filters.to || "…"}`,
      clear: { van: "", tot: "" },
    });
  }
  if (filters.min || filters.max) {
    chips.push({
      key: "amount",
      label: `${nl ? "Bedrag" : "Amount"}: ${filters.min || "0"} – ${filters.max || "…"}`,
      clear: { min: "", max: "" },
    });
  }

  return chips;
}
