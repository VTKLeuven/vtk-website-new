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
