"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject, deleteObject } from "@vtk/storage";
import { requireSession } from "@/lib/session";
import {
  MAIL_CATEGORIES,
  EMAIL_PREFERENCES,
  STUDY_YEARS,
  STUDY_PROGRAMMES,
} from "@/lib/profile";

const profileSchema = z.object({
  street: z.string().trim().min(1),
  houseNumber: z.string().trim().min(1),
  bus: z.string().trim().max(20).optional().default(""),
  postalCode: z.string().trim().min(1).max(12),
  city: z.string().trim().min(1),
  birthDate: z.coerce.date(),
  personalEmail: z.string().trim().toLowerCase().email(),
  emailPreference: z.enum(EMAIL_PREFERENCES),
  mailCategories: z.array(z.enum(MAIL_CATEGORIES)).default([]),
  // Optioneel: leeg = geen keuze (niet verplicht in de onboarding).
  studyYear: z.enum(STUDY_YEARS).nullable().default(null),
  studyProgrammes: z.array(z.enum(STUDY_PROGRAMMES)).default([]),
});

const MAX_AVATAR_BYTES = 8 * 1024 * 1024; // 8 MiB before re-encode

/**
 * Store an uploaded avatar: re-encode to a square-ish JPEG, upload to S3 and
 * return the new storage key. Returns `null` when no (valid) file was sent.
 */
async function storeAvatar(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_AVATAR_BYTES) throw new Error("AVATAR_TOO_LARGE");

  const input = Buffer.from(await file.arrayBuffer());
  const body = await sharp(input)
    .rotate()
    .resize(512, 512, { fit: "cover" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  const key = newStorageKey("avatars", "avatar.jpg");
  await putObject(key, body, "image/jpeg");
  return key;
}

/**
 * Save the onboarding / profile fields for the current member. On first
 * completion this stamps `onboardedAt`, which lifts the onboarding gate.
 * Redirects to `next` (onboarding) or returns silently (account edit).
 */
export async function saveProfileAction(formData: FormData): Promise<void> {
  const session = await requireSession();

  const parsed = profileSchema.safeParse({
    street: formData.get("street") ?? "",
    houseNumber: formData.get("houseNumber") ?? "",
    bus: formData.get("bus") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    city: formData.get("city") ?? "",
    birthDate: formData.get("birthDate") ?? "",
    personalEmail: formData.get("personalEmail") ?? "",
    emailPreference: formData.get("emailPreference") ?? "UNIVERSITY",
    mailCategories: formData.getAll("mailCategories"),
    // Leeg select-veld ("") telt als "geen keuze".
    studyYear: formData.get("studyYear") || null,
    studyProgrammes: formData.getAll("studyProgrammes"),
  });

  if (!parsed.success) {
    // Bubble a compact error the client boundary can surface.
    throw new Error("INVALID_PROFILE");
  }
  const data = parsed.data;

  const file = formData.get("photo");
  const newAvatarKey = await storeAvatar(file instanceof File ? file : null);

  const wasOnboarded = session.user.onboarded;
  const previousAvatarKey = session.user.avatarKey;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      street: data.street,
      houseNumber: data.houseNumber,
      bus: data.bus ? data.bus : null,
      postalCode: data.postalCode,
      city: data.city,
      birthDate: data.birthDate,
      personalEmail: data.personalEmail,
      emailPreference: data.emailPreference,
      mailCategories: { set: data.mailCategories },
      studyYear: data.studyYear,
      studyProgrammes: { set: data.studyProgrammes },
      ...(newAvatarKey ? { avatarKey: newAvatarKey } : {}),
      // Stamp completion only once; account edits keep the original timestamp.
      ...(wasOnboarded ? {} : { onboardedAt: new Date() }),
    },
  });

  // Clean up the replaced avatar object (best-effort) to avoid orphans.
  if (newAvatarKey && previousAvatarKey && previousAvatarKey !== newAvatarKey) {
    await deleteObject(previousAvatarKey).catch(() => null);
  }

  // Praesidium/POC pages render the avatar, so refresh them on photo changes.
  revalidatePath("/praesidium");
  revalidatePath("/pocs");
  revalidatePath("/account");

  const next = String(formData.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//")) {
    redirect(next);
  }
}
