import "server-only";

import type {
  AppBurgieclanEvaluations,
  AppBurgieclanCourse,
  AppBurgieclanCourseDetail,
  AppBurgieclanCourses,
  AppBurgieclanDocument,
  AppBurgieclanFile,
  AppLocale,
} from "@/lib/app-api/contract";
import { appError, appErrorResponse, appJson } from "@/lib/app-api/respond";
import { APP_ERROR, appLocaleFrom } from "@/lib/app-api/contract";
import { requireSession } from "@/lib/session";
import { BurgieclanError, BurgieclanUnreachableError, burgieclanConfig, burgieclanRequest, type BurgieclanConfig } from "./client";

/**
 * Burgieclan in de app: je vakken, hun documenten en een link om er een te
 * openen. De site bewaart er niets van; elke aanvraag gaat ondertekend door naar
 * `VtkAppController` bij Burgieclan, net als de planning (zie
 * `docs/burgieclan-planning.md`, "Vakken en documenten").
 *
 * Wat de app niet kan: uploaden, stemmen, commentaar. Dat blijft op Burgieclan,
 * en `url` op een vak wijst ernaartoe.
 */

type RawCourse = Omit<AppBurgieclanCourse, "url"> & { language?: string };
type RawDocument = Omit<AppBurgieclanDocument, "category"> & {
  category: { id: number; name: string };
  mine?: boolean;
};

function course(config: BurgieclanConfig, raw: RawCourse, locale: AppLocale): AppBurgieclanCourse {
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    credits: raw.credits ?? null,
    semesters: raw.semesters ?? [],
    professors: raw.professors ?? [],
    documentCount: raw.documentCount ?? 0,
    favorite: Boolean(raw.favorite),
    url: `${config.siteUrl}/${locale}/course/${raw.id}`,
  };
}

function document(raw: RawDocument): AppBurgieclanDocument {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category?.name ?? "",
    year: raw.year ?? null,
    author: raw.author ?? null,
    fileSize: raw.fileSize ?? null,
    hasFile: Boolean(raw.hasFile),
    underReview: Boolean(raw.underReview),
    createdAt: raw.createdAt,
  };
}

/** De evaluaties zoals Burgieclan ze stuurt, met enkel de velden van het contract. */
function evaluations(raw: AppBurgieclanEvaluations): AppBurgieclanEvaluations {
  return {
    recentYears: raw.recentYears ?? [],
    sections: (raw.sections ?? []).map((section) => ({
      id: section.id,
      name: section.name,
      description: section.description ?? null,
      rated: Boolean(section.rated),
      lowLabel: section.lowLabel ?? null,
      highLabel: section.highLabel ?? null,
      recent: { average: section.recent?.average ?? null, count: section.recent?.count ?? 0 },
      allTime: { average: section.allTime?.average ?? null, count: section.allTime?.count ?? 0 },
      comments: (section.comments ?? []).map((comment) => ({
        id: comment.id,
        content: comment.content,
        year: comment.year ?? null,
        author: comment.author ?? null,
        createdAt: comment.createdAt,
        score: comment.score ?? 0,
      })),
    })),
  };
}

/** Wat elke route hier doet: sessie, koppeling nakijken, doorgeven, fouten vertalen. */
async function route<T>(
  request: Request,
  run: (config: BurgieclanConfig, userId: string, locale: AppLocale) => Promise<T>,
  unavailable: () => T | null,
): Promise<Response> {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const config = burgieclanConfig();
    if (!config) {
      const fallback = unavailable();
      return fallback
        ? appJson(request, fallback)
        : appError(request, APP_ERROR.notFound, 404, { message: "Burgieclan is niet gekoppeld." });
    }
    return appJson(request, await run(config, session.user.id, locale));
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ID") {
      return appError(request, APP_ERROR.notFound, 404, { message: "Niet gevonden." });
    }
    if (error instanceof BurgieclanUnreachableError) {
      return appError(request, APP_ERROR.serverError, 502, {
        message: "Burgieclan is even niet bereikbaar. Probeer het straks opnieuw.",
      });
    }
    if (error instanceof BurgieclanError) {
      if (error.status === 404) {
        return appError(request, APP_ERROR.notFound, 404, { message: "Niet gevonden op Burgieclan." });
      }
      console.error("[burgieclan] onverwacht antwoord", error.status, error.detail);
      return appError(request, APP_ERROR.serverError, 502, { message: "De koppeling met Burgieclan werkt even niet." });
    }
    return appErrorResponse(request, error);
  }
}

