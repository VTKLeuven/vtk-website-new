import "server-only";

import { prisma } from "@vtk/db";

/**
 * Pushberichten versturen naar de VTK-app.
 *
 * Loopt over Expo's push-dienst en niet rechtstreeks over APNs en FCM. Dat is
 * niet uit gemak: rechtstreeks betekent een Apple-certificaat en een
 * Google-servicesleutel op onze server, allebei met een eigen vervaldatum en een
 * eigen manier om stil te breken. Expo doet dat stuk, en de app is er toch al op
 * gebouwd.
 *
 * **Er wordt niets verstuurd zonder dat iemand het vraagt.** Dit bestand kent
 * geen automatische berichten; wie er een wil (een herinnering aan een shift,
 * een broodje dat klaarligt), roept `sendPushToUsers` aan vanuit de code die
 * weet wanneer dat zo is.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo aanvaardt maximaal honderd berichten per aanvraag. */
const BATCH_SIZE = 100;

export type PushMessage = {
  title: string;
  body: string;
  /**
   * Waar de app heen moet bij een tik. Een pad in de app (`/bestellen`), niet een
   * URL. Leeg = de app opent gewoon.
   */
  path?: string;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

export type PushOutcome = {
  /** Hoeveel toestellen er een bericht kregen. */
  sent: number;
  /** Hoeveel tokens er opgeruimd zijn omdat Expo ze afkeurde. */
  removed: number;
  /** Hoeveel er om een andere reden mislukten; die staan ook in de logs. */
  failed: number;
};

/**
 * Stuurt één bericht naar alle toestellen van deze gebruikers.
 *
 * **Gooit nooit**, en dat is geen beleefdheid maar een voorwaarde. Deze functie
 * wordt aangeroepen naast dingen die wél moeten lukken: de herinneringsmail voor
 * een shift vertrekt binnen dezelfde claim, en zou een fout hier doorslaan, dan
 * zou die mail nooit meer vertrekken terwijl de markering al gezet is. Ook de
 * databank-aanroepen zitten daarom achter een vangnet.
 */
export async function sendPushToUsers(
  userIds: string[],
  message: PushMessage,
): Promise<PushOutcome> {
  const outcome: PushOutcome = { sent: 0, removed: 0, failed: 0 };
  if (userIds.length === 0) return outcome;

  let devices: { token: string }[];
  try {
    devices = await prisma.appPushDevice.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
  } catch (error) {
    console.error("[push] toestellen opzoeken mislukt", error);
    return outcome;
  }
  if (devices.length === 0) return outcome;

  const tokens = devices.map((device) => device.token);

  for (let index = 0; index < tokens.length; index += BATCH_SIZE) {
    const batch = tokens.slice(index, index + BATCH_SIZE);
    const tickets = await postBatch(batch, message);

    if (!tickets) {
      outcome.failed += batch.length;
      continue;
    }

    const dead: string[] = [];
    tickets.forEach((ticket, position) => {
      if (ticket.status === "ok") {
        outcome.sent += 1;
        return;
      }
      // Het toestel heeft de app niet meer, of het token is vervangen. Dat is de
      // enige plek waar we dat te weten komen, dus is het ook de plek om op te
      // ruimen; anders groeit de tabel met tokens die nooit meer iets doen.
      if (ticket.details?.error === "DeviceNotRegistered") {
        dead.push(batch[position]);
        return;
      }
      outcome.failed += 1;
      console.error("[push] Expo weigerde een bericht", ticket.message ?? ticket.details?.error);
    });

    if (dead.length > 0) {
      try {
        await prisma.appPushDevice.deleteMany({ where: { token: { in: dead } } });
        outcome.removed += dead.length;
      } catch (error) {
        // Opruimen is onderhoud; het mag de verzending niet omver halen. De
        // volgende beurt probeert het opnieuw.
        console.error("[push] dode tokens opruimen mislukt", error);
      }
    }
  }

  return outcome;
}

async function postBatch(tokens: string[], message: PushMessage): Promise<ExpoTicket[] | null> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        tokens.map((token) => ({
          to: token,
          title: message.title,
          body: message.body,
          sound: "default",
          data: message.path ? { path: message.path } : undefined,
        })),
      ),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.error("[push] Expo antwoordde met", response.status);
      return null;
    }

    const payload = (await response.json()) as { data?: ExpoTicket[] };
    return payload.data ?? null;
  } catch (error) {
    console.error("[push] versturen mislukt", error);
    return null;
  }
}

/**
 * Ruimt toestellen op die maanden niet meer opgestart zijn.
 *
 * De app werkt `lastSeenAt` bij bij elke start, dus een toestel dat hier al een
 * half jaar niet meer langskwam, heeft de app vrijwel zeker niet meer. Bedoeld
 * voor de onderhoudsroute, niet voor een verzendbeurt.
 */
export async function pruneStalePushDevices(olderThanDays = 180): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.appPushDevice.deleteMany({
    where: { lastSeenAt: { lt: cutoff } },
  });
  return count;
}
