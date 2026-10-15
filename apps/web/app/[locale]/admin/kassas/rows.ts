import "server-only";

import type { Prisma } from "@prisma/client";
import { formatSpentOn } from "@/lib/rekeningen/expenses";
import { resultFor, ticketIncomeByEvent } from "@/lib/kassas/server";
import { timeRangeShort, type CashRegisterResult, type CashRegisterStatus } from "@/lib/kassas/kassa";

/** Wat een lijst nodig heeft om het resultaat per kassa te rekenen. */
export const listInclude = {
  payments: { select: { method: true, terminal: true, amountCents: true }, orderBy: { sortOrder: "asc" } },
  ticketEvents: { select: { ticketEventId: true } },
} satisfies Prisma.CashRegisterInclude;

type ListSource = Prisma.CashRegisterGetPayload<{ include: typeof listInclude }>;

export type ListRow = {
  id: string;
  status: CashRegisterStatus;
  dateLabel: string;
  /** "20:00-23:00"; `null` bij een kassa van voor er naar de uren gevraagd werd. */
  timeLabel: string | null;
  activity: string;
  postLabel: string;
  responsibleName: string;
  /** "Bancontact Evenementen", of enkel "Bancontact" zolang Beheer er geen koos. */
  devices: string[];
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
    timeLabel: timeRangeShort(register.startsAt, register.endsAt),
    activity: register.activity,
    postLabel: register.postLabel,
    responsibleName: register.responsibleName,
    devices: devicesOf(register),
    counted: register.endCounts !== null,
    result: resultFor(register, income),
  }));
}

function devicesOf(register: ListSource): string[] {
  const devices: string[] = [];
  for (const [method, label, wanted] of [
    ["BANCONTACT", "Bancontact", register.wantsBancontact],
    ["PAYCONIQ", "Payconiq", register.wantsPayconiq],
  ] as const) {
    const names = register.payments.filter((payment) => payment.method === method).map((payment) => payment.terminal);
    if (names.length) devices.push(...names.map((name) => `${label} ${name}`));
    else if (wanted) devices.push(label);
  }
  return devices;
}
