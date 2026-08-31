"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject, deleteObject } from "@vtk/storage";
import { requireSession } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentStudyYear } from "@/lib/workingYear";
import { fullName } from "@vtk/auth";
import {
  MAIL_CATEGORIES,
  EMAIL_PREFERENCES,
  STUDY_YEARS,
  STUDY_PROGRAMMES,
  ACADEMIC_STAFF_ROLES,
  R_NUMBER_REGEX,
} from "@/lib/profile";
import { syncUserToBrevo } from "@/lib/brevo/sync";
import {
  addressFieldsFromForm,
  addressFieldsFromUser,
  addressSchema,
  addressUpdate,
} from "@/lib/profile-address";

/**
 * De studievelden, gedeeld door het volledige profielformulier en de jaarlijkse
 * bevestigingspagina (zie {@link confirmStudyAction}). Minstens één profielstatus
 * is nodig; studiejaar en richting blijven optioneel voor studenten.
 *
 * Meerdere jaren mogen, want een lid kan bv. deels in 2de en deels in 3de
 * bachelor zitten.
 */
const studyFieldsSchema = {
  isStudent: z.boolean().default(false),
  studyYears: z.array(z.enum(STUDY_YEARS)).default([]),
  studyProgrammes: z.array(z.enum(STUDY_PROGRAMMES)).default([]),
  notAtFaculty: z.boolean().default(false),
  notStudying: z.boolean().default(false),
  academicStaff: z.boolean().default(false),
  academicStaffRole: z
    .union([z.enum(ACADEMIC_STAFF_ROLES), z.literal("")])
    .default(""),
  internationalStudent: z.boolean().default(false),
  alumni: z.boolean().default(false),
  // Het afstudeerjaar komt als tekst binnen en mag leeg blijven. De ondergrens
  // is het stichtingsjaar van VTK; de bovengrens loopt mee, want wie in juni
  // afstudeert vult dat in september als "vorig jaar" in en wie zijn laatste
  // examen nog moet doen denkt al aan volgend jaar.
  graduationYear: z
    .string()
    .trim()
    .refine((v) => {
      if (v === "") return true;
      if (!/^\d{4}$/.test(v)) return false;
      const year = Number(v);
      return year >= 1920 && year <= new Date().getFullYear() + 1;
    })
    .default(""),
  wasInVtk: z.boolean().default(false),
  alumniMailOptIn: z.boolean().default(false),
};

const studyObjectSchema = z.object(studyFieldsSchema);
type StudyInput = z.infer<typeof studyObjectSchema>;

/** De combinatieregels die zowel onboarding als jaarlijkse bevestiging afdwingen. */
function validateStudy(data: StudyInput, ctx: z.RefinementCtx): void {
  if (!data.isStudent && !data.alumni && !data.academicStaff && !data.notStudying) {
    ctx.addIssue({ code: "custom", message: "SELECT_STATUS" });
  }
  if (data.isStudent && data.notStudying) {
    ctx.addIssue({ code: "custom", message: "CONFLICTING_STATUS" });
  }
  if (data.academicStaff && !data.academicStaffRole) {
    ctx.addIssue({ code: "custom", path: ["academicStaffRole"], message: "ACADEMIC_ROLE_REQUIRED" });
  }
}

const studySchema = studyObjectSchema.superRefine(validateStudy);

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
    isStudent: formData.get("isStudent") === "on",
    studyYears: formData.getAll("studyYears"),
    studyProgrammes: formData.getAll("studyProgrammes"),
    // Niet-aangevinkte checkbox zit niet in de FormData.
    notAtFaculty: formData.get("notAtFaculty") === "on",
    notStudying: formData.get("notStudying") === "on",
    academicStaff: formData.get("academicStaff") === "on",
    academicStaffRole: String(formData.get("academicStaffRole") ?? ""),
    internationalStudent: formData.get("internationalStudent") === "on",
    alumni: formData.get("alumni") === "on",
    graduationYear: String(formData.get("graduationYear") ?? ""),
    wasInVtk: formData.get("wasInVtk") === "on",
    alumniMailOptIn: formData.get("alumniMailOptIn") === "on",
  };
}

/**
 * De studievelden in de vorm waarin Prisma ze wil. Gedeeld door het
 * profielformulier en de jaarlijkse bevestiging, zodat een nieuw veld niet in
 * één van de twee vergeten wordt.
 *
 * De alumni-vervolgvelden worden gewist zodra "ik ben alumnus" uitgaat: het
 * formulier toont ze dan niet meer, dus laten staan zou betekenen dat een
 * afstudeerjaar blijft hangen bij iemand die zegt geen alumnus te zijn.
 */
function studyUpdate(data: StudyInput) {
  return {
    isStudent: data.isStudent,
    studyYears: { set: data.isStudent ? [...data.studyYears] : [] },
    studyProgrammes: { set: data.isStudent ? [...data.studyProgrammes] : [] },
    notAtFaculty: data.isStudent ? data.notAtFaculty : false,
    notStudying: data.notStudying,
    academicStaffRole:
      data.academicStaff && data.academicStaffRole ? data.academicStaffRole : null,
    internationalStudent: data.isStudent ? data.internationalStudent : false,
    alumni: data.alumni,
    graduationYear: data.alumni && data.graduationYear ? Number(data.graduationYear) : null,
    wasInVtk: data.alumni ? data.wasInVtk : false,
    alumniMailOptIn: data.alumni ? data.alumniMailOptIn : false,
  };
}

