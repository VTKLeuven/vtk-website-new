import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject } from "@vtk/storage";
import { requirePermission, authErrorResponse } from "@/lib/session";
import type { StudyProgramme } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImportPocDef = {
  slug: string;
  nameNl: string;
  nameEn?: string;
  studyProgrammes?: string[];
};

type ImportPersonRep = {
  pocSlug: string;
  year: number;
  order: number;
};

type ImportPerson = {
  id: string;
  name: string;
  photoUrl?: string | null;
  reps: ImportPersonRep[];
};

type ImportPayload = {
  pocs?: ImportPocDef[];
  people: ImportPerson[];
  forceReupload?: boolean;
};

const DUMMY_EMAIL = (id: string) => `poc-history+${id}@import.vtk.be`;

async function uploadAvatarFromUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const body = await sharp(input)
      .rotate()
      .resize(512, 512, { fit: "cover" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    const key = newStorageKey("avatars", "avatar.jpg");
    await putObject(key, body, "image/jpeg");
    return key;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("pocs.manage");
  } catch (err) {
    return authErrorResponse(err);
  }

  try {
    const payload = (await request.json()) as ImportPayload;
    const { pocs = [], people = [], forceReupload = false } = payload;

    // 1. Ensure POCs exist
    const pocMap = new Map<string, string>(); // slug -> pocId
    const existingPocs = await prisma.poc.findMany({
      select: { id: true, slug: true },
    });
    for (const p of existingPocs) {
      pocMap.set(p.slug, p.id);
    }

    for (const def of pocs) {
      if (!pocMap.has(def.slug)) {
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
      }
    }

    let usersCreated = 0;
    let usersUpdated = 0;
    let avatarsUploaded = 0;
    let repsWritten = 0;

    for (const person of people) {
      const email = DUMMY_EMAIL(person.id);

      // Find or create user
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, avatarKey: true },
      });

      let userId: string;
      let currentAvatar: string | null = null;

      if (existingUser) {
        userId = existingUser.id;
        currentAvatar = existingUser.avatarKey;
        await prisma.user.update({
          where: { id: userId },
          data: { name: person.name },
        });
        usersUpdated++;
      } else {
        const created = await prisma.user.create({
          data: {
            email,
            name: person.name,
            active: false,
          },
          select: { id: true },
        });
        userId = created.id;
        usersCreated++;
      }

      // Avatar
      if (person.photoUrl && (forceReupload || !currentAvatar)) {
        const key = await uploadAvatarFromUrl(person.photoUrl);
        if (key) {
          await prisma.user.update({
            where: { id: userId },
            data: { avatarKey: key },
          });
          avatarsUploaded++;
        }
      }

      // Reps
      for (const rep of person.reps) {
        const pocId = pocMap.get(rep.pocSlug);
        if (!pocId) continue;

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
        repsWritten++;
      }
    }

    revalidatePath("/pocs");
    revalidatePath("/admin/pocs");
    revalidatePath("/");

    return NextResponse.json({
      success: true,
      usersCreated,
      usersUpdated,
      avatarsUploaded,
      repsWritten,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
