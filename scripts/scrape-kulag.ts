/**
 * Scrapet de KU Leuven Access Guide (KULag) en de KU Leuven kaart-API tot een
 * JSON-bestand met gebouwen en lokalen, als bron voor de lokalenzoeker in de app.
 *
 * Bronnen:
 *  - https://www.kuleuven.be/kulag/nl/json/buildings?campus=30  (lijst per campus)
 *  - https://www.kuleuven.be/kulag/nl/gebouw/<id>/onderwijs     (detail + lokalen)
 *  - https://www.kuleuven.be/maps/api/showbuilding/<id>/<tkn>   (contour van het gebouw)
 *
 * De maps-API verwacht als token gewoon de PHPSESSID van een sessie; we halen er
 * dus eerst een op via de kaartpagina zelf.
 *
 * Gebruik:
 *   npx tsx scripts/scrape-kulag.ts                       # standaard: Celestijnenlaan 200
 *   npx tsx scripts/scrape-kulag.ts --address "Celestijnenlaan"
 *   npx tsx scripts/scrape-kulag.ts --campus 30 --all     # heel Arenberg
 *   npx tsx scripts/scrape-kulag.ts --out elders.json
 */

import { writeFile } from "node:fs/promises";

const KULAG = "https://www.kuleuven.be/kulag/nl";
const MAPS = "https://www.kuleuven.be/maps";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Campus 30 is Arenberg (Heverlee) in de KULag-filter. */
const ARENBERG = 30;

export type KulagRoom = {
  /** KULag-id van het lokaal, bv. "490-13-000006". */
  id: string;
  /** Lokaalnummer zoals het aan de deur hangt, bv. "00.06". */
  code: string | null;
  /** Omschrijving zonder het nummer, bv. "Aula". */
  name: string;
  /** Rubriek waaronder KULag het lokaal zet, bv. "Aula (auditorium)". */
  category: string;
  url: string;
};

export type KulagBuilding = {
  /** Gebouwnummer, bv. "490-13". */
  id: string;
  name: string;
  /**
   * De korte code waarmee studenten het gebouw aanduiden, bv. "200K". Staat op
   * KULag achter de naam en is samen met het lokaalnummer hoe een lokaal in een
   * uurrooster geschreven wordt ("200K 00.06").
   */
  shortCode: string | null;
  address: string;
  zipcode: string;
  city: string;
  /**
   * Zwaartepunt van de contour. De lat/lng in de KULag-pagina zelf is voor elk
   * gebouw dezelfde (het middelpunt van de kaart), dus die is onbruikbaar.
   */
  lat: number | null;
  lng: number | null;
  /** Contour van het gebouw als [lat, lng]-paren; leeg als de kaart hem niet kent. */
  outline: [number, number][];
  photoUrl: string | null;
  kulagUrl: string;
  /** Toegankelijkheidsplannen (PDF) van KULag. */
  plans: { title: string; url: string }[];
  rooms: KulagRoom[];
};

type BuildingListItem = {
  kulag_id: string;
  name: string;
  address: string;
  zipcode: string;
  city: string;
  _links?: { website?: string; onderwijs?: string; huisvesting?: string };
  coverImage?: { data?: { _links?: { thumb?: string; large?: string; full?: string } } };
};

function decodeEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "));
}