const profileSchema = z
  .object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    // Optioneel, maar wanneer ingevuld moet het een geldig r-nummer zijn.
    rNumber: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === "" || R_NUMBER_REGEX.test(v), { message: "INVALID_RNUMBER" })
      .default(""),
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
    // Enkel zichtbaar voor wie zich via een mail uitschreef: het lid vraagt
    // expliciet om weer mails te krijgen. Dit is de énige weg terug, zowel op de
    // site als in Brevo (zie lib/brevo/sync.ts).
    mailResubscribe: z.boolean().default(false),
    shiftReminderDayBefore: z.boolean(),
    shiftReminderSoon: z.boolean(),
    calendarOnlyMyAudiences: z.boolean().default(false),
    ...studyFieldsSchema,
  })
  .superRefine(validateStudy)
  .and(addressSchema);

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
    ...addressFieldsFromForm(formData),
    birthDate: formData.get("birthDate") ?? "",
    personalEmail: formData.get("personalEmail") ?? "",
    emailPreference: formData.get("emailPreference") ?? "UNIVERSITY",
    mailCategories: formData.getAll("mailCategories"),
    mailResubscribe: formData.get("mailResubscribe") === "on",
    shiftReminderDayBefore: formData.get("shiftReminderDayBefore") !== null,
    shiftReminderSoon: formData.get("shiftReminderSoon") !== null,
    calendarOnlyMyAudiences: formData.get("calendarOnlyMyAudiences") === "on",
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

  // Een r-nummer dat van de KU Leuven-authenticator komt is read-only (het veld
  // wordt disabled getoond, zie ProfileForm). We dwingen dat ook serverside af:
  // zelfs een gemanipuleerde submit laat het r-nummer dan ongemoeid.
  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { rNumberFromKul: true, mailUnsubscribedAt: true },
  });
  const rNumberLocked = existing?.rNumberFromKul ?? false;
  // Alleen een lid dat écht uitgeschreven stond, schrijft zich opnieuw in; zo
  // blijft een gewone profielopslag een gewone push naar Brevo.
  const resubscribe = existing?.mailUnsubscribedAt != null && data.mailResubscribe;

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        // De weergavenaam blijft afgeleid van voor- + achternaam.
        name: fullName(data.firstName, data.lastName),
        ...(rNumberLocked ? {} : { rNumber: data.rNumber ? data.rNumber : null }),
        ...addressUpdate(data),
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        personalEmail: data.personalEmail || null,
        emailPreference: data.emailPreference,
        mailCategories: { set: data.mailCategories },
        ...(resubscribe ? { mailUnsubscribedAt: null } : {}),
        shiftReminderDayBefore: data.shiftReminderDayBefore,
        shiftReminderSoon: data.shiftReminderSoon,
        calendarOnlyMyAudiences: data.calendarOnlyMyAudiences,
        ...studyUpdate(data),
        // Wie dit formulier invult, declareert daarmee zijn studie voor dit
        // academiejaar; de bevestigingsgate hoeft er dan niet meer op te vallen.
        studyConfirmedYear: data.isStudent ? currentStudyYear() : null,
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

  // Voorkeuren en studie kunnen net gewijzigd zijn: duw het lid naar Brevo zodat
  // de mailinglijsten meteen kloppen. Best-effort na de response (blokkeert het
  // opslaan niet); de dagelijkse reconciliatie is het vangnet als dit faalt.
  after(() => syncUserToBrevo(session.user.id, { resubscribe }));

  // Buiten elke try/catch: redirect() werkt via een throw en mag niet als
  // "onverwachte fout" opgevangen worden.
  const next = safeNext(formData);
  if (next) redirect(next);

  return saveOk();
}

/**
 * Jaarlijkse bevestiging van het studieprofiel en de adressen (zie de gate in
 * `proxy.ts`). Zet `studyConfirmedYear` op het huidige academiejaar, waardoor
 * het lid weer als actief student telt en dus opnieuw in de mailinglijsten komt.
 *
 * De volledige studiekeuze wordt altijd gepost. Voor de adressen kiest het lid
 * expliciet tussen de bestaande waarden bevestigen en aangepaste waarden posten.
 */
export async function confirmStudyAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  // De actie is rechtstreeks aanroepbaar. Een niet-student hoort deze aparte
  // mutatieroute evenmin te gebruiken als de pagina of proxygate.
  if (!session.user.isStudent) redirect(safeNext(formData) ?? "/");
  const parsedStudy = studySchema.safeParse(studyFields(formData));
  if (!parsedStudy.success) throw new Error("INVALID_PROFILE");

  // Bij "de adressen kloppen" vertrouwen we geen verborgen clientwaarden: lees
  // de huidige rij opnieuw. Een oud, onvolledig profiel kan zo evenmin via een
  // handgemaakte POST als correct bevestigd worden.
  const addressCandidate =
    formData.get("addressesCorrect") === "yes"
      ? addressFieldsFromUser(
          await prisma.user.findUniqueOrThrow({
            where: { id: session.user.id },
            select: {
              noKot: true,
              street: true,
              houseNumber: true,
              bus: true,
              postalCode: true,
              city: true,
              homeStreet: true,
              homeHouseNumber: true,
              homeBus: true,
              homePostalCode: true,
              homeCity: true,
            },
          }),
        )
      : addressFieldsFromForm(formData);
  const parsedAddress = addressSchema.safeParse(addressCandidate);
  if (!parsedAddress.success) throw new Error("INVALID_PROFILE");

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...studyUpdate(parsedStudy.data),
      ...addressUpdate(parsedAddress.data),
      studyConfirmedYear: parsedStudy.data.isStudent ? currentStudyYear() : null,
    },
  });

  revalidatePath("/account");
  // Studiejaar/richting/bevestiging kunnen net gewijzigd zijn: houd Brevo gelijk.
  after(() => syncUserToBrevo(session.user.id));
  redirect(safeNext(formData) ?? "/");
}
