/**
 * Zet `scripts/kulag-gebouwen.json` in de databank.
 *
 * **Create-or-update op de natuurlijke sleutel**, net als de fixtures: een
 * herimport werkt bestaande rijen bij in plaats van ze te verdubbelen, en raakt
 * de velden die VTK zelf invulde (`Building.notes`, `Room.aliases`) niet aan.
 * Dat is precies waarom die twee velden bestaan; KULag overschrijft ze anders
 * bij de eerstvolgende scrape.
 *
 * Draaien: `npm run import:lokalen` (of `npx tsx scripts/import-kulag.ts`).
 */

import { readFile } from "node:fs/promises";

import { prisma } from "@vtk/db";

type ScrapedRoom = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  url: string;
};

type ScrapedBuilding = {
  id: string;
  name: string;
  shortCode: string | null;
  address: string;
  zipcode: string;
  city: string;
  lat: number | null;
  lng: number | null;
  outline: [number, number][];
  photoUrl: string | null;
  kulagUrl: string;
  plans: { title: string; url: string }[];
  rooms: ScrapedRoom[];
};

/** "00.06" wordt 0, "01.100" wordt 1. Null wanneer het nummer die vorm niet heeft. */
function floorOf(code: string | null): number | null {
  if (!code) return null;
  const match = /^(\d+)\./.exec(code);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function main() {
  const path = process.argv[2] ?? "scripts/kulag-gebouwen.json";
  const parsed = JSON.parse(await readFile(path, "utf8")) as { buildings: ScrapedBuilding[] };

  let buildings = 0;
  let rooms = 0;

  for (const item of parsed.buildings) {
    const fields = {
      shortCode: item.shortCode,
      name: item.name,
      address: item.address,
      zipcode: item.zipcode,
      city: item.city,
      lat: item.lat,
      lng: item.lng,
      outline: item.outline,
      photoUrl: item.photoUrl,
      kulagUrl: item.kulagUrl,
      plans: item.plans,
    };

    const building = await prisma.building.upsert({
      where: { kulagId: item.id },
      create: { kulagId: item.id, ...fields },
      update: fields,
    });
    buildings += 1;

    for (const room of item.rooms) {
      const roomFields = {
        buildingId: building.id,
        code: room.code,
        name: room.name,
        category: room.category,
        floor: floorOf(room.code),
        kulagUrl: room.url,
      };
      await prisma.room.upsert({
        where: { kulagId: room.id },
        create: { kulagId: room.id, ...roomFields },
        update: roomFields,
      });
      rooms += 1;
    }
  }

  console.log(`${buildings} gebouwen en ${rooms} lokalen bijgewerkt vanuit ${path}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
