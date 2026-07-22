/**
 * Importeer historische praesidia in de DB, zodat ze op /praesidium verschijnen
 * zonder aparte historiek-tabel. Zie docs/praesidium-history-import.md voor het
 * volledige verhaal en de caveats.
 *
 * Wat het doet, per persoon in de JSON:
 *   1. maakt (of werkt bij) een INACTIEVE `User`-rij (enkel naam + foto reeel);
 *   2. downloadt de opgegeven profielfoto-URL, herencodeert ze net als een gewone
 *      upload (vierkant, 512px, jpeg) en zet ze in de S3-bucket; `avatarKey` wijst
 *      ernaar;
 *   3. schrijft per (post, jaar) een `GroupMembership` met rol + titel.
 * Posten die nog niet bestaan worden aangemaakt (default inactief).
 *
 * Draaien vanuit de repo-root (laadt .env voor DATABASE_URL + S3_*):
 *   npm run import:praesidium -- scripts/data.json
 *   npm run import:praesidium -- scripts/data.json --dry-run
 *
 * Idempotent: users worden op e-mail geupsert, memberships op (user, post, jaar).
 * Een herrun dupliceert dus niets.
 */

import { readFileSync } from "node:fs";
import { createDecipheriv, scryptSync } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject, setS3ConfigResolver, type S3Config } from "@vtk/storage";

// ---------------------------------------------------------------------------
// Config. Pas deze aan naar smaak; de rest van het script hangt eraan.
// ---------------------------------------------------------------------------

const CONFIG = {
  /**
   * Dummy-e-mail per persoon. `id` komt uit de JSON, moet uniek zijn en bepaalt
   * mee de idempotentie (dezelfde id -> dezelfde user, ook bij een herrun). De
   * e-mail deelt de globale unieke index met echte leden, dus hou het namespace
   * apart van echte adressen.
   */
  dummyEmail: (id: string) => `praesidium-history+${id}@import.vtk.be`,

  /** Nieuwe historische leden krijgen active=false (afgestudeerd/gedeactiveerd). */
  markInactive: true,

  /**
   * Auto-aangemaakte posten: standaard inactief, zodat ze niet in de
   * nieuwe-shift-keuzes of het huidige postenbeheer opduiken. Hun historiek
   * rendert wel op /praesidium (die pagina negeert `active`). Per post override-
   * baar via `posts[].active` in de JSON.
   */
  newPostsActive: false,
  /** orderInPraesidium voor nieuwe posten. /praesidium sorteert alfabetisch, dus
   *  dit telt enkel voor de admin-volgorde. Hoog = achteraan. */
  newPostOrder: 999,

  /** Avatarformaat, identiek aan gewone uploads (zie storeAvatar in onboarding). */
  avatarSize: 512,
  avatarPrefix: "avatars",
  /** Herupload de avatar ook als de user er al een heeft (bv. bron gewijzigd). */
  forceReuploadAvatars: false,

  /** Timeout voor het downloaden van een profielfoto. */
  avatarFetchTimeoutMs: 15_000,
};

// ---------------------------------------------------------------------------
// JSON-formaat (zie praesidium-history.example.json voor een ingevuld voorbeeld).
// ---------------------------------------------------------------------------

const membershipSchema = z.object({
  /** Post-referentie: matcht een bestaande post op code/slug/naam (NL of EN), of
   *  een entry in de top-level `posts`. Onbekend? Dan wordt de post aangemaakt. */
  post: z.string().min(1),
  /** Startjaar van het academiejaar: 2018 = "18-19". */
  year: z.number().int().gte(1950).lte(2100),
  /** LEAD = groepscoordinator (gele pin op de pagina). Default MEMBER. */
  role: z.enum(["MEMBER", "LEAD"]).default("MEMBER"),
  /** Optionele titel, bv. "Praeses". */
  titleNl: z.string().min(1).optional(),
  titleEn: z.string().min(1).optional(),
  /** Volgorde binnen de post (coordinator staat altijd eerst). Default 0. */
  order: z.number().int().default(0),
});

