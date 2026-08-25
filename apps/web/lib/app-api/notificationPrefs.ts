import "server-only";

import { prisma } from "@vtk/db";

import {
  APP_NOTIFICATION_TOPICS,
  defaultNotificationEnabled,
  isAppNotificationTopic,
  type AppNotificationTopic,
} from "./contract";

/**
 * Wie welk soort bericht wil.
 *
 * Enkel afwijkingen staan in de databank. Dat is niet enkel zuinig: het betekent
 * ook dat een nieuw soort bericht vanzelf de juiste standaard heeft voor iedereen
 * die al bestond, zonder migratie en zonder dat er per ongeluk een hele lichting
 * op "uit" komt te staan.
 *
 * Toestemming van het besturingssysteem staat hier los van. Wie push helemaal
 * uitzet op zijn telefoon, krijgt niets, ongeacht wat hier staat; deze schakelaars
 * gaan enkel over welke van de berichten die je wél wil ontvangen.
 */

export type NotificationTopicState = { topic: AppNotificationTopic; enabled: boolean };

export async function notificationPreferences(userId: string): Promise<NotificationTopicState[]> {
  const rows = await prisma.appNotificationPreference.findMany({
    where: { userId },
    select: { topic: true, enabled: true },
  });
  const stored = new Map(rows.map((row) => [row.topic, row.enabled]));

  return APP_NOTIFICATION_TOPICS.map(({ topic }) => ({
    topic,
    enabled: stored.get(topic) ?? defaultNotificationEnabled(topic),
  }));
}

export async function setNotificationPreference(
  userId: string,
  topic: string,
  enabled: boolean,
): Promise<void> {
  if (!isAppNotificationTopic(topic)) throw new Error("INVALID_TOPIC");

  await prisma.appNotificationPreference.upsert({
    where: { userId_topic: { userId, topic } },
    update: { enabled },
    create: { userId, topic, enabled },
  });
}

/**
 * Filtert een lijst gebruikers tot wie dit soort bericht wil.
 *
 * Elke automatische verzending loopt hierlangs. De vorm is bewust "geef me de
 * lijst terug" en niet "mag deze ene": een bericht gaat naar tientallen mensen
 * tegelijk, en dat één voor één vragen is één query per persoon.
 */
export async function usersWantingTopic(
  userIds: string[],
  topic: AppNotificationTopic,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const unique = [...new Set(userIds)];

  const rows = await prisma.appNotificationPreference.findMany({
    where: { userId: { in: unique }, topic },
    select: { userId: true, enabled: true },
  });
  const stored = new Map(rows.map((row) => [row.userId, row.enabled]));
  const fallback = defaultNotificationEnabled(topic);

  return unique.filter((userId) => stored.get(userId) ?? fallback);
}
