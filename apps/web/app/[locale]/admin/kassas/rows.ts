import "server-only";

import type { Prisma } from "@prisma/client";
import { formatSpentOn } from "@/lib/rekeningen/expenses";
import { resultFor, ticketIncomeByEvent } from "@/lib/kassas/server";
import type { CashRegisterResult, CashRegisterStatus } from "@/lib/kassas/kassa";

/** Wat een lijst nodig heeft om het resultaat per kassa te rekenen. */
export const listInclude = {
  payments: { select: { method: true, amountCents: true } },
  ticketEvents: { select: { ticketEventId: true } },
} satisfies Prisma.CashRegisterInclude;

type ListSource = Prisma.CashRegisterGetPayload<{ include: typeof listInclude }>;

export type ListRow = {
  id: string;
  status: CashRegisterStatus;
  dateLabel: string;
  activity: string;
  postLabel: string;
  responsibleName: string;
  wantsBancontact: boolean;
  wantsPayconiq: boolean;
  counted: boolean;
  result: CashRegisterResult;
};

/**
 * Rijen voor het overzicht en voor "mijn aanvragen", met het resultaat per kassa.
 * De ticketinkomsten komen in één query voor de hele lijst.
 */
export async function toListRows(registers: ListSource[], locale: "nl" | "en"): Promise<ListRow[]> {
  const income = await ticketIncomeByEvent(
    registers.flatMap((register) => register.ticketEvents.map((link) => link.ticketEventId)),
  );
  return registers.map((register) => ({
    id: register.id,
    status: register.status,
    dateLabel: formatSpentOn(register.date, locale),
    activity: register.activity,
    postLabel: register.postLabel,
    responsibleName: register.responsibleName,
    wantsBancontact: register.wantsBancontact,
    wantsPayconiq: register.wantsPayconiq,
    counted: register.endCounts !== null,
    result: resultFor(register, income),
  }));
}
