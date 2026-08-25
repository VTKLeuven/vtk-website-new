import { z } from "zod";

import { APP_PUSH_TOKEN_PATTERN } from "./contract";

/**
 * De zod-schema's voor wat de app naar de server stuurt.
 *
 * Staan bewust náást `contract.ts` en niet erin: dat bestand wordt letterlijk
 * naar de app-repo gekopieerd, en de app heeft geen enkele reden om een
 * validatiebibliotheek mee te slepen voor een contract dat ze enkel leest.
 * De vormen die allebei de kanten kennen (het patroon van een pushtoken) staan
 * in `contract.ts` en worden hier hergebruikt, zodat er één definitie is.
 */

export const appPushPlatformSchema = z.enum(["ios", "android"]);

export const appPushTokenSchema = z
  .string()
  .trim()
  .min(10)
  .max(256)
  .regex(APP_PUSH_TOKEN_PATTERN, "Geen geldig Expo-pushtoken");

export const appPushRegisterSchema = z.object({
  token: appPushTokenSchema,
  platform: appPushPlatformSchema,
  appVersion: z.string().trim().max(32).optional(),
});

export const appPushUnregisterSchema = z.object({ token: appPushTokenSchema });

/**
 * Een bestelling bij het Theokot.
 *
 * De grenzen hier zijn ruw en dienen enkel om onzin tegen te houden voor het de
 * database raakt; de echte regels (hoeveel per bestelling, hoeveel broodjes van
 * de week, wat er nog in voorraad is) staan in `validateOrderLines` en in de
 * transactie van `placeOrder`. Die twee mogen niet uit elkaar lopen, dus wordt
 * hier bewust niets van overgeschreven.
 */
export const appTheokotOrderSchema = z.object({
  sessionId: z.string().min(1).max(64),
  lines: z
    .array(
      z.object({
        sessionItemId: z.string().min(1).max(64),
        quantity: z.number().int().min(0).max(99),
      }),
    )
    .min(1)
    .max(50),
});

export const appTheokotCancelSchema = z.object({ orderId: z.string().min(1).max(64) });

// -----------------------------------------------------------------------------
// Samen blokken
// -----------------------------------------------------------------------------

/**
 * Het vak is vrij ingetikt en dus rommelig; dat is de bedoeling. Mensen blokken
 * ook voor dingen die niet in de cursusdienst staan, en een keuzelijst zou hen
 * dwingen te liegen. Enkel de lengte wordt begrensd.
 */
const studySubjectSchema = z.string().trim().max(60).optional();

export const appStudyStartSchema = z.object({
  subject: studySubjectSchema,
  subjectHidden: z.boolean().optional(),
});

export const appStudyActionSchema = z.object({
  action: z.enum(["pause", "resume", "heartbeat"]),
  subject: studySubjectSchema,
  subjectHidden: z.boolean().optional(),
});

export const appStudyGroupCreateSchema = z.object({ name: z.string().trim().min(2).max(40) });

export const appStudyGroupJoinSchema = z.object({ code: z.string().trim().min(4).max(16) });

export const appStudyGroupUpdateSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  /** `null` haalt het groepsdoel weg. */
  weeklyGoalMinutes: z.number().int().min(60).max(100_000).nullable().optional(),
});

export const appStudyGoalSchema = z.object({
  dailyGoalMinutes: z.number().int().min(15).max(1440),
});
