import "server-only";

import type {
  AppLocale,
  AppPlanning,
  AppPlanningMark,
  AppPlanningOccurrence,
  AppPlanningOperation,
} from "@/lib/app-api/contract";
import { appError } from "@/lib/app-api/respond";
import { APP_ERROR } from "@/lib/app-api/contract";
import {
  BurgieclanError,
  BurgieclanUnreachableError,
  burgieclanConfig,
  burgieclanRequest,
  type BurgieclanConfig,
} from "./client";

/**
 * De planning van Burgieclan voor de app: elke aanvraag gaat door naar
 * `/api/study_planner` bij Burgieclan, en het antwoord wordt hier omgezet naar
 * `AppPlanning`. Niets wordt hier bewaard; zo kunnen de app en Burgieclan nooit
 * iets anders tonen.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const list = (v: unknown): Raw[] =>
  Array.isArray(v) ? v.filter((x): x is Raw => typeof x === "object" && x !== null) : [];
const mark = (v: unknown): AppPlanningMark => (v === "event" || v === "rule" ? v : null);

function emptyPlanning(available: boolean, config: BurgieclanConfig | null): AppPlanning {
  return {
    available,
    subscribed: false,
    today: "",
    now: 0,
    lastSync: null,
    syncError: null,
    icsUrl: null,
    feedUrl: null,
    webcalUrl: null,
    burgieclanUrl: `${config?.siteUrl ?? "https://burgieclan.be"}/planner`,
    subjects: [],
    sessions: [],
    items: [],
    vtkEvents: [],
  };
}

export function toAppPlanning(raw: Raw, config: BurgieclanConfig, locale: AppLocale): AppPlanning {
  const feedPath = strOrNull(raw.feedPath);
  const feedUrl = feedPath ? `${config.apiUrl}${feedPath}` : null;
  const prefix = locale === "en" ? "/en" : "";
  return {
    ...emptyPlanning(true, config),
    burgieclanUrl: `${config.siteUrl}${prefix}/planner`,
    subscribed: raw.subscribed === true,
    today: str(raw.today),
    now: num(raw.now),
    lastSync: strOrNull(raw.lastSync),
    syncError: strOrNull(raw.syncError),
    icsUrl: strOrNull(raw.icsUrl),
    feedUrl,
    webcalUrl: feedUrl ? feedUrl.replace(/^https?:/, "webcal:") : null,
    subjects: list(raw.subjects).map((s) => ({ key: str(s.key), label: str(s.label) })),
    sessions: list(raw.events).map((e) => {
      const courseId = typeof e.courseId === "number" ? e.courseId : null;
      return {
        uid: str(e.uid),
        date: str(e.date),
        start: str(e.start),
        end: strOrNull(e.end),
        startMin: num(e.startMin),
        endMin: num(e.endMin),
        course: str(e.course),
        code: strOrNull(e.code),
        subject: str(e.subject),
        type: str(e.type) || "other",
        location: strOrNull(e.location),
        people: strOrNull(e.people),
        done: e.done === true,
        hidden: mark(e.hidden),
        hiddenRule: strOrNull(e.hiddenRule),
        mandatory: mark(e.mandatory),
        mandatoryRule: strOrNull(e.mandatoryRule),
        courseUrl: courseId !== null ? `${config.siteUrl}${prefix}/course/${courseId}` : null,
      };
    }),
    items: list(raw.items).map((i) => ({
      id: str(i.id),
      subject: str(i.subject),
      subjectLabel: str(i.subjectLabel),
      kind: i.kind === "mandatory" ? ("mandatory" as const) : ("deadline" as const),
      title: str(i.title),
      date: str(i.date),
      time: strOrNull(i.time),
      end: strOrNull(i.end),
      note: str(i.note),
      done: typeof i.done === "string" && i.done !== "",
    })),
    vtkEvents: list(raw.vtkEvents).map((v) => ({
      id: str(v.id),
      title: (locale === "en" ? strOrNull(v.titleEn) : null) ?? str(v.titleNl),
      location: strOrNull(v.location),
      url: (locale === "en" ? strOrNull(v.urlEn) : null) ?? str(v.urlNl),
      occurrences: list(v.occurrences).map(
        (o): AppPlanningOccurrence => ({
          key: str(o.key),
          date: str(o.date),
          endDate: str(o.endDate) || str(o.date),
          start: strOrNull(o.start),
          end: strOrNull(o.end),
          startMin: num(o.startMin),
          endMin: num(o.endMin),
          allDay: o.allDay === true,
          label: strOrNull(o.label),
          location: strOrNull(o.location),
        }),
      ),
    })),
  };
}

export type PlanningCall =
  | { kind: "get" }
  | { kind: "subscribe"; icsUrl: string }
  | { kind: "unsubscribe" }
  | { kind: "sync" }
  | { kind: "rotateFeed" }
  | { kind: "operation"; operation: AppPlanningOperation };

/**
 * Voert één aanvraag uit en geeft de planning daarna terug. Zonder koppeling
 * met Burgieclan: een lege planning met `available: false`.
 */
