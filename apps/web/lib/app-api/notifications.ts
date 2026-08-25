import "server-only";

import { prisma } from "@vtk/db";

import { audiencesForStudyProfile } from "@/lib/calendar/audience";

import { usersWantingTopic } from "./notificationPrefs";
import { dayStart, isLive } from "./study";
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

  // De claim staat al, ook voor wie dit soort bericht uitgezet heeft. Dat is met
  // opzet: zet hij het morgen weer aan, dan hoort hij niets meer over het broodje
  // van vandaag. Een claim die pas na de voorkeurscontrole valt, zou dat broodje
  // op de volgende beurt alsnog aankondigen.
  const wanting = await usersWantingTopic(claimed, "theokot.pickup");
  if (wanting.length === 0) return { users: 0, devices: 0 };

  const outcome = await sendPushToUsers(wanting, {
    title: "Je broodje ligt klaar",
    body: "Je kan het nu ophalen aan het Theokot.",
    path: "/broodjes",
  });

  return { users: wanting.length, devices: outcome.sent };
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
  const wanting = await usersWantingTopic([userId], "shift.reminder");
  if (wanting.length === 0) return;

  await sendPushToUsers(wanting, {
    title: shift.startsSoon ? "Je shift begint zo" : "Morgen sta je ingepland",
    body: shift.name,
    path: "/shiften",
  });
}

/**
 * "De bestelronde is open."
 *
 * Dit is het enige bericht dat naar iedereen met de app gaat en niet naar een
 * handvol mensen die iets openstaan hebben. Dat is verdedigbaar omdat een gemiste
 * ronde betekent dat je die dag geen lunch hebt, en omdat de deadline uren voor
 * het eten ligt: wie het pas 's middags leest, is te laat. Wie het niet wil, zet
 * `theokot.open` uit en hoort er nooit meer iets van.
 *
 * De bovengrens op `orderOpenAt` is er voor het geval de worker heeft stilgelegen.
 * Zonder die grens zou de eerste beurt daarna alsnog de ronde van eergisteren
 * aankondigen.
 */