const lang = (locale: AppLocale) => `lang=${locale}`;

export function favouriteCoursesRoute(request: Request): Promise<Response> {
  return route<AppBurgieclanCourses>(
    request,
    async (config, userId, locale) => {
      const raw = await burgieclanRequest<{ courses: RawCourse[] }>(config, userId, "GET", `/api/vtk_app/courses?${lang(locale)}`);
      return {
        available: true,
        courses: (raw?.courses ?? []).map((c) => course(config, c, locale)),
        burgieclanUrl: config.siteUrl,
      };
    },
    () => ({ available: false, courses: [], burgieclanUrl: "https://burgieclan.vtk.be" }),
  );
}

export function searchCoursesRoute(request: Request): Promise<Response> {
  return route<{ courses: AppBurgieclanCourse[] }>(
    request,
    async (config, userId, locale) => {
      const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
      if (q.length < 2) return { courses: [] };
      const raw = await burgieclanRequest<{ courses: RawCourse[] }>(
        config,
        userId,
        "GET",
        `/api/vtk_app/courses/search?q=${encodeURIComponent(q)}&${lang(locale)}`,
      );
      return { courses: (raw?.courses ?? []).map((c) => course(config, c, locale)) };
    },
    () => ({ courses: [] }),
  );
}

function courseId(value: string): number {
  if (!/^\d{1,10}$/.test(value)) throw new Error("INVALID_ID");
  return Number(value);
}

export function courseDetailRoute(request: Request, id: string): Promise<Response> {
  return route<AppBurgieclanCourseDetail>(
    request,
    async (config, userId, locale) => {
      const raw = await burgieclanRequest<{
        course: RawCourse;
        documents: RawDocument[];
        evaluations?: AppBurgieclanEvaluations;
      }>(
        config,
        userId,
        "GET",
        `/api/vtk_app/courses/${courseId(id)}?${lang(locale)}`,
      );
      if (!raw) throw new BurgieclanError(404, null);
      return {
        course: course(config, raw.course, locale),
        documents: raw.documents.map(document),
        // Een oudere Burgieclan stuurt ze niet; dan toont de app enkel de documenten.
        ...(raw.evaluations ? { evaluations: evaluations(raw.evaluations) } : {}),
      };
    },
    () => null,
  );
}

export function favouriteRoute(request: Request, id: string, add: boolean): Promise<Response> {
  return route<{ course: AppBurgieclanCourse }>(
    request,
    async (config, userId, locale) => {
      const raw = await burgieclanRequest<{ course: RawCourse }>(
        config,
        userId,
        add ? "PUT" : "DELETE",
        `/api/vtk_app/courses/${courseId(id)}/favorite?${lang(locale)}`,
      );
      if (!raw) throw new BurgieclanError(404, null);
      return { course: course(config, raw.course, locale) };
    },
    () => null,
  );
}

export function documentFileRoute(request: Request, id: string): Promise<Response> {
  return route<AppBurgieclanFile>(
    request,
    async (config, userId) => {
      const raw = await burgieclanRequest<AppBurgieclanFile>(config, userId, "GET", `/api/vtk_app/documents/${courseId(id)}/file-url`);
      if (!raw?.url) throw new BurgieclanError(404, null);
      return { url: raw.url, expiresInMinutes: raw.expiresInMinutes ?? 10 };
    },
    () => null,
  );
}