export async function runPlanning(userId: string, locale: AppLocale, call: PlanningCall): Promise<AppPlanning> {
  const config = burgieclanConfig();
  if (!config) return emptyPlanning(false, null);

  let raw: Raw | null;
  switch (call.kind) {
    case "get":
      raw = await burgieclanRequest<Raw>(config, userId, "GET", "/api/study_planner");
      break;
    case "subscribe":
      raw = await burgieclanRequest<Raw>(config, userId, "POST", "/api/study_planner/subscription", {
        icsUrl: call.icsUrl,
      });
      break;
    case "unsubscribe":
      await burgieclanRequest(config, userId, "DELETE", "/api/study_planner");
      raw = await burgieclanRequest<Raw>(config, userId, "GET", "/api/study_planner");
      break;
    case "sync":
      raw = await burgieclanRequest<Raw>(config, userId, "POST", "/api/study_planner/sync", {});
      break;
    case "rotateFeed":
      raw = await burgieclanRequest<Raw>(config, userId, "POST", "/api/study_planner/feed_token", {});
      break;
    case "operation":
      raw = await burgieclanRequest<Raw>(config, userId, "POST", "/api/study_planner/operations", call.operation);
      break;
  }
  return toAppPlanning(raw ?? {}, config, locale);
}

/**
 * Een fout van Burgieclan als antwoord van de app-API, met een Nederlandse
 * melding waar we weten wat er bedoeld is. Burgieclan antwoordt in het Engels;
 * de app is Nederlands.
 */
export function planningErrorResponse(request: Request, error: unknown): Response | null {
  if (error instanceof BurgieclanUnreachableError) {
    return appError(request, APP_ERROR.serverError, 502, {
      message: "Burgieclan is even niet bereikbaar. Probeer het straks opnieuw.",
    });
  }
  if (!(error instanceof BurgieclanError)) return null;

  switch (error.status) {
    case 401:
      // Het geheim klopt niet aan een van de twee kanten: een configuratiefout,
      // niet iets wat het lid kan oplossen.
      console.error("[planning] Burgieclan weigerde de handtekening", error.detail);
      return appError(request, APP_ERROR.serverError, 502, {
        message: "De koppeling met Burgieclan werkt even niet.",
      });
    case 404:
      return appError(request, APP_ERROR.notFound, 404, {
        message:
          error.detail === "Unknown VTK event."
            ? "Dat evenement staat niet (meer) op de kalender."
            : error.detail === "Add your timetable first."
              ? "Koppel eerst je lessenrooster."
              : "Niet gevonden in je planning.",
      });
    case 422:
      return appError(request, APP_ERROR.invalidRequest, 422, {
        message:
          "Dit is geen link van het KU Leuven-lessenrooster. Kopieer de abonnementslink uit je lessenrooster (ze begint met webcal://cloud.timeedit.net/be_kuleuven/).",
      });
    case 429:
      return appError(request, APP_ERROR.invalidRequest, 429, {
        message: "Even rustig aan. Probeer het binnen een minuut opnieuw.",
      });
    case 503:
      return appError(request, APP_ERROR.serverError, 503, {
        message: "De kalender van VTK is even niet bereikbaar voor Burgieclan. Probeer het straks opnieuw.",
      });
    default:
      if (error.status >= 400 && error.status < 500) {
        return appError(request, APP_ERROR.invalidRequest, 400, {
          message: error.detail ?? "Burgieclan aanvaardde die wijziging niet.",
        });
      }
      console.error("[planning] Burgieclan gaf een fout", error.status, error.detail);
      return appError(request, APP_ERROR.serverError, 502, {
        message: "Burgieclan gaf een fout. Probeer het straks opnieuw.",
      });
  }
}
