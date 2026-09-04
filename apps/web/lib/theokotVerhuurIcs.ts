import "server-only";

import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { siteBaseUrl } from "@/lib/calendar/feeds";
import { buildIcs, type IcsCalendar, type IcsEvent } from "@/lib/calendar/ics";
import {
  CONTRACT_STATE_META,
  DEPOSIT_STATE_META,
  KEY_STATE_META,
  RENTAL_STATUS_META,
  type ContractState,
  type DepositChoice,
  type DepositState,
  type KeyState,
  type RentalStatus,
} from "@/lib/theokotVerhuur";
import { depositChoiceLabel } from "@/lib/theokotVerhuur-server";

/**
 * iCalendar RFC 5545 export voor de Theokot-verhuurkalender.
 *
 * Bevat zowel de goedgekeurde verhuren als de nieuwe aanvragen (onbeantwoord),
 * zodat wie de zaal beheert nieuwe aanvragen direct in zijn eigen agenda ziet
 * verschijnen zonder naar de website te moeten surfen.
 */

export type RentalIcsRow = {
  id: string;
  responsibleName: string;
  phone: string;
  email: string;
  startsAt: Date;
  endsAt: Date;
  purpose: string;
  attendees: number | null;
  remarks: string | null;
  depositChoice: DepositChoice;
  deposit: DepositState;
  contract: ContractState;
  keyStatus: KeyState;
  status: RentalStatus;
  internalNote: string | null;
  updatedAt: Date;
};

export type RentalFeedOptions = {
  statusFilter?: "all" | "approved";
  includeDeclined?: boolean;
};

/**
 * Pure serialisatiefunctie voor de Theokot-verhuurkalender.
 * Volledig unit-testbaar zonder database.
 */
export function serializeRentalCalendar(
  rentals: RentalIcsRow[],
  options: {
    locale: Locale;
    origin?: string;
    refreshInterval?: string;
    now?: Date;
  },
): string {
  const { locale, origin = siteBaseUrl(), refreshInterval = "PT1H", now = new Date() } = options;
  const nl = locale === "nl";
  const adminUrl = `${origin}/admin/theokot/verhuur?tab=kalender`;

  const events: IcsEvent[] = rentals.map((rental) => {
    const meta = RENTAL_STATUS_META[rental.status];
    const statusLabel = meta ? meta[locale] : rental.status;

    const prefix =
      rental.status === "UNANSWERED"
        ? nl
          ? "[Aanvraag]"
          : "[Request]"
        : rental.status === "APPROVED"
          ? nl
            ? "[Goedgekeurd]"
            : "[Approved]"
          : `[${statusLabel}]`;

    const cleanPurpose = rental.purpose.replace(/\r?\n/g, " ").trim();
    const summary = `${prefix} ${rental.responsibleName} – ${cleanPurpose}`;

    const lines: string[] = [
      `${nl ? "Status" : "Status"}: ${statusLabel}`,
      `${nl ? "Verantwoordelijke" : "Responsible"}: ${rental.responsibleName} (${rental.email}${rental.phone ? `, ${rental.phone}` : ""})`,
      `${nl ? "Activiteit" : "Activity"}: ${cleanPurpose}`,
    ];

    if (rental.attendees !== null) {
      lines.push(`${nl ? "Verwachte aanwezigen" : "Expected attendees"}: ${rental.attendees}`);
    }

    const depositChoiceText = depositChoiceLabel(rental.depositChoice, locale);
    const depositStateText = DEPOSIT_STATE_META[rental.deposit]?.[locale] ?? rental.deposit;
    const contractStateText = CONTRACT_STATE_META[rental.contract]?.[locale] ?? rental.contract;
    const keyStateText = KEY_STATE_META[rental.keyStatus]?.[locale] ?? rental.keyStatus;

    lines.push(
      `${nl ? "Waarborg" : "Deposit"}: ${depositStateText} (${depositChoiceText})`,
      `Contract: ${contractStateText}`,
      `${nl ? "Sleutel" : "Key"}: ${keyStateText}`,
    );

    if (rental.remarks?.trim()) {
      lines.push(`${nl ? "Opmerkingen" : "Remarks"}: ${rental.remarks.trim()}`);
    }
    if (rental.internalNote?.trim()) {
      lines.push(`${nl ? "Interne notitie" : "Internal note"}: ${rental.internalNote.trim()}`);
    }

    lines.push("", `${nl ? "Bekijk in beheer" : "View in admin"}: ${adminUrl}`);

    return {
      uid: `theokot-rental-${rental.id}@vtk.be`,
      start: rental.startsAt,
      end: rental.endsAt,
      allDay: false,
      summary,
      description: lines.join("\n"),
      location: "Theokot, Kasteelpark Arenberg 41, 3001 Heverlee",
      categories: ["Theokot", nl ? "Verhuur" : "Rentals", statusLabel],
      url: adminUrl,
      updatedAt: rental.updatedAt,
      private: true,
    };
  });

  const calendar: IcsCalendar = {
    name: nl ? "Theokot Verhuur" : "Theokot Rentals",
    description: nl
      ? "Verhuurkalender van het Theokot (aanvragen en goedgekeurde verhuren)"
      : "Theokot rental calendar (requests and approved rentals)",
    url: adminUrl,
    refreshInterval,
    events,
  };

  return buildIcs(calendar, now);
}

/**
 * Haalt de verhuren op en bouwt de iCalendar RFC 5545 feed.
 */
export async function buildRentalFeed(
  options: RentalFeedOptions,
  locale: Locale,
  now = new Date(),
): Promise<string> {
  const windowFrom = new Date(now);
  windowFrom.setMonth(windowFrom.getMonth() - 12);
  const windowTo = new Date(now);
  windowTo.setMonth(windowTo.getMonth() + 24);

  const statusFilter = options.statusFilter ?? "all";
  const includeDeclined = options.includeDeclined ?? false;

  let statusWhere: { in?: RentalStatus[]; notIn?: RentalStatus[] } | undefined;
  if (statusFilter === "approved") {
    statusWhere = { in: ["APPROVED", "ENDED", "COMPLETED"] };
  } else if (!includeDeclined) {
    statusWhere = { notIn: ["REJECTED", "CANCELLED"] };
  }

  const rows = await prisma.theokotRental.findMany({
    where: {
      startsAt: { gte: windowFrom, lte: windowTo },
      ...(statusWhere ? { status: statusWhere } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      responsibleName: true,
      phone: true,
      email: true,
      startsAt: true,
      endsAt: true,
      purpose: true,
      attendees: true,
      remarks: true,
      depositChoice: true,
      deposit: true,
      contract: true,
      keyStatus: true,
      status: true,
      internalNote: true,
      updatedAt: true,
    },
  });

  return serializeRentalCalendar(rows, { locale, now });
}
