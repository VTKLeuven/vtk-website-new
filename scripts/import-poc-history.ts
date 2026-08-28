/**
 * Importeer historische POC-leden in de DB, zodat ze op /pocs verschijnen.
 *
 * Wat het doet, per persoon in de JSON:
 *   1. maakt (of werkt bij) een INACTIEVE `User`-rij (enkel naam + foto reëel);
 *   2. downloadt de opgegeven profielfoto-URL, herencodeert ze (vierkant, 512px, jpeg)
 *      en zet ze in de S3-bucket; `avatarKey` wijst ernaar;
 *   3. schrijft per (poc, jaar) een `PocRepresentative`.
 * POC's die nog niet bestaan worden aangemaakt.
 *
 * Draaien vanuit de repo-root:
 *   - Lokaal (gebruikt .env voor DATABASE_URL + S3_*):
 *       npx tsx scripts/import-poc-history.ts scripts/poc-history.json
 *       npx tsx scripts/import-poc-history.ts scripts/poc-history.json --dry-run
 *   - Remote (stuurt via admin endpoint naar dev.vtk.be):
 *       npx tsx scripts/import-poc-history.ts scripts/poc-history.json --remote https://dev.vtk.be --email seppe@vtk.be --password "condense.masses.pampered"
 */

import { readFileSync } from "node:fs";
import { createDecipheriv, scryptSync } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject, setS3ConfigResolver, type S3Config } from "@vtk/storage";
import type { StudyProgramme } from "@prisma/client";

const CONFIG = {
  dummyEmail: (id: string) => `poc-history+${id}@import.vtk.be`,
  markInactive: true,
  avatarSize: 512,
  avatarPrefix: "avatars",
  forceReuploadAvatars: false,
  avatarFetchTimeoutMs: 15_000,
};

const repSchema = z.object({
  pocSlug: z.string().min(1),
  pocName: z.string().min(1).optional(),
  year: z.number().int().gte(1950).lte(2100),
  order: z.number().int().default(0),
});

const personSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  photoUrl: z.string().url().nullable().optional(),
  reps: z.array(repSchema).min(1),
});

const pocDefSchema = z.object({
  slug: z.string().min(1),
  nameNl: z.string().min(1),
  nameEn: z.string().min(1).optional(),
  studyProgrammes: z.array(z.string()).default([]),
});

const fileSchema = z.object({
  pocs: z.array(pocDefSchema).default([]),
  people: z.array(personSchema).min(1),
});

type FileData = z.infer<typeof fileSchema>;

