import { prisma } from "./index";
import { resolveDriverPhones, type DriverPhone } from "./driverPhones";

/**
 * Het nummer waarop elke chauffeur bereikbaar is, uit de drie bronnen die
 * `resolveDriverPhones` samenlegt (team, profiel, historiek).
 *
 * Gedeeld door de uitleendienst (Chauffeurs, de planning, "Mijn ritten") en
 * vtk.be (een bijrijdshift toont het nummer van de chauffeur van haar rit), zodat
 * beide hetzelfde nummer tonen.
 *
 * Wat hier bewust **niet** in zit: het nummer van een bijrijder
 * (`UitleenTransportHelper.phone`). Dat is het nummer van de bijrijder zelf en
 * niet van wie die rij aanmaakte; `addedById` erop loslaten zou de helft van de
 * chauffeurs het nummer van iemand anders geven, en een verkeerd nummer is
 * erger dan geen nummer.
 *
 * Het gevondene wordt niet weggeschreven: dit draait op een leespad, en een
 * pagina die stil rijen bijwerkt terwijl je ze bekijkt, is een pagina waarvan
 * je de gegevens niet meer kan verklaren.
 */
export async function driverPhones(userIds: string[]): Promise<Map<string, DriverPhone>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const [team, profile, bookings, reservations] = await Promise.all([
    prisma.uitleenDriver.findMany({
      where: { userId: { in: ids }, phone: { not: null } },
      select: { userId: true, phone: true },
    }),
    prisma.user.findMany({
      where: { id: { in: ids }, phone: { not: null } },
      select: { id: true, phone: true },
    }),
    prisma.uitleenTransportBooking.findMany({
      where: { userId: { in: ids }, contactPhone: { not: null } },
      select: { userId: true, contactPhone: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.uitleenReservation.findMany({
      where: { userId: { in: ids }, contactPhone: { not: null } },
      select: { userId: true, contactPhone: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return resolveDriverPhones({
    team,
    profile: profile.map((row) => ({ userId: row.id, phone: row.phone })),
    history: [...bookings, ...reservations].map((row) => ({
      userId: row.userId,
      phone: row.contactPhone,
      createdAt: row.createdAt,
    })),
  });
}
