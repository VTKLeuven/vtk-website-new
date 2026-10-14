import "server-only";

import { prisma } from "@vtk/db";
import type { SessionPayload } from "@vtk/auth";
import { getCurrentSession, requireSession } from "@/lib/session";
import {
  computeResult,
  DEFAULT_CASH_REGISTER_CONFIG,
  normaliseCounts,
  parseCashRegisterConfig,
  type CashRegisterConfig,
  type CashRegisterResult,
  type PaymentMethod,
} from "@/lib/kassas/kassa";

/**
 * Toegang, instellingen en de ticketinkomsten van de kassa's. De permissies
 * staan in `packages/db/src/permissions.ts`; hier staat wat ze mogen.
 *
 * Zoals bij de rekeningen toetst elke check de kassa zelf, serverkant: een id
 * uit de URL of uit een formulier geeft niets prijs wat het scherm niet toont.
 */

export type CashRegisterAccess = {
  session: SessionPayload;
  /** Mag een kassa aanvragen en de aanvragen van zichzelf en zijn posten zien. */
  canRequest: boolean;
  /** Beheer: alle kassa's, aanvaarden, status, tellen, instellingen. */
  canManage: boolean;
  /** De posten van de gebruiker dit werkingsjaar. */
  postIds: string[];
};

export function accessFor(session: SessionPayload): CashRegisterAccess {
  const has = (code: string) => session.user.isSuperAdmin || session.permissions.includes(code);
  const canManage = has("cashRegisters.manage");
  return {
    session,
    // Wie beheert, mag ook aanvragen: Beheer zet er zelf een in voor een
    // activiteit die enkel per mail aangevraagd werd.
    canRequest: canManage || has("cashRegisters.request"),
    canManage,
    postIds: session.groups.map((group) => group.id),
  };
}

/** Voor pagina's: aanmelden is verplicht, het scherm zegt zelf "geen toegang". */
export async function cashRegisterAccess(redirectTo: string): Promise<CashRegisterAccess> {
  return accessFor(await requireSession(redirectTo));
}

/** Voor server actions: gooit `UNAUTHENTICATED` of `FORBIDDEN`. */
export async function requireCashRegisterAccess(): Promise<CashRegisterAccess> {
  const session = await getCurrentSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  const access = accessFor(session);
  if (!access.canRequest) throw new Error("FORBIDDEN");
  return access;
}

type Owned = { requestedById: string | null; groupId: string | null; status: string };

/**
 * De kassa's die je ziet zonder beheerrecht: wat je zelf aanvroeg en wat op
 * een van je posten staat. Een post vraagt een kassa aan als ploeg; wie ze die
 * dag meeneemt, is niet altijd wie het formulier invulde.
 */
export function visibilityWhere(access: CashRegisterAccess) {
  if (access.canManage) return undefined;
  return {
    OR: [{ requestedById: access.session.user.id }, { groupId: { in: access.postIds } }],
  };
}

export function canView(access: CashRegisterAccess, register: Owned): boolean {
  if (access.canManage) return true;
  if (register.requestedById === access.session.user.id) return true;
  return register.groupId !== null && access.postIds.includes(register.groupId);
}

/**
 * Aanpassen en intrekken mag de post zelf zolang Beheer niet aanvaardde. Daarna
 * maakt Beheer de kassa met wat er stond, en een stille wijziging zou dan een
 * kassa met het verkeerde wisselgeld opleveren; wie nog iets wil, vraagt het.
 */
export function canEditRequest(access: CashRegisterAccess, register: Owned): boolean {
  if (access.canManage) return true;
  return register.status === "REQUESTED" && canView(access, register);
}

// -----------------------------------------------------------------------------
// Instellingen
// -----------------------------------------------------------------------------

export const CASH_REGISTER_CONFIG_KEY = "cashRegisters.config";

export async function getCashRegisterConfig(): Promise<CashRegisterConfig> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: CASH_REGISTER_CONFIG_KEY } });
    return parseCashRegisterConfig(row?.value);
  } catch {
    return DEFAULT_CASH_REGISTER_CONFIG;
  }
}

// -----------------------------------------------------------------------------
// Ticketinkomsten
// -----------------------------------------------------------------------------

/**
 * Netto online verkoop per ticketevent, in centen: elk uitgegeven ticket aan de
 * prijs waarvoor het verkocht werd, min wat effectief teruggestort is. Dezelfde
 * regel als de "netto" in de ticketstatistieken (`computeTicketStats`), zodat
 * de kassa en de verkoop hetzelfde bedrag tonen.
 *
 * Telkens opnieuw berekend en nooit opgeslagen: een terugbetaling na de
 * telling staat zo meteen in het resultaat.
 */
export async function ticketIncomeByEvent(eventIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(eventIds)];
  const income = new Map<string, number>(ids.map((id) => [id, 0]));
  if (ids.length === 0) return income;

  const [sold, refunded] = await Promise.all([
    prisma.ticketOrderItem.groupBy({
      by: ["eventId"],
      where: { eventId: { in: ids }, ticket: { isNot: null } },
      _sum: { totalCents: true },
    }),
    prisma.ticketRefundItem.findMany({
      where: { orderItem: { eventId: { in: ids } }, refund: { status: "SUCCEEDED" } },
      select: { amountCents: true, orderItem: { select: { eventId: true } } },
    }),
  ]);
  for (const row of sold) income.set(row.eventId, row._sum.totalCents ?? 0);
  for (const item of refunded) {
    const eventId = item.orderItem.eventId;
    income.set(eventId, (income.get(eventId) ?? 0) - item.amountCents);
  }
  return income;
}

/** Wat `computeResult` nodig heeft, zoals het uit de database komt. */
export type ResultSource = {
  startCounts: unknown;
  endCounts: unknown;
  shiftVouchers: number | null;
  elixirVouchers: number | null;
  shiftVoucherValueCents: number;
  elixirVoucherValueCents: number;
  payments: Array<{ method: PaymentMethod; amountCents: number | null }>;
  ticketEvents: Array<{ ticketEventId: string }>;
};

export function resultFor(register: ResultSource, income: Map<string, number>): CashRegisterResult {
  return computeResult({
    startCounts: normaliseCounts(register.startCounts),
    endCounts: register.endCounts === null ? null : normaliseCounts(register.endCounts),
    shiftVouchers: register.shiftVouchers,
    elixirVouchers: register.elixirVouchers,
    shiftVoucherValueCents: register.shiftVoucherValueCents,
    elixirVoucherValueCents: register.elixirVoucherValueCents,
    payments: register.payments,
    ticketIncomeCents: register.ticketEvents.map((link) => income.get(link.ticketEventId) ?? 0),
  });
}
