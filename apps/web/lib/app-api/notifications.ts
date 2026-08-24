import "server-only";

import { prisma } from "@vtk/db";

import { sendPushToUsers } from "./push";

/**
 * De pushberichten die vanzelf vertrekken.
 *
 * Wat hier staat, is de vertaling van een kringkeuze: **wanneer is een bericht
 * op een telefoon gerechtvaardigd?** Zie `docs/design-decisions.md`, sectie
 * "Wanneer de app een pushbericht stuurt". De korte versie: enkel wanneer de
 * gebruiker iets moet dóén en het anders misloopt. Nieuws is geen pushbericht.
 *
 * Elk bericht volgt dezelfde aanpak als de shift-herinneringen per mail: **eerst
 * claimen, dan versturen.** De markering gaat om in een voorwaardelijke
 * `updateMany`, en enkel wie die update wint, verstuurt. Een mislukte verzending
 * zet de markering niet terug: bij twijfel liever geen bericht dan twee. Iemand
 * twee keer wakker maken voor hetzelfde broodje is erger dan het één keer missen.
 */

export type NotificationRun = {
  /** Hoeveel gebruikers er een bericht kregen. */
  users: number;
  /** Hoeveel toestellen dat waren. */
  devices: number;
};

/**
 * "Je broodje ligt klaar", op het moment dat de afhaal opengaat.
 *
 * Enkel voor bestellingen die nog `RESERVED` staan: wie al opgehaald heeft, hoeft
 * niets te horen. En enkel wanneer de afhaal effectief begonnen is; een bericht
 * een uur te vroeg stuurt iemand naar een gesloten deur.
 *
 * De bovengrens op `pickupStart` is er voor het geval de worker een tijd
 * stilgelegen heeft. Zonder die grens zou de eerste run daarna alsnog berichten
 * sturen voor broodjes van gisteren.
 */
export async function sendTheokotPickupPush(now: Date = new Date()): Promise<NotificationRun> {
  const orders = await prisma.theokotOrder.findMany({
    where: {
      status: "RESERVED",
      pickupPushedAt: null,
      session: {
        pickupStart: { lte: now, gte: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
        pickupEnd: { gte: now },
      },
    },
    select: { id: true, userId: true },
  });

  const claimed: string[] = [];
  for (const order of orders) {
    const { count } = await prisma.theokotOrder.updateMany({
      where: { id: order.id, pickupPushedAt: null },
      data: { pickupPushedAt: now },
    });
    if (count > 0) claimed.push(order.userId);
  }

  if (claimed.length === 0) return { users: 0, devices: 0 };

  const outcome = await sendPushToUsers(claimed, {
    title: "Je broodje ligt klaar",
    body: "Je kan het nu ophalen aan het Theokot.",
    path: "/bestellen",
  });

  return { users: claimed.length, devices: outcome.sent };
}

/**
 * Een herinnering aan een shift die zo begint.
 *
 * Wordt aangeroepen vanuit `processDueShiftReminders`, binnen dezelfde claim als
 * de herinneringsmail. Dat is met opzet: "de herinnering voor dit venster is
 * afgehandeld" hoort één ding te betekenen, niet twee die uit elkaar kunnen
 * lopen. Wie geen app heeft, krijgt gewoon enkel de mail.
 */
export async function sendShiftReminderPush(
  userId: string,
  shift: { name: string; startsSoon: boolean },
): Promise<void> {
  await sendPushToUsers([userId], {
    title: shift.startsSoon ? "Je shift begint zo" : "Morgen sta je ingepland",
    body: shift.name,
    path: "/shiften",
  });
}
