import "server-only";
import { prisma } from "@vtk/db";

export { announcementFits, ANNOUNCEMENT_EXCLUDED_PREFIXES } from "./announcementScope";

/**
 * De aankondiging die nu aan de beurt is.
 *
 * Er kunnen er meerdere klaarstaan (elk met hun eigen venster), maar de modal
 * toont er één: twee berichten tegelijk over de pagina leest niemand. Bij
 * overlap wint de laatst aangemaakte, want dat is het meest recente nieuws.
 *
 * Een leeg `startsAt` betekent "meteen", een leeg `endsAt` "blijft staan".
 * Waar ze mag verschijnen is een aparte vraag; zie `announcementFits`.
 */
export async function getCurrentAnnouncement(now = new Date()) {
  return prisma.announcement.findFirst({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });
}

export type AnnouncementStatus = "live" | "scheduled" | "expired" | "off";

/** Waar een aankondiging in haar leven staat; puur afgeleid uit de velden. */
export function announcementStatus(
  announcement: { active: boolean; startsAt: Date | null; endsAt: Date | null },
  now = new Date(),
): AnnouncementStatus {
  if (!announcement.active) return "off";
  if (announcement.endsAt && announcement.endsAt < now) return "expired";
  if (announcement.startsAt && announcement.startsAt > now) return "scheduled";
  return "live";
}
