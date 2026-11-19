/**
 * Testdata voor de privélinks naar een album (docs/immich-gallery.md, "Een album
 * delen met een link"):
 *
 * - in Immich een verborgen album "Praesidiumweekend 2026" met twee tabs, en
 *   twee verborgen foto's, zodat je ziet dat die niet in de link zitten;
 * - vier links: voor het praesidium, voor iedereen zonder downloaden, voor
 *   werkgroep Revue, en een verlopen;
 * - een demostudent zonder post maar met Revue, `student.delen@vtk.prototype`
 *   (wachtwoord `prototype`), om de schermen "niet met jou gedeeld" en de
 *   werkgroeplink te proberen. `it@vtk.prototype` uit de seed zit in het
 *   praesidium.
 *
 *   npm run db:demo:delen               # aanmaken (wat er al stond, eerst weg)
 *   npm run db:demo:delen -- --reset    # enkel opruimen
 *
 * Enkel tegen een lokale databank: de links dragen een geheim en de demostudent
 * hoort niet op de echte site. Immich moet bereikbaar zijn met
 * `GALLERY_IMMICH_API_URL` en `GALLERY_IMMICH_API_KEY`; die mag je inline
 * meegeven, ze gaan voor op de `.env`. De foto's komen uit
 * `infra/immich/seed/photos` (zie `infra/immich/scripts/seed-immich.sh`).
 *
 * `--conditions=react-server` in het npm-script is nodig: `lib/secrets.ts`
 * begint met `import "server-only"`.
 */

import fs from "node:fs";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import {
  deleteImmichAlbum,
  deleteImmichAssets,
  immichJson,
  removeImmichAssetsFromAlbum,
  uploadImmichAsset,
} from "@vtk/gallery";
import { encryptSecret } from "../apps/web/lib/secrets";
import { shareExpiry } from "../apps/web/lib/media-share-shared";
import { createShareToken, hashShareToken } from "../apps/web/lib/media-share-token";
import { currentStudyYear, currentWorkingYear } from "../apps/web/lib/workingYear";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MARK_KEY = "media.demo.delen";
const DEVICE_ID = "vtk-demo-delen";
const STUDENT_EMAIL = "student.delen@vtk.prototype";
const PHOTO_DIR = path.resolve(__dirname, "../infra/immich/seed/photos");
const ALBUM_TITLE = "Praesidiumweekend 2026";

type DemoState = {
  albumIds: string[];
  assetIds: string[];
  linkIds: string[];
  detachedAssetIds: string[];
  studentId: string | null;
  membershipId: string | null;
};

const prisma = new PrismaClient();

