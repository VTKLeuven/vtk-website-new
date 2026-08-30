import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import type { AppBuilding, AppRoom, AppRooms } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Waar iemand terechtkan die hier niets vindt. */
const KULAG = "https://www.kuleuven.be/kulag/nl/zoeken";

/**
 * De lokalenzoeker: gebouwen, hun contour en hun lokalen.
 *
 * Zonder `q` gaat alles mee. Dat is vandaag een kleine tachtig kilobyte, en de
 * kaart heeft de contouren van **alle** gebouwen nodig om er één in te kunnen
 * tonen; in stukjes ophalen zou dus niets besparen en enkel een half getekende
 * campus opleveren. Met `q` komen de treffers erbij in `results`.
 *
 * De gebouwen zonder voetafdruk (de terreinen) vallen weg: die hebben geen
 * lokalen en horen niet op een kaart.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();

    const buildings = await prisma.building.findMany({
      orderBy: [{ shortCode: "asc" }, { name: "asc" }],
      include: { rooms: { orderBy: [{ floor: "asc" }, { code: "asc" }] } },
    });

    const toRoom = (
      room: Prisma.RoomGetPayload<object>,
      building: { id: string; name: string; shortCode: string | null },
    ): AppRoom => ({
      id: room.id,
      label: [building.shortCode, room.code].filter(Boolean).join(" ") || room.name,
      code: room.code,
      name: room.name,
      category: room.category,
      floor: room.floor,
      buildingId: building.id,
      buildingName: building.name,
      buildingShortCode: building.shortCode,
      kulagUrl: room.kulagUrl,
    });

    const payload: AppBuilding[] = buildings
      .filter((building) => (building.outline as unknown[]).length > 0)
      .map((building) => ({
        id: building.id,
        kulagId: building.kulagId,
        shortCode: building.shortCode,
        name: building.name,
        address: building.address,
        city: building.city,
        lat: building.lat,
        lng: building.lng,
        outline: building.outline as [number, number][],
        photoUrl: building.photoUrl,
        kulagUrl: building.kulagUrl,
        plans: building.plans as { title: string; url: string }[],
        rooms: building.rooms.map((room) => toRoom(room, building)),
      }));

    const body: AppRooms = {
      buildings: payload,
      results: query ? search(payload, query) : [],
      sourceUrl: KULAG,
    };

    return appJson(request, body);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/**
 * Zoeken op wat mensen intikken.
 *
 * De term en het doelwit gaan allebei door dezelfde normalisatie: kleine
 * letters, punten en spaties weg. Daardoor vinden "200K 00.06", "200k0006" en
 * "200 K 00 06" alle drie hetzelfde lokaal, zonder dat de gebruiker moet weten
 * hoe KU Leuven een lokaalnummer schrijft.
 *
 * Bewust in het geheugen en niet in SQL: de hele verzameling is klein, staat er
 * na de vorige query al, en een `ILIKE`-reeks zou het samengestelde
 * "korte code + lokaalnummer" toch niet kunnen matchen.
 */
function search(buildings: AppBuilding[], query: string): AppRoom[] {
  const term = normalise(query);
  if (!term) return [];

  const scored: { room: AppRoom; score: number }[] = [];
  for (const building of buildings) {
    for (const room of building.rooms) {
      const label = normalise(room.label);
      const haystacks = [label, normalise(room.code ?? ""), normalise(room.name), normalise(building.name), normalise(building.shortCode ?? "")];
      if (!haystacks.some((h) => h.includes(term))) continue;
      // Een exacte code eerst, dan wat ermee begint, dan de rest.
      const score = label === term ? 0 : label.startsWith(term) ? 1 : 2;
      scored.push({ room, score });
    }
  }

  return scored
    .sort((a, b) => a.score - b.score || a.room.label.localeCompare(b.room.label, "nl"))
    .slice(0, 60)
    .map((entry) => entry.room);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[\s._-]/g, "");
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
