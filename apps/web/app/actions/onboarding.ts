"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject, deleteObject } from "@vtk/storage";
import { requireSession } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentWorkingYear } from "@/lib/workingYear";
import { fullName } from "@vtk/auth";
import {
  MAIL_CATEGORIES,
  EMAIL_PREFERENCES,
  STUDY_YEARS,
  STUDY_PROGRAMMES,
  R_NUMBER_REGEX,
} from "@/lib/profile";

/**
 * De studievelden, gedeeld door het volledige profielformulier en de jaarlijkse
 * bevestigingspagina (zie {@link confirmStudyAction}). Alles is optioneel: de
 * registratie mag er niet op blokkeren.
 *
 * Meerdere jaren mogen, want een lid kan bv. deels in 2de en deels in 3de
 * bachelor zitten.
 */
const studySchema = {
  studyYears: z.array(z.enum(STUDY_YEARS)).default([]),
  studyProgrammes: z.array(z.enum(STUDY_PROGRAMMES)).default([]),
  notAtFaculty: z.boolean().default(false),
};

/**
 * De `next`-waarde uit een formulier, of `null`. Enkel paden op deze site:
 * `//evil.com` is voor een browser een protocol-relatieve URL, dus die moet er
 * expliciet uit.
 */
function safeNext(formData: FormData): string | null {
  const next = String(formData.get("next") ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** De studievelden uit een FormData halen, in de vorm die {@link studySchema} verwacht. */
function studyFields(formData: FormData) {
  return {
    studyYears: formData.getAll("studyYears"),
    studyProgrammes: formData.getAll("studyProgrammes"),
    // Niet-aangevinkte checkbox zit niet in de FormData.
    notAtFaculty: formData.get("notAtFaculty") === "on",
  };
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  // Optioneel, maar wanneer ingevuld moet het een geldig r-nummer zijn.
  rNumber: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || R_NUMBER_REGEX.test(v), { message: "INVALID_RNUMBER" })
    .default(""),
  street: z.string().trim().max(120).default(""),
  houseNumber: z.string().trim().max(20).default(""),
  bus: z.string().trim().max(20).optional().default(""),
  postalCode: z.string().trim().max(12).default(""),
  city: z.string().trim().max(120).default(""),
  birthDate: z
    .string()
    .trim()
    .refine((value) => value === "" || !Number.isNaN(Date.parse(value)))
    .default(""),
  personalEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === "" || z.string().email().safeParse(value).success)
    .default(""),
  emailPreference: z.enum(EMAIL_PREFERENCES),
  mailCategories: z.array(z.enum(MAIL_CATEGORIES)).default([]),
  ...studySchema,
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

/** Fouten die het lid zelf kan oplossen; `ProfileForm` vertaalt ze naar een toast. */
export type ProfileErrorCode =
  | "INVALID_PROFILE"
  | "RNUMBER_TAKEN"
  | "AVATAR_TOO_LARGE"
  | "AVATAR_FAILED";

/**
 * Save the onboarding / profile fields for the current member. On first
 * completion this stamps `onboardedAt`, which lifts the onboarding gate.
 * Redirects to `next` (onboarding) or returns a result the form can surface as
 * a toast (account edit).
 *
 * Verwachte invoerfouten komen als `status: "error"` terug in plaats van als
 * throw: een lid dat een r-nummer hergebruikt hoort een melding te zien, geen
 * error boundary. Onverwachte serverfouten blijven wel gooien.
 */
export async function saveProfileAction(
  _prevState: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();

  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    rNumber: formData.get("rNumber") ?? "",
    street: formData.get("street") ?? "",
    houseNumber: formData.get("houseNumber") ?? "",
    bus: formData.get("bus") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    city: formData.get("city") ?? "",
    birthDate: formData.get("birthDate") ?? "",
    personalEmail: formData.get("personalEmail") ?? "",
    emailPreference: formData.get("emailPreference") ?? "UNIVERSITY",
    mailCategories: formData.getAll("mailCategories"),
    ...studyFields(formData),
  });

  if (!parsed.success) {
    return saveError("INVALID_PROFILE" satisfies ProfileErrorCode);
  }
  const data = parsed.data;

  const file = formData.get("photo");
  let newAvatarKey: string | null = null;
  try {
    newAvatarKey = await storeAvatar(file instanceof File ? file : null);
  } catch (err) {
    // Te groot is een invoerfout; een kapotte upload of onbereikbare S3 valt
    // hier ook binnen en mag het lid niet op een crashpagina zetten.
    const tooLarge = err instanceof Error && err.message === "AVATAR_TOO_LARGE";
    return saveError(
      (tooLarge ? "AVATAR_TOO_LARGE" : "AVATAR_FAILED") satisfies ProfileErrorCode,
    );
  }

  const wasOnboarded = session.user.onboarded;
  const previousAvatarKey = session.user.avatarKey;

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        // De weergavenaam blijft afgeleid van voor- + achternaam.
        name: fullName(data.firstName, data.lastName),
        rNumber: data.rNumber ? data.rNumber : null,
        street: data.street || null,
        houseNumber: data.houseNumber || null,
        bus: data.bus ? data.bus : null,
        postalCode: data.postalCode || null,
        city: data.city || null,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        personalEmail: data.personalEmail || null,
        emailPreference: data.emailPreference,
        mailCategories: { set: data.mailCategories },
        studyYears: { set: data.studyYears },
        studyProgrammes: { set: data.studyProgrammes },
        notAtFaculty: data.notAtFaculty,
        // Wie dit formulier invult, declareert daarmee zijn studie voor dit
        // werkingsjaar; de bevestigingsgate hoeft er dan niet meer op te vallen.
        studyConfirmedYear: currentWorkingYear(),
        ...(newAvatarKey ? { avatarKey: newAvatarKey } : {}),
        // Stamp completion only once; account edits keep the original timestamp.
        ...(wasOnboarded ? {} : { onboardedAt: new Date() }),
      },
    });
  } catch (err) {
    // `rNumber` is uniek: een r-nummer dat al bij een ander lid hangt, is geen
    // serverfout maar een invoerfout.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      String(err.meta?.target ?? "").includes("rNumber")
    ) {
      return saveError("RNUMBER_TAKEN" satisfies ProfileErrorCode);
    }
    // Onverwachte serverfouten blijven gooien: die horen in de error boundary
    // en in de monitoring, niet in een toast die "probeer opnieuw" suggereert.
    throw err;
  }

  // Clean up the replaced avatar object (best-effort) to avoid orphans.
  if (newAvatarKey && previousAvatarKey && previousAvatarKey !== newAvatarKey) {
    await deleteObject(previousAvatarKey).catch(() => null);
  }

  // Praesidium/POC pages render the avatar, so refresh them on photo changes.
  revalidatePath("/praesidium");
  revalidatePath("/pocs");
  revalidatePath("/account");

  // Buiten elke try/catch: redirect() werkt via een throw en mag niet als
  // "onverwachte fout" opgevangen worden.
  const next = safeNext(formData);
  if (next) redirect(next);

  return saveOk();
}

const confirmStudySchema = z.object(studySchema);

/**
 * Jaarlijkse bevestiging van het studieprofiel (zie de gate in
 * `app/[locale]/layout.tsx`). Zet `studyConfirmedYear` op het huidige
 * werkingsjaar, waardoor het lid weer als actief student telt en dus opnieuw in
 * de mailinglijsten komt.
 *
 * Bewust géén aparte "bevestigd zonder wijziging"-flow: het formulier post altijd
 * de volledige studiekeuze, of ze nu gewijzigd is of niet.
 */
export async function confirmStudyAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = confirmStudySchema.safeParse(studyFields(formData));
  if (!parsed.success) throw new Error("INVALID_PROFILE");

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      studyYears: { set: parsed.data.studyYears },
      studyProgrammes: { set: parsed.data.studyProgrammes },
      notAtFaculty: parsed.data.notAtFaculty,
      studyConfirmedYear: currentWorkingYear(),
    },
  });

  revalidatePath("/account");
  redirect(safeNext(formData) ?? "/");
}