export async function sendTheokotOrderOpenPush(now: Date = new Date()): Promise<NotificationRun> {
  const sessions = await prisma.theokotSession.findMany({
    where: {
      isOpen: true,
      orderOpenPushedAt: null,
      orderOpenAt: { lte: now, gte: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
      orderCloseAt: { gt: now },
    },
    select: { id: true, date: true },
  });
  if (sessions.length === 0) return { users: 0, devices: 0 };

  const claimed: typeof sessions = [];
  for (const session of sessions) {
    const { count } = await prisma.theokotSession.updateMany({
      where: { id: session.id, orderOpenPushedAt: null },
      data: { orderOpenPushedAt: now },
    });
    if (count > 0) claimed.push(session);
  }
  if (claimed.length === 0) return { users: 0, devices: 0 };

  // Iedereen die de app heeft. Uitgelogde toestellen bestaan niet in deze tabel:
  // een pushtoken wordt enkel geregistreerd met een sessie.
  const devices = await prisma.appPushDevice.findMany({ select: { userId: true } });
  const wanting = await usersWantingTopic(
    devices.map((device) => device.userId),
    "theokot.open",
  );
  if (wanting.length === 0) return { users: 0, devices: 0 };

  const dayFormat = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  let sent = 0;
  for (const session of claimed) {
    const outcome = await sendPushToUsers(wanting, {
      title: "De broodjes staan open",
      body: `Bestellen voor ${dayFormat.format(session.date)} kan nu.`,
      path: "/broodjes",
    });
    sent += outcome.sent;
  }

  return { users: wanting.length * claimed.length, devices: sent };
}

/**
 * "Er staat iets nieuws in een categorie die je volgt."
 *
 * Het enige bericht dat geen "je moet nu iets doen" is. Het mag omdat een lid er
 * zelf om vroeg, per categorie, en het met één tik weer uit kan.
 *
 * Twee grenzen die er echt toe doen:
 *
 * - **Enkel wat net gepubliceerd is** (binnen het venster hieronder). Zonder die
 *   grens zou de eerste beurt na het uitrollen van deze functie de volledige
 *   kalendergeschiedenis aankondigen, want die evenementen hebben allemaal nog
 *   geen markering.
 * - **De doelgroepfilter geldt ook hier.** Een evenement voor eerstejaars hoort
 *   niet op de telefoon van iemand uit de master, ook niet wanneer die de
 *   categorie volgt. Dat is dezelfde regel als op de site; ze staat hier apart
 *   omdat een pushbericht geen `where` op een lezer heeft.
 */
const ANNOUNCE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sendCalendarFollowPush(now: Date = new Date()): Promise<NotificationRun> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      announcedPushAt: null,
      visibility: "PUBLIC",
      publishedAt: { not: null, gte: new Date(now.getTime() - ANNOUNCE_WINDOW_MS) },
      start: { gte: now },
      categories: { some: { category: { followers: { some: {} } } } },
    },
    select: {
      id: true,
      titleNl: true,
      start: true,
      categories: {
        select: {
          category: {
            select: {
              audience: true,
              nameNl: true,
              followers: { select: { userId: true } },
            },
          },
        },
      },
    },
    take: 50,
  });
  if (events.length === 0) return { users: 0, devices: 0 };

  let users = 0;
  let devices = 0;

  for (const event of events) {
    const { count } = await prisma.calendarEvent.updateMany({
      where: { id: event.id, announcedPushAt: null },
      data: { announcedPushAt: now },
    });
    if (count === 0) continue;

    const followers = [
      ...new Set(
        event.categories.flatMap(({ category }) =>
          category.followers.map((follower) => follower.userId),
        ),
      ),
    ];
    const audiences = event.categories
      .map(({ category }) => category.audience)
      .filter((audience): audience is NonNullable<typeof audience> => audience !== null);

    const eligible =
      audiences.length === 0 ? followers : await withinAudience(followers, audiences);
    const wanting = await usersWantingTopic(eligible, "calendar.follow");
    if (wanting.length === 0) continue;

    const categoryName = event.categories[0]?.category.nameNl ?? "de kalender";
    const outcome = await sendPushToUsers(wanting, {
      title: `Nieuw in ${categoryName}`,
      body: event.titleNl,
      path: `/evenement/${event.id}`,
    });
    users += wanting.length;
    devices += outcome.sent;
  }

  return { users, devices };
}

/**
 * De herinnering aan een evenement waarin je interesse aanduidde.
 *
 * Eén dag vooruit, want dat is het moment waarop je er nog iets aan kan doen:
 * een ticket kopen, je avond vrijhouden, met iemand afspreken. Een bericht een
 * kwartier vooraf is een verwijt.
 */
const INTEREST_REMINDER_MS = 24 * 60 * 60 * 1000;

export async function sendInterestReminderPush(now: Date = new Date()): Promise<NotificationRun> {
  const interests = await prisma.calendarEventInterest.findMany({
    where: {
      remindedAt: null,
      event: {
        start: { gte: now, lte: new Date(now.getTime() + INTEREST_REMINDER_MS) },
        visibility: "PUBLIC",
        publishedAt: { not: null },
      },
    },
    select: {
      id: true,
      userId: true,
      event: { select: { id: true, titleNl: true, start: true, location: true } },
    },
    take: 500,
  });
  if (interests.length === 0) return { users: 0, devices: 0 };

  const timeFormat = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  let users = 0;
  let devices = 0;

  for (const interest of interests) {
    const { count } = await prisma.calendarEventInterest.updateMany({
      where: { id: interest.id, remindedAt: null },
      data: { remindedAt: now },
    });
    if (count === 0) continue;

    const wanting = await usersWantingTopic([interest.userId], "calendar.interest");
    if (wanting.length === 0) continue;

    const when = timeFormat.format(interest.event.start);
    const outcome = await sendPushToUsers(wanting, {
      title: interest.event.titleNl,
      body: interest.event.location ? `${when}, ${interest.event.location}` : when,
      path: `/evenement/${interest.event.id}`,
    });
    users += wanting.length;
    devices += outcome.sent;
  }

  return { users, devices };
}