const personSchema = z.object({
  /** Stabiele, unieke sleutel. Bepaalt de dummy-e-mail en de dedupe over jaren:
   *  zet alle jaren van dezelfde persoon onder een id. */
  id: z.string().min(1),
  name: z.string().min(1),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  /** URL naar de profielfoto. Wordt gedownload en naar S3 geupload. Optioneel. */
  photo: z.string().url().optional(),
  memberships: z.array(membershipSchema).min(1),
});

const postDefSchema = z.object({
  /** Matcht de `post`-referentie in memberships (verplicht). */
  name: z.string().min(1),
  nameEn: z.string().min(1).optional(),
  /** Optioneel; anders afgeleid van `name`. Moeten uniek zijn in de DB. */
  code: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  /** Override voor CONFIG.newPostsActive. */
  active: z.boolean().optional(),
});

const fileSchema = z.object({
  /** Optionele metadata voor (nieuwe) posten; louter om code/EN-naam/active mee
   *  te geven. Posten worden ook aangemaakt zonder hier te staan. */
  posts: z.array(postDefSchema).default([]),
  people: z.array(personSchema).min(1),
});

type PostDef = z.infer<typeof postDefSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function log(msg: string) {
  process.stdout.write(`[${new Date().toTimeString().slice(0, 8)}] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Argumenten
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const inputPath = args.find((a) => !a.startsWith("--"));

// ---------------------------------------------------------------------------
// S3-config: dezelfde bron als de app.
//
// De app bewaart de S3-config (versleuteld) in Setting "s3.config" en valt terug
// op de omgeving (zie apps/web/lib/runtimeConfig.ts). Zonder deze resolver zou
// deze standalone upload enkel de S3_*-env-variabelen zien, wat een ANDERE bucket
// kan zijn dan de app leest; de foto's zouden dan op de site 404'en. We spiegelen
// daarom exact die DB-first logica. Ontsleutelen hangt enkel af van
// BETTER_AUTH_SECRET (staat in .env), net als in de app.
// ---------------------------------------------------------------------------

const S3_SETTING_KEY = "s3.config";

function envS3(): S3Config {
  return {
    endpoint: process.env.S3_ENDPOINT || "",
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
    bucket: process.env.S3_BUCKET || "",
    region: process.env.S3_REGION || "fsn1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

function decryptSecret(payload: string): string {
  const master = process.env.BETTER_AUTH_SECRET;
  if (!master) {
    throw new Error("BETTER_AUTH_SECRET ontbreekt (nodig om de opgeslagen S3-secret te ontsleutelen).");
  }
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Onbekend secret-formaat voor s3.config.");
  const dkey = scryptSync(master, "vtk-settings-enc-v1", 32);
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", dkey, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

type StoredS3 = {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKeyEnc?: string;
  bucket?: string;
  region?: string;
  forcePathStyle?: boolean;
};

/** Leest de S3-config uit de DB (wint) of de omgeving. Geeft ook de bron terug
 *  zodat we die kunnen loggen. */
async function resolveS3(): Promise<{ config: S3Config; source: "database" | "environment" }> {
  const env = envS3();
  try {
    const row = await prisma.setting.findUnique({ where: { key: S3_SETTING_KEY } });
    const v = (row?.value ?? null) as StoredS3 | null;
    if (v?.endpoint && v.accessKeyId && v.secretAccessKeyEnc && v.bucket) {
      return {
        source: "database",
        config: {
          endpoint: v.endpoint,
          accessKeyId: v.accessKeyId,
          secretAccessKey: decryptSecret(v.secretAccessKeyEnc),
          bucket: v.bucket,
          region: v.region || env.region,
          forcePathStyle: v.forcePathStyle ?? env.forcePathStyle,
        },
      };
    }
  } catch {
    /* val terug op env */
  }
  return { config: env, source: "environment" };
}

setS3ConfigResolver(async () => (await resolveS3()).config);

// ---------------------------------------------------------------------------
// Postresolutie (met auto-aanmaak)
// ---------------------------------------------------------------------------

/** Bouwt een resolver ref-string -> groupId. Maakt onbekende posten aan. */
async function buildPostResolver(postDefs: PostDef[]) {
  const groups = await prisma.group.findMany({
    select: { id: true, code: true, slug: true, nameNl: true, nameEn: true },
  });
  log(`  ${groups.length} bestaande posten geladen uit de DB`);
  // Alle bekende sleutels (code/slug/naam) -> groupId.
  const byKey = new Map<string, string>();
  for (const g of groups) {
    for (const k of [g.code, g.slug, g.nameNl, g.nameEn]) if (k) byKey.set(norm(k), g.id);
  }
  // Registry van door de JSON aangeleverde postmetadata.
  const registry = new Map<string, PostDef>();
  for (const p of postDefs) {
    registry.set(norm(p.name), p);
    if (p.code) registry.set(norm(p.code), p);
  }

  const createdCodes = new Set<string>();

  async function resolve(ref: string): Promise<{ id: string; created?: string }> {
    const key = norm(ref);
    const existing = byKey.get(key);
    if (existing) return { id: existing };

    // Onbekend: gebruik registry-metadata indien aanwezig, anders afleiden van ref.
    const def = registry.get(key);
    const nameNl = def?.name ?? ref;
    const nameEn = def?.nameEn ?? null;
    const slug = def?.slug ?? slugify(ref);
    const code = def?.code ?? slug.toUpperCase().replace(/-/g, "_");
    const active = def?.active ?? CONFIG.newPostsActive;

    let id = `(dry:${code})`;
    if (!DRY_RUN) {
      const group = await prisma.group.upsert({
        where: { code },
        create: {
          code,
          slug,
          nameNl,
          nameEn: nameEn ?? nameNl,
          type: "PRAESIDIUM",
          active,
          orderInPraesidium: CONFIG.newPostOrder,
        },
        update: {}, // bestaande post niet overschrijven
        select: { id: true },
      });
      id = group.id;
    }
    log(`  ${DRY_RUN ? "(dry) zou nieuwe post aanmaken" : "+ nieuwe post aangemaakt"}: ${nameNl} (${code}, active=${active})`);
    // Cache onder alle sleutels zodat volgende refs (en jaren) meteen raken.
    byKey.set(key, id);
    byKey.set(norm(code), id);
    byKey.set(norm(slug), id);
    createdCodes.add(code);
    return { id, created: code };
  }

  return { resolve, createdCodes };
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/** Download een foto-URL, herencodeer als vierkante jpeg en upload naar S3.
 *  Geeft de storage-key terug, of null bij een probleem (avatar is optioneel). */
async function uploadAvatarFromUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.avatarFetchTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      log(`   ! foto-download faalde (${res.status}) voor ${url}`);
      return null;
    }
    const input = Buffer.from(await res.arrayBuffer());
    const body = await sharp(input)
      .rotate()
      .resize(CONFIG.avatarSize, CONFIG.avatarSize, { fit: "cover" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    const key = newStorageKey(CONFIG.avatarPrefix, "avatar.jpg");
    await putObject(key, body, "image/jpeg");
    return key;
  } catch (err) {
    log(`   ! foto verwerken/uploaden faalde voor ${url}: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!inputPath) {
    log("Gebruik: tsx scripts/import-praesidium-history.ts <data.json> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  log(`${DRY_RUN ? "[DRY-RUN] " : ""}Start import uit ${inputPath}`);

  log("Stap 1/4: JSON inlezen en valideren...");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch (err) {
    log(`Kon ${inputPath} niet lezen/parsen: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    log("JSON komt niet overeen met het verwachte formaat:");
    for (const issue of parsed.error.issues) {
      log(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }
  const data = parsed.data;

  // Dubbele ids vroeg vangen: die zouden onder een user mergen en verwarren.
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const p of data.people) {
    if (seen.has(p.id)) dups.add(p.id);
    seen.add(p.id);
  }
  if (dups.size > 0) {
    log(`Dubbele person-id's in de JSON: ${[...dups].join(", ")}`);
    log("Elke id moet uniek zijn (zet alle jaren van een persoon onder een id).");
    process.exitCode = 1;
    return;
  }
  log(`  ${data.people.length} personen, ${data.posts.length} postdefinitie(s) in het bestand`);

  log("Stap 2/4: posten inladen en resolven...");
  const { resolve, createdCodes } = await buildPostResolver(data.posts);

  if (!DRY_RUN) {
    const { config, source } = await resolveS3();
    log(`  S3-config: ${source} (bucket "${config.bucket}", endpoint ${config.endpoint || "?"})`);
    if (!config.endpoint || !config.bucket) {
      log("  ! S3 lijkt niet geconfigureerd; foto-uploads zullen falen (leden komen zonder foto binnen).");
    }
  }

  log(`Stap 3/4: ${data.people.length} leden verwerken...`);
  const total = data.people.length;
  const progressEvery = Math.max(1, Math.floor(total / 20)); // ~20 tussenlogs
  let usersCreated = 0;
  let usersUpdated = 0;
  let avatarsUploaded = 0;
  let membershipsWritten = 0;
  const errors: string[] = [];

  let i = 0;
  for (const person of data.people) {
    i++;
    const email = CONFIG.dummyEmail(person.id);
    try {
      // 1. User upserten (avatarKey en active blijven bij een update ongemoeid).
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, avatarKey: true },
      });

      let userId: string;
      let currentAvatar: string | null;
      if (existing) {
        userId = existing.id;
        currentAvatar = existing.avatarKey;
        if (!DRY_RUN) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              name: person.name,
              firstName: person.firstName ?? null,
              lastName: person.lastName ?? null,
            },
          });
        }
        usersUpdated++;
      } else {
        currentAvatar = null;
        if (DRY_RUN) {
          userId = `(dry:${person.id})`;
        } else {
          const created = await prisma.user.create({
            data: {
              email,
              name: person.name,
              firstName: person.firstName ?? null,
              lastName: person.lastName ?? null,
              active: CONFIG.markInactive ? false : true,
            },
            select: { id: true },
          });
          userId = created.id;
        }
        usersCreated++;
      }

      // 2. Avatar: enkel (her)uploaden als er een foto is en het zin heeft.
      if (person.photo && (CONFIG.forceReuploadAvatars || !currentAvatar)) {
        if (DRY_RUN) {
          log(`  (dry) zou foto uploaden voor ${person.name}`);
          avatarsUploaded++;
        } else {
          log(`  [${i}/${total}] ${person.name}: foto ophalen + uploaden...`);
          const key = await uploadAvatarFromUrl(person.photo);
          if (key) {
            await prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
            avatarsUploaded++;
          }
        }
      }

      // 3. Memberships per (post, jaar).
      for (const m of person.memberships) {
        const { id: groupId } = await resolve(m.post);
        if (!DRY_RUN) {
          await prisma.groupMembership.upsert({
            where: { userId_groupId_year: { userId, groupId, year: m.year } },
            create: {
              userId,
              groupId,
              year: m.year,
              role: m.role,
              titleNl: m.titleNl ?? null,
              titleEn: m.titleEn ?? null,
              displayOrder: m.order,
            },
            update: {
              role: m.role,
              titleNl: m.titleNl ?? null,
              titleEn: m.titleEn ?? null,
              displayOrder: m.order,
            },
          });
        }
        membershipsWritten++;
      }

      if (i % progressEvery === 0 || i === total) {
        log(`  voortgang ${i}/${total} verwerkt (laatste: ${person.name})`);
      }
    } catch (err) {
      const msg = `${person.name} (${person.id}): ${(err as Error).message}`;
      errors.push(msg);
      log(`  FOUT bij ${msg}`);
    }
  }

  log("Stap 4/4: klaar.");
  log("");
  log(`${DRY_RUN ? "[DRY-RUN] " : ""}Samenvatting:`);
  log(`  Users aangemaakt:      ${usersCreated}`);
  log(`  Users bijgewerkt:      ${usersUpdated}`);
  log(`  Avatars geupload:      ${avatarsUploaded}`);
  log(`  Memberships geschreven: ${membershipsWritten}`);
  log(
    `  Posten aangemaakt:     ${createdCodes.size}${createdCodes.size ? " (" + [...createdCodes].join(", ") + ")" : ""}`,
  );
  if (errors.length > 0) {
    log(`  Fouten:                ${errors.length}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    log(`Onverwachte fout: ${(err as Error).stack ?? err}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