async function fetchText(url: string, init?: RequestInit): Promise<Response> {
  const resp = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...(init?.headers ?? {}) },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} op ${url}`);
  return resp;
}

/**
 * De kaart-API accepteert de PHPSESSID van een gewone sessie als token; zonder
 * geldige sessie geeft ze stil een leeg antwoord terug in plaats van een fout.
 */
async function openMapsSession(): Promise<{ token: string; cookie: string } | null> {
  const resp = await fetchText(`${MAPS}/kaart`);
  await resp.text();
  const cookies = resp.headers.getSetCookie?.() ?? [];
  const session = cookies
    .map((c) => /PHPSESSID=([^;]+)/.exec(c)?.[1])
    .find((v): v is string => Boolean(v));
  if (!session) return null;
  return { token: session, cookie: `PHPSESSID=${session}` };
}

async function fetchOutline(
  buildingId: string,
  session: { token: string; cookie: string } | null,
): Promise<[number, number][]> {
  if (!session) return [];
  const url = `${MAPS}/api/showbuilding/${buildingId}/${session.token}`;
  const resp = await fetchText(url, { headers: { Cookie: session.cookie, Referer: `${MAPS}/kaart` } });
  const body = await resp.text();
  if (!body.trim()) return [];
  let parsed: { KulBuildingId?: string; Coords?: { lat: string; lng: string }[] }[];
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const flat = buildingId.replace(/-/g, "");
  const match = parsed.find((b) => b.KulBuildingId === flat) ?? parsed[0];
  return (match?.Coords ?? []).map(({ lat, lng }) => [Number(lat), Number(lng)] as [number, number]);
}

async function fetchBuildingList(campus: number): Promise<BuildingListItem[]> {
  const items: BuildingListItem[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const resp = await fetchText(
      `${KULAG}/json/buildings?page=${page}&campus=${campus}`,
      { headers: { Accept: "application/json" } },
    );
    const json = (await resp.json()) as {
      data: BuildingListItem[];
      meta: { pagination: { total_pages: number } };
    };
    items.push(...json.data);
    totalPages = json.meta.pagination.total_pages;
    page += 1;
  } while (page <= totalPages);
  return items;
}

/**
 * KULag zet de lokalen in kaarten met een `card-title` als rubriek en per lokaal
 * een link naar /lokaal/<id>. Het nummer staat tussen haakjes achter de naam.
 */
function parseRooms(html: string): KulagRoom[] {
  const rooms: KulagRoom[] = [];
  const seen = new Set<string>();

  const cardRe = /<div class="card">([\s\S]*?)(?=<div class="card">|<footer|$)/g;
  for (const card of html.matchAll(cardRe)) {
    const body = card[1];
    const titleMatch = /<h2 class="card-title[^"]*">([\s\S]*?)<\/h2>/.exec(body);
    if (!titleMatch) continue;
    const category = stripTags(titleMatch[1]);
    if (!category) continue;

    const linkRe = /<a href="[^"]*\/lokaal\/([^/"]+)\/[^"]*">([\s\S]*?)<\/a>/g;
    for (const link of body.matchAll(linkRe)) {
      const id = link[1];
      const label = stripTags(link[2]);
      if (!label || seen.has(id)) continue;
      seen.add(id);
      const codeMatch = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(label);
      rooms.push({
        id,
        code: codeMatch ? codeMatch[2] : null,
        name: codeMatch ? codeMatch[1] : label,
        category,
        url: `${KULAG}/lokaal/${id}/onderwijs`,
      });
    }
  }
  return rooms;
}

/**
 * Oppervlaktezwaartepunt van de contour (shoelace), zodat de speld in het gebouw
 * valt en niet ergens op de rand zoals bij een gemiddelde van de hoekpunten.
 */
function centroid(outline: [number, number][]): { lat: number | null; lng: number | null } {
  if (outline.length === 0) return { lat: null, lng: null };
  if (outline.length < 3) {
    const lat = outline.reduce((n, p) => n + p[0], 0) / outline.length;
    const lng = outline.reduce((n, p) => n + p[1], 0) / outline.length;
    return { lat, lng };
  }
  let twiceArea = 0;
  let lat = 0;
  let lng = 0;
  for (let i = 0; i < outline.length; i += 1) {
    const [y1, x1] = outline[i];
    const [y2, x2] = outline[(i + 1) % outline.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    lng += (x1 + x2) * cross;
    lat += (y1 + y2) * cross;
  }
  if (twiceArea === 0) {
    return {
      lat: outline.reduce((n, p) => n + p[0], 0) / outline.length,
      lng: outline.reduce((n, p) => n + p[1], 0) / outline.length,
    };
  }
  return { lat: lat / (3 * twiceArea), lng: lng / (3 * twiceArea) };
}

/** De korte code staat als "(200K)" achter de titel van de gebouwpagina. */
function parseShortCode(html: string): string | null {
  const heading = /<h1 class="m-y-0">([\s\S]*?)<\/h1>/.exec(html);
  if (!heading) return null;
  const code = /<span>\(([^)]+)\)<\/span>/.exec(heading[1]);
  return code ? decodeEntities(code[1]) : null;
}

function parsePlans(html: string): { title: string; url: string }[] {
  const plans: { title: string; url: string }[] = [];
  const re = /<a[^>]+href="(https:\/\/www\.kuleuven\.be\/kulag\/media\/original\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const title = stripTags(m[2]);
    if (!plans.some((p) => p.url === m[1])) plans.push({ title: title || "Plan", url: m[1] });
  }
  return plans;
}

async function scrapeBuilding(
  item: BuildingListItem,
  session: { token: string; cookie: string } | null,
): Promise<KulagBuilding> {
  const kulagUrl = item._links?.onderwijs ?? item._links?.website ?? `${KULAG}/gebouw/${item.kulag_id}`;
  const html = await (await fetchText(kulagUrl)).text();
  const outline = await fetchOutline(item.kulag_id, session);
  const { lat, lng } = centroid(outline);

  return {
    id: item.kulag_id,
    name: decodeEntities(item.name),
    shortCode: parseShortCode(html),
    address: decodeEntities(item.address),
    zipcode: item.zipcode,
    city: decodeEntities(item.city),
    lat,
    lng,
    outline,
    photoUrl: item.coverImage?.data?._links?.large ?? null,
    kulagUrl,
    plans: parsePlans(html),
    rooms: parseRooms(html),
  };
}

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    campus: Number(get("--campus") ?? ARENBERG),
    address: get("--address") ?? "Celestijnenlaan 200",
    all: argv.includes("--all"),
    out: get("--out") ?? "packages/db/prisma/fixtures/gebouwen.json",
  };
}

/** "Celestijnenlaan  200a" en "Celestijnenlaan 200" horen samen; 300 en 101 niet. */
function matchesAddress(address: string, prefix: string): boolean {
  const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return normalise(address).startsWith(normalise(prefix));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const list = await fetchBuildingList(args.campus);
  const selected = args.all ? list : list.filter((b) => matchesAddress(b.address, args.address));
  console.log(
    `${list.length} gebouwen op campus ${args.campus}; ${selected.length} geselecteerd` +
      (args.all ? "" : ` op "${args.address}"`),
  );

  const session = await openMapsSession();
  if (!session) console.warn("Geen kaartsessie; contouren blijven leeg.");

  const buildings: KulagBuilding[] = [];
  for (const item of selected) {
    const building = await scrapeBuilding(item, session);
    buildings.push(building);
    console.log(
      `  ${building.id} ${building.name}: ${building.rooms.length} lokalen, ` +
        `${building.outline.length} contourpunten, ${building.plans.length} plannen`,
    );
  }

  buildings.sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const payload = {
    scrapedAt: new Date().toISOString(),
    source: "KU Leuven Access Guide (KULag) + KU Leuven maps",
    campus: args.campus,
    addressFilter: args.all ? null : args.address,
    buildings,
  };
  await writeFile(args.out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(
    `\n${buildings.length} gebouwen en ${buildings.reduce((n, b) => n + b.rooms.length, 0)} lokalen naar ${args.out}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