/**
 * Welke van deze leden bij minstens één van deze doelgroepen horen.
 *
 * Eén lezing voor de hele groep en niet één per persoon: een aankondiging gaat
 * naar tientallen volgers tegelijk, en dat zou anders tientallen queries zijn.
 */
async function withinAudience(
  userIds: string[],
  audiences: ("FIRST_YEARS" | "INTERNATIONALS" | "LAST_YEARS" | "ALUMNI")[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, studyYears: true, internationalStudent: true, alumni: true },
  });

  return users
    .filter((user) =>
      audiencesForStudyProfile(user.studyYears, user.internationalStudent, user.alumni).some(
        (audience) => audiences.includes(audience),
      ),
    )
    .map((user) => user.id);
}

/**
 * "Lotte is begonnen met studeren."
 *
 * Eén bericht per groep per dag, en enkel wanneer de eerste gaat zitten. Acht
 * leden die na elkaar beginnen zouden anders acht berichten geven, en dan zet
 * iedereen het na één dag uit.
 *
 * Dezelfde claim-dan-versturen-aanpak als bij de broodjes: eerst de markering in
 * een voorwaardelijke `updateMany`, dan pas het bericht. Twee toestellen die op
 * hetzelfde moment starten, kunnen zo niet allebei aankondigen dat zij de eerste
 * zijn. De markering wordt bewust **niet** teruggezet wanneer het versturen faalt:
 * liever een bericht te weinig dan een groepschat vol.
 */
export async function sendStudyGroupStartPush(
  userId: string,
  now: Date = new Date(),
): Promise<NotificationRun> {
  const [me, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.studyGroupMember.findMany({
      where: { userId },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            startPushAt: true,
            members: { select: { userId: true } },
          },
        },
      },
    }),
  ]);
  if (!me || memberships.length === 0) return { users: 0, devices: 0 };

  const dayStarted = dayStart(now);
  const firstName = me.name.split(" ")[0];
  let users = 0;
  let devices = 0;

  for (const { group } of memberships) {
    const others = group.members.map((member) => member.userId).filter((id) => id !== userId);
    if (others.length === 0) continue;
    if (group.startPushAt && group.startPushAt >= dayStarted) continue;

    // Zit er al iemand anders, dan ben jij niet de eerste en is er niets aan te
    // kondigen. `isLive` is dezelfde regel als in de zaal zelf: open, en de app
    // meldde zich net nog.
    const active = await prisma.studySession.findMany({
      where: { userId: { in: others }, endedAt: null },
      select: {
        id: true,
        userId: true,
        subject: true,
        subjectHidden: true,
        startedAt: true,
        endedAt: true,
        pausedAt: true,
        pausedSeconds: true,
        lastSeenAt: true,
        seconds: true,
      },
    });
    if (active.some((session) => isLive(session, now))) continue;

    const { count } = await prisma.studyGroup.updateMany({
      where: {
        id: group.id,
        OR: [{ startPushAt: null }, { startPushAt: { lt: dayStarted } }],
      },
      data: { startPushAt: now },
    });
    if (count === 0) continue;

    const wanting = await usersWantingTopic(others, "study.groupStart");
    if (wanting.length === 0) continue;

    const outcome = await sendPushToUsers(wanting, {
      title: `${firstName} is begonnen met studeren`,
      body: `In ${group.name}. Kom erbij.`,
      path: "/studeren",
    });
    users += wanting.length;
    devices += outcome.sent;
  }

  return { users, devices };
}
