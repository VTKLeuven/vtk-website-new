import "server-only";

import { prisma } from "@vtk/db";
import type { SessionPayload } from "@vtk/auth";
import { getCurrentSession, requireSession } from "@/lib/session";
import { preferredEmail } from "@/lib/brevo/contacts";
import { formatSpentOn } from "@/lib/rekeningen/expenses";
import {
  computeResult,
  DEFAULT_CASH_REGISTER_CONFIG,
  intervalsOverlap,
  normaliseCounts,
  parseCashRegisterConfig,
  registerInterval,
  resultSharedWithPost,
  timeRangeShort,
  type CashRegisterConfig,
  type CashRegisterResult,
  type CashRegisterStatus,
  type Interval,
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
 * Het resultaat (telling, Bancontact, Payconiq, ticketverkoop, bonnen) ziet
 * Beheer altijd, de post pas vanaf "doorgegeven" (`resultSharedWithPost`).
 */
export function canSeeResult(
  access: CashRegisterAccess,
  register: Owned & { status: CashRegisterStatus },
): boolean {
  if (access.canManage) return true;
  return resultSharedWithPost(register.status) && canView(access, register);
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

/**
 * Waar de mail over een kassa heen gaat: het `@vtk.be`-adres, en enkel zonder
 * dat het voorkeursadres. Een kassa vraag je aan als lid van een post, en dat is
 * werk van de kring; de mailvoorkeur in het profiel kiest tussen het
 * universiteits- en het persoonlijke adres, en is er voor wat de site aan
 * iedereen stuurt.
 */
export function cashRegisterMailTo(
  user: Parameters<typeof preferredEmail>[0] & { googleEmail: string | null },
): string {
  return user.googleEmail ?? preferredEmail(user);
}

// -----------------------------------------------------------------------------
// Bezette toestellen
// -----------------------------------------------------------------------------

export type TerminalChoice = { method: PaymentMethod; terminal: string };

export type TerminalUse = TerminalChoice & {
  activity: string;
  postLabel: string;
  date: Date;
  startsAt: Date | null;
  endsAt: Date | null;
};

/**
 * De Bancontact-bakjes en Payconiq-rekeningen die een andere kassa gebruikt
 * terwijl deze loopt. Een toestel staat op een kassa als betaalregel, met of
 * zonder bedrag: Beheer kiest het bij het aanvaarden, en vanaf dan is het weg.
 *
 * De databank zoekt ruim op datum (een activiteit kan over middernacht lopen);
 * of de uren elkaar echt raken, rekent `intervalsOverlap`.
 */
export async function terminalsInUse(registerId: string, interval: Interval): Promise<TerminalUse[]> {
  const DAY = 86_400_000;
  const rows = await prisma.cashRegisterPayment.findMany({
    where: {
      registerId: { not: registerId },
      register: {
        date: {
          gte: new Date(interval.start.getTime() - 2 * DAY),
          lte: new Date(interval.end.getTime() + DAY),
        },
      },
    },
    select: {
      method: true,
      terminal: true,
      register: { select: { activity: true, postLabel: true, date: true, startsAt: true, endsAt: true } },
    },
  });
  return rows
    .filter((row) => intervalsOverlap(interval, registerInterval(row.register)))
    .map((row) => ({ method: row.method, terminal: row.terminal, ...row.register }));
}

/** Hetzelfde toestel? Op soort en naam, zoals het op de kassa staat. */
export function sameTerminal(a: TerminalChoice, b: TerminalChoice): boolean {
  return a.method === b.method && a.terminal === b.terminal;
}

/**
 * Het eerste gekozen toestel dat al op een andere kassa staat, als zinsdeel voor
 * de toast ("het Bancontact-bakje Evenementen is dan al uitgeleend aan ...");
 * `null` wanneer alles vrij is. Het noemt de andere kassa, zodat Beheer weet
 * waar het toestel dan is.
 */
export async function terminalConflict(
  registerId: string,
  interval: Interval,
  chosen: TerminalChoice[],
): Promise<string | null> {
  if (chosen.length === 0) return null;
  const inUse = await terminalsInUse(registerId, interval);
  for (const choice of chosen) {
    const other = inUse.find((use) => sameTerminal(use, choice));
    if (other) return `${terminalLabel(choice)} is dan al uitgeleend aan ${terminalUseLabel(other)}`;
  }
  return null;
}

export function terminalLabel(choice: TerminalChoice): string {
  return choice.method === "BANCONTACT"
    ? `het Bancontact-bakje ${choice.terminal}`
    : `de Payconiq-rekening ${choice.terminal}`;
}

/** "Croque bar (Cultuur), 19/10/2026 20:00-23:00". */
export function terminalUseLabel(use: TerminalUse): string {
  const hours = timeRangeShort(use.startsAt, use.endsAt);
  return `${use.activity} (${use.postLabel}), ${formatSpentOn(use.date)}${hours ? ` ${hours}` : ", de hele dag"}`;
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