function log(msg: string) {
  process.stdout.write(`[${new Date().toTimeString().slice(0, 8)}] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const inputPath = args.find((a) => !a.startsWith("--")) ?? "scripts/poc-history.json";

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const remoteUrl = getArg("remote");
const remoteEmail = getArg("email");
const remotePassword = getArg("password");

// ---------------------------------------------------------------------------
// S3 Config (Local)
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
    /* fallback to env */
  }
  return { config: env, source: "environment" };
}

setS3ConfigResolver(async () => (await resolveS3()).config);

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
// Remote Import via HTTP
// ---------------------------------------------------------------------------
async function runRemoteImport(data: FileData, base: string, email: string, pass: string) {
  log(`Inloggen op ${base} als ${email}...`);
  const loginResp = await fetch(`${base}/api/auth/better/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
    },
    body: JSON.stringify({ email, password: pass }),
  });

  if (!loginResp.ok) {
    throw new Error(`Inloggen mislukt: HTTP ${loginResp.status} - ${await loginResp.text()}`);
  }

  const setCookie = loginResp.headers.getSetCookie ? loginResp.headers.getSetCookie() : [loginResp.headers.get("set-cookie") || ""];
  const cookie = setCookie.filter(Boolean).join("; ");
  log(`Ingelogd! Cookie verkregen.`);

  const batchSize = 30;
  const totalBatches = Math.ceil(data.people.length / batchSize);
  log(`Importing ${data.people.length} personen in ${totalBatches} batches van ~${batchSize}...`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalAvatars = 0;
  let totalReps = 0;

  for (let b = 0; b < totalBatches; b++) {
    const batchPeople = data.people.slice(b * batchSize, (b + 1) * batchSize);
    log(`Batch ${b + 1}/${totalBatches} (${batchPeople.length} personen: ${batchPeople[0]?.name} ... ${batchPeople[batchPeople.length - 1]?.name})...`);

    const payload = {
      pocs: b === 0 ? data.pocs : undefined, // stuur POC defs enkel in eerste batch
      people: batchPeople,
    };

    const resp = await fetch(`${base}/api/admin/pocs/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: base,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      log(`  ! Batch ${b + 1} faalde: HTTP ${resp.status} - ${errText}`);
      throw new Error(`Batch ${b + 1} failed: ${errText}`);
    }

    const resJson = await resp.json();
    totalCreated += resJson.usersCreated || 0;
    totalUpdated += resJson.usersUpdated || 0;
    totalAvatars += resJson.avatarsUploaded || 0;
    totalReps += resJson.repsWritten || 0;
    log(`  ✓ Batch ${b + 1} voltooid (+${resJson.usersCreated} users, +${resJson.avatarsUploaded} avatars, +${resJson.repsWritten} reps)`);
  }

  log("");
  log("Remote Import Samenvatting:");
  log(`  Users aangemaakt:      ${totalCreated}`);
  log(`  Users bijgewerkt:      ${totalUpdated}`);
  log(`  Avatars geupload:      ${totalAvatars}`);
  log(`  Reps geschreven:       ${totalReps}`);
}

// ---------------------------------------------------------------------------
// Local DB Import
// ---------------------------------------------------------------------------
async function runLocalImport(data: FileData) {
  log("Stap 1/3: POC definities inladen en resolven...");
  const pocMap = new Map<string, string>(); // slug -> id
  const existingPocs = await prisma.poc.findMany({
    select: { id: true, slug: true },
  });
  for (const p of existingPocs) {
    pocMap.set(p.slug, p.id);
  }

  for (const def of data.pocs) {
    if (!pocMap.has(def.slug)) {
      if (!DRY_RUN) {
        const created = await prisma.poc.upsert({
          where: { slug: def.slug },
          create: {
            slug: def.slug,
            nameNl: def.nameNl,
            nameEn: def.nameEn ?? def.nameNl,
            studyProgrammes: (def.studyProgrammes as StudyProgramme[]) ?? [],
            order: 999,
          },
          update: {},
          select: { id: true, slug: true },
        });
        pocMap.set(created.slug, created.id);
        log(`  + POC aangemaakt: ${def.nameNl} (${def.slug})`);
      } else {
        log(`  (dry) zou POC aanmaken: ${def.nameNl} (${def.slug})`);
        pocMap.set(def.slug, `(dry:${def.slug})`);
      }
    }
  }

  if (!DRY_RUN) {
    const { config, source } = await resolveS3();
    log(`  S3-config: ${source} (bucket "${config.bucket}", endpoint ${config.endpoint || "?"})`);
  }

  log(`Stap 2/3: ${data.people.length} personen verwerken...`);
  const total = data.people.length;
  let usersCreated = 0;
  let usersUpdated = 0;
  let avatarsUploaded = 0;
  let repsWritten = 0;
  const errors: string[] = [];

  let i = 0;
  for (const person of data.people) {
    i++;
    const email = CONFIG.dummyEmail(person.id);
    try {
      let userId: string;
      let currentAvatar: string | null = null;

      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, avatarKey: true },
      });

      if (existing) {
        userId = existing.id;
        currentAvatar = existing.avatarKey;
        if (!DRY_RUN) {
          await prisma.user.update({
            where: { id: userId },
            data: { name: person.name },
          });
        }
        usersUpdated++;
      } else {
        if (DRY_RUN) {
          userId = `(dry:${person.id})`;
        } else {
          const created = await prisma.user.create({
            data: {
              email,
              name: person.name,
              active: CONFIG.markInactive ? false : true,
            },
            select: { id: true },
          });
          userId = created.id;
        }
        usersCreated++;
      }

      // Avatar
      if (person.photoUrl && (CONFIG.forceReuploadAvatars || !currentAvatar)) {
        if (DRY_RUN) {
          log(`  (dry) zou foto uploaden voor ${person.name}`);
          avatarsUploaded++;
        } else {
          const key = await uploadAvatarFromUrl(person.photoUrl);
          if (key) {
            await prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
            avatarsUploaded++;
          }
        }
      }

      // Reps
      for (const rep of person.reps) {
        const pocId = pocMap.get(rep.pocSlug);
        if (!pocId) continue;

        if (!DRY_RUN) {
          await prisma.pocRepresentative.upsert({
            where: {
              pocId_userId_year: {
                pocId,
                userId,
                year: rep.year,
              },
            },
            create: {
              pocId,
              userId,
              year: rep.year,
              order: rep.order,
            },
            update: {
              order: rep.order,
            },
          });
        }
        repsWritten++;
      }

      if (i % 25 === 0 || i === total) {
        log(`  voortgang ${i}/${total} verwerkt (${person.name})`);
      }
    } catch (err) {
      const msg = `${person.name} (${person.id}): ${(err as Error).message}`;
      errors.push(msg);
      log(`  FOUT bij ${msg}`);
    }
  }

  log("Stap 3/3: klaar.");
  log("");
  log(`${DRY_RUN ? "[DRY-RUN] " : ""}Samenvatting:`);
  log(`  Users aangemaakt:      ${usersCreated}`);
  log(`  Users bijgewerkt:      ${usersUpdated}`);
  log(`  Avatars geupload:      ${avatarsUploaded}`);
  log(`  Reps geschreven:       ${repsWritten}`);
  if (errors.length > 0) {
    log(`  Fouten:                ${errors.length}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log(`Inlezen van ${inputPath}...`);
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

  if (remoteUrl) {
    const email = remoteEmail || "seppe@vtk.be";
    const pass = remotePassword;
    if (!pass) {
      log("Geef --password mee voor remote import.");
      process.exitCode = 1;
      return;
    }
    await runRemoteImport(data, remoteUrl.replace(/\/+$/, ""), email, pass);
  } else {
    await runLocalImport(data);
  }
}

main()
  .catch((err) => {
    log(`Onverwachte fout: ${(err as Error).stack ?? err}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!remoteUrl) {
      await prisma.$disconnect();
    }
  });
