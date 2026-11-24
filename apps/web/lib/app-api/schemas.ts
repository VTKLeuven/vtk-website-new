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

const theokotLinesSchema = z
  .array(
    z.object({
      sessionItemId: z.string().min(1).max(64),
      quantity: z.number().int().min(0).max(99),
    }),
  )
  .max(50);

/** Een reservatie aanpassen; de regels staan in `updateOrder`. */
export const appTheokotUpdateSchema = z.object({
  orderId: z.string().min(1).max(64),
  lines: theokotLinesSchema.min(1),
});

/** Na de deadline vrijgeven; zonder `lines` alles. De regels staan in `releaseOrder`. */
export const appTheokotReleaseSchema = z.object({
  orderId: z.string().min(1).max(64),
  lines: theokotLinesSchema.optional(),
});

export const appTheokotTakeoverSchema = z.object({ sessionItemId: z.string().min(1).max(64) });

/**
 * Antwoorden op een peiling. Ruwe grenzen; welke waarde bij welke vraag mag,
 * beslist `parsePollAnswers`, net als voor het formulier op de site.
 */
export const appPollAnswerSchema = z.object({
  pollId: z.string().min(1).max(64),
  answers: z.record(z.string().min(1).max(64), z.string().max(4000)),
});

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

/**
 * De planning van Burgieclan (`AppPlanningOperation`). Burgieclan valideert
 * alles zelf nog eens; dit houdt enkel een onzinnige body weg voor hij de deur
 * uit gaat.
 */
const planningId = z.string().min(1).max(255);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** "course:<id>" of "name:<naam>", zoals de sleutels in `subjects`. */
const planningSubject = z.string().trim().min(1).max(210);
const planningExamInput = z.object({ subject: planningSubject, date: isoDate, time: hhmm.nullable() });
const planningTaskInput = z
  .object({ date: isoDate, subject: planningSubject.nullable(), title: z.string().trim().max(200) })
  .refine((task) => task.subject !== null || task.title !== "", { message: "Een taak heeft een vak of een titel." });

export const appPlanningOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.enum(["done", "hide", "mandatory"]), uid: planningId, value: z.boolean() }),
  z.object({ op: z.literal("keepOnly"), uid: planningId }),
  z.object({ op: z.literal("addRule"), uid: planningId, action: z.enum(["hide", "mandatory"]) }),
  z.object({ op: z.literal("removeRule"), id: z.string().min(1).max(32) }),
  z.object({ op: z.literal("itemDone"), id: z.string().min(1).max(32), value: z.boolean() }),
  z.object({ op: z.literal("deleteItem"), id: z.string().min(1).max(32) }),
  z.object({
    op: z.literal("addItem"),
    item: z.object({
      subject: z.string().min(1).max(255),
      kind: z.enum(["deadline", "mandatory"]),
      title: z.string().trim().min(1).max(200),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: hhmm.nullable(),
      end: hhmm.nullable(),
      note: z.string().max(2000),
    }),
  }),
  z.object({ op: z.enum(["addVtkEvent", "removeVtkEvent"]), vtkEventId: z.string().min(1).max(64) }),
  // De blokkalender. Burgieclan kijkt het vak na ("course:<id>" moet bestaan).
  z.object({ op: z.literal("addExam"), exam: planningExamInput }),
  z.object({ op: z.literal("updateExam"), id: planningId, exam: planningExamInput }),
  z.object({ op: z.literal("deleteExam"), id: planningId }),
  z.object({ op: z.literal("addTask"), task: planningTaskInput }),
  z.object({ op: z.literal("updateTask"), id: planningId, task: planningTaskInput }),
  z.object({ op: z.literal("deleteTask"), id: planningId }),
  z.object({ op: z.literal("taskDone"), id: planningId, value: z.boolean() }),
  z.object({ op: z.literal("catchUp"), date: isoDate }),
  z.object({ op: z.literal("freeDay"), date: isoDate, value: z.boolean() }),
]);

export const appPlanningSubscriptionSchema = z.object({ icsUrl: z.string().trim().min(1).max(1000) });

/**
 * Een gebruiksrapport van de app (`AppUsageReport`). Ruim begrensd: dit is
 * statistiek, en een rapport dat er net naast zit, wordt liever ingekort dan
 * geweigerd. Wat niet past, valt weg in `lib/app-api/usage.ts`.
 */
const shortText = (max: number) => z.string().trim().max(max);
export const appUsageReportSchema = z.object({
  installId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  platform: z.enum(["ios", "android"]),
  osVersion: shortText(40).nullable().catch(null),
  deviceModel: shortText(80).nullable().catch(null),
  appVersion: shortText(40).nullable().catch(null),
  runtimeVersion: shortText(60).nullable().catch(null),
  updateId: shortText(64).nullable().catch(null),
  channel: shortText(40).nullable().catch(null),
  expoGo: z.boolean().catch(false),
  locale: z.enum(["nl", "en"]).catch("nl"),
  pushEnabled: z.boolean().nullable().catch(null),
  sessionId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  sessionStartedAt: z.string().datetime({ offset: true }),
  activeSeconds: z.number().int().min(0).max(86_400).catch(0),
  screens: z
    .array(z.object({ screen: shortText(80).min(1), tab: shortText(20).nullable(), views: z.number().int().min(1).max(10_000) }))
    .max(200)
    .catch([]),
  events: z
    .array(z.object({ kind: z.string().regex(/^[a-z0-9_:.-]{1,40}$/), at: z.string().datetime({ offset: true }) }))
    .max(200)
    .catch([]),
});