function assertLocalDatabase(rawUrl: string | undefined): void {
  if (!rawUrl) {
    console.error("DATABASE_URL ontbreekt. Staat je .env op zijn plaats?");
    process.exit(1);
  }
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    console.error("DATABASE_URL is geen geldige URL.");
    process.exit(1);
  }
  if (!LOCAL_HOSTS.has(host)) {
    console.error(
      [
        `Weigert te draaien: DATABASE_URL wijst naar "${host}" en niet naar een lokale database.`,
        "",
        "Dit script maakt privélinks met een geheim en een verzonnen student aan.",
        "Die horen niet op de echte site.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

async function readState(): Promise<DemoState | null> {
  const row = await prisma.setting.findUnique({ where: { key: MARK_KEY } });
  return row ? (row.value as unknown as DemoState) : null;
}

/**
 * Ruimt op wat de vorige run aanmaakte. Ook de links die iemand intussen in het
 * beheer naar het demoalbum maakte: dat album verdwijnt, en een link zonder
 * album is enkel nog ruis in de tabel. Wat er buiten het demoalbum staat, blijft.
 */
async function reset(state: DemoState): Promise<void> {
  await prisma.galleryShareLink.deleteMany({
    where: { OR: [{ id: { in: state.linkIds } }, { albumId: { in: state.albumIds } }] },
  });
  await prisma.galleryDetachedPhoto.deleteMany({ where: { assetId: { in: state.detachedAssetIds } } });
  if (state.membershipId) await prisma.groupMembership.deleteMany({ where: { id: state.membershipId } });
  if (state.studentId) {
    await prisma.account.deleteMany({ where: { userId: state.studentId } });
    await prisma.user.deleteMany({ where: { id: state.studentId } });
  }
  for (const id of state.albumIds) await deleteImmichAlbum(id).catch(() => null);
  if (state.assetIds.length > 0) await deleteImmichAssets(state.assetIds, { force: true }).catch(() => null);
  await prisma.setting.deleteMany({ where: { key: MARK_KEY } });
}

/**
 * Een foto uploaden die Immich nog niet kent. Immich ontdubbelt op de checksum,
 * en de seed van Immich gebruikt dezelfde bestanden voor de publieke albums: een
 * gewone upload zou dus een foto van een publiek album in dit verborgen album
 * zetten, en het opruimen zou ze daar weghalen. Een paar bytes na het einde van
 * de JPEG maken de checksum uniek; elke viewer negeert ze.
 */
async function uploadUnique(file: string, index: number, takenAt: Date): Promise<string> {
  const bytes = fs.readFileSync(path.join(PHOTO_DIR, file));
  const unique = Buffer.concat([bytes, Buffer.from(`\nvtk-demo-delen-${Date.now()}-${index}`)]);
  const result = await uploadImmichAsset({
    assetData: new Blob([unique], { type: "image/jpeg" }),
    filename: `weekend-${String(index + 1).padStart(2, "0")}.jpg`,
    mimeType: "image/jpeg",
    deviceAssetId: `${DEVICE_ID}-${Date.now()}-${index}`,
    deviceId: DEVICE_ID,
    createdAt: takenAt.toISOString(),
  });
  if (!result.id) throw new Error(`Upload van ${file} gaf geen id terug.`);
  return result.id;
}

async function createAlbum(albumName: string, description: string, assetIds: string[]): Promise<string> {
  const album = await immichJson<{ id: string }>("/albums", {
    method: "POST",
    body: { albumName, description, assetIds },
  });
  return album.id;
}

async function main(): Promise<void> {
  assertLocalDatabase(process.env.DATABASE_URL);
  const resetOnly = process.argv.includes("--reset");

  const previous = await readState();
  if (previous) {
    await reset(previous);
    console.log("Vorige demo van de privélinks opgeruimd.");
  }
  if (resetOnly) return;

  try {
    await immichJson("/server/ping");
    await immichJson("/albums");
  } catch (error) {
    console.error(
      [
        "Immich is niet bereikbaar met deze sleutel.",
        "Geef GALLERY_IMMICH_API_URL en GALLERY_IMMICH_API_KEY mee, bijvoorbeeld:",
        "  GALLERY_IMMICH_API_URL=http://localhost:2283/api GALLERY_IMMICH_API_KEY=... npm run db:demo:delen",
      ].join("\n"),
    );
    throw error;
  }

  if (!fs.existsSync(PHOTO_DIR)) {
    console.error(`Geen foto's in ${PHOTO_DIR}. Draai eerst infra/immich/scripts/download-sample-images.sh.`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(PHOTO_DIR)
    .filter((file) => file.endsWith(".jpg"))
    .sort()
    .slice(0, 22);
  if (files.length < 22) {
    console.error(`Te weinig foto's in ${PHOTO_DIR} (${files.length}, er zijn er 22 nodig).`);
    process.exit(1);
  }

  const state: DemoState = {
    albumIds: [],
    assetIds: [],
    linkIds: [],
    detachedAssetIds: [],
    studentId: null,
    membershipId: null,
  };
  // De toestand meteen bewaren en na elke stap bijwerken: loopt er iets mis,
  // dan ruimt de volgende run toch op wat er al stond.
  const save = () =>
    prisma.setting.upsert({
      where: { key: MARK_KEY },
      update: { value: state as never },
      create: { key: MARK_KEY, value: state as never },
    });

  // Zaterdag 3 en zondag 4 oktober 2026, een foto om het half uur.
  const saturday = Date.UTC(2026, 9, 3, 12, 0);
  const sunday = Date.UTC(2026, 9, 4, 10, 0);
  for (const [index, file] of files.entries()) {
    const start = index < 14 ? saturday + index * 30 * 60_000 : sunday + (index - 14) * 30 * 60_000;
    state.assetIds.push(await uploadUnique(file, index, new Date(start)));
  }
  await save();
  console.log(`${state.assetIds.length} foto's opgeladen in Immich.`);

  const saturdayIds = state.assetIds.slice(0, 14);
  const sundayIds = state.assetIds.slice(14);
  const mainId = await createAlbum(ALBUM_TITLE, "Durbuy, 2 tot 4 oktober\n\n[gallery-uit] [tab: Zaterdag]", saturdayIds);
  state.albumIds.push(mainId);
  const tabId = await createAlbum(
    `${ALBUM_TITLE} - Zondag`,
    "[gallery-uit] [parent: praesidiumweekend-2026] [tab: Zondag]",
    sundayIds,
  );
  state.albumIds.push(tabId);
  await save();
  console.log(`Verborgen album "${ALBUM_TITLE}" met de tabs Zaterdag en Zondag aangemaakt.`);

  // Twee foto's verbergen, zoals de knop in het beheer: uit het album, met een
  // rij die onthoudt waar ze vandaan kwamen.
  const hide = saturdayIds.slice(12, 14);
  await removeImmichAssetsFromAlbum(mainId, hide);
  for (const [index, assetId] of hide.entries()) {
    await prisma.galleryDetachedPhoto.create({
      data: {
        gallery: "MAIN",
        assetId,
        albumId: mainId,
        albumTitle: ALBUM_TITLE,
        tabName: "Zaterdag",
        filename: `weekend-${String(13 + index).padStart(2, "0")}.jpg`,
      },
    });
    state.detachedAssetIds.push(assetId);
  }
  await save();

  const revue = await prisma.group.findUnique({ where: { code: "REVUE" }, select: { id: true } });
  if (!revue) throw new Error("Werkgroep Revue bestaat niet. Draai eerst de seed (make db).");
  const it = await prisma.user.findUnique({ where: { email: "it@vtk.prototype" }, select: { id: true } });

  const student = await prisma.user.create({
    data: {
      email: STUDENT_EMAIL,
      name: "Lotte Demo",
      locale: "NL",
      active: true,
      onboardedAt: new Date(),
      studyConfirmedYear: currentStudyYear(),
      studyYears: ["BACHELOR_2"],
      studyProgrammes: ["COMPUTER_SCIENCE"],
    },
    select: { id: true },
  });
  state.studentId = student.id;
  await prisma.account.create({
    data: {
      id: `credentials:${student.id}`,
      accountId: student.id,
      providerId: "credential",
      userId: student.id,
      password: await hash("prototype"),
    },
  });
  const membership = await prisma.groupMembership.create({
    data: { userId: student.id, groupId: revue.id, year: currentWorkingYear(), role: "MEMBER" },
    select: { id: true },
  });
  state.membershipId = membership.id;
  await save();

  const now = new Date();
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
  const links = [
    {
      label: "Praesidium 2026-2027",
      audience: "PRAESIDIUM" as const,
      groupId: null,
      allowDownload: true,
      expiresAt: shareExpiry("year", now),
      openCount: 38,
      lastOpenedAt: hoursAgo(2),
    },
    {
      label: "Fotograaf (nakijken)",
      audience: "LINK" as const,
      groupId: null,
      allowDownload: false,
      expiresAt: shareExpiry("week", now),
      openCount: 3,
      lastOpenedAt: hoursAgo(72),
    },
    {
      label: "Werkgroep Revue",
      audience: "GROUP" as const,
      groupId: revue.id,
      allowDownload: true,
      expiresAt: shareExpiry("month", now),
      openCount: 0,
      lastOpenedAt: null,
    },
    {
      label: "Kookploeg",
      audience: "LINK" as const,
      groupId: null,
      allowDownload: true,
      expiresAt: hoursAgo(8 * 24),
      openCount: 11,
      lastOpenedAt: hoursAgo(13 * 24),
    },
  ];

  const base = (process.env.VTK_MAIN_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  const printed: string[] = [];
  for (const link of links) {
    const token = createShareToken();
    const row = await prisma.galleryShareLink.create({
      data: {
        gallery: "MAIN",
        albumId: mainId,
        label: link.label,
        tokenHash: hashShareToken(token),
        tokenSecret: encryptSecret(token),
        audience: link.audience,
        groupId: link.groupId,
        allowDownload: link.allowDownload,
        expiresAt: link.expiresAt,
        openCount: link.openCount,
        lastOpenedAt: link.lastOpenedAt,
        createdById: it?.id ?? null,
      },
      select: { id: true },
    });
    state.linkIds.push(row.id);
    printed.push(`  ${link.label.padEnd(22)} ${base}/media/gedeeld/${token}`);
  }
  await save();

  console.log("");
  console.log("Privélinks:");
  for (const line of printed) console.log(line);
  console.log("");
  console.log(`Beheer:  ${base}/admin/media/albums/${mainId}  (it@vtk.prototype / prototype)`);
  console.log(`Student: ${STUDENT_EMAIL} / prototype  (werkgroep Revue, geen post)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
