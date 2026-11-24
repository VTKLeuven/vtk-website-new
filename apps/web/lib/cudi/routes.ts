import "server-only";

import { z } from "zod";
import { prisma } from "@vtk/db";
import {
  APP_ERROR,
  appLocaleFrom,
  type AppCudiCancelResult,
  type AppCudiCatalog,
  type AppCudiOrderResult,
  type AppCudiOverview,
  type AppLocale,
  type AppServiceStatus,
} from "@/lib/app-api/contract";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { serviceStatus } from "@/lib/app-api/serviceStatus";
import { getCursusdienstHours } from "@/lib/cursusdienstHours";
import { requireSession } from "@/lib/session";
import { CudiError, CudiUnreachableError, cudiConfig, cudiRequest, type CudiConfig } from "./client";

/**
 * De cursusdienst in de app (`/api/app/v1/cudi/*`). De site beslist hier niets:
 * cudi kent de catalogus, de voorraad, de wachtlijst en de betaling, en elke
 * aanvraag gaat ondertekend door. Zie `lib/cudi/client.ts`.
 */

type Run<T> = (config: CudiConfig, userId: string, locale: AppLocale) => Promise<T>;

async function route<T>(request: Request, run: Run<T>, unavailable: () => T | null): Promise<Response> {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const config = cudiConfig();
    if (!config) {
      const fallback = unavailable();
      return fallback
        ? appJson(request, fallback)
        : appError(request, APP_ERROR.notFound, 404, { message: "De cursusdienst is niet gekoppeld." });
    }
    return appJson(request, await run(config, session.user.id, locale));
  } catch (error) {
    if (error instanceof CudiUnreachableError) {
      return appError(request, APP_ERROR.serverError, 502, {
        message: "De cursusdienst is even niet bereikbaar. Probeer het straks opnieuw.",
      });
    }
    if (error instanceof CudiError) {
      if (error.status === 409 && error.code === "GATE") {
        return appError(request, APP_ERROR.forbidden, 409, { message: error.detail ?? "Rond eerst je account bij de cursusdienst af." });
      }
      if (error.status === 409) {
        return appError(request, APP_ERROR.invalidRequest, 409, { message: error.detail ?? "Dat lukte niet." });
      }
      if (error.status === 401) console.error("[cudi] cudi weigerde de handtekening");
      else console.error("[cudi] onverwacht antwoord", error.status, error.code, error.detail);
      return appError(request, APP_ERROR.serverError, 502, { message: "De koppeling met de cursusdienst werkt even niet." });
    }
    return appErrorResponse(request, error);
  }
}

const CLOSED_ORDERING = { open: false, message: null, paymentMode: "ONSITE_ONLY", onlineCheckout: false } as const;

/** De uren van deze week, zoals de kaart op Home: live van cudi, met de tekst uit /admin/openingsuren. */
async function cudiHours(locale: AppLocale): Promise<AppServiceStatus | null> {
  try {
    const [setting, entries] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "home.openingHours.cursusdienst" } }),
      getCursusdienstHours(locale === "en" ? "en" : "nl"),
    ]);
    return serviceStatus(
      { key: "cursusdienst", service: "cursusdienst", setting: setting?.value, liveEntries: entries },
      locale,
      new Date(),
    );
  } catch (error) {
    console.error("[cudi] openingsuren", error);
    return null;
  }
}

export function overviewRoute(request: Request): Promise<Response> {
  return route<AppCudiOverview>(
    request,
    async (config, userId, locale) => {
      const [raw, hours] = await Promise.all([
        cudiRequest<Omit<AppCudiOverview, "available" | "hours" | "shopUrl"> & { links: { shop: string } }>(
          config,
          userId,
          "GET",
          "overview",
          { locale },
        ),
        cudiHours(locale),
      ]);
      return {
        available: true,
        gate: raw.gate,
        ordering: raw.ordering,
        orders: raw.orders,
        hours,
        shopUrl: raw.links.shop,
      };
    },
    () => ({
      available: false,
      gate: null,
      ordering: CLOSED_ORDERING,
      orders: [],
      hours: null,
      shopUrl: "https://cudi.vtk.be",
    }),
  );
}

export function catalogRoute(request: Request): Promise<Response> {
  return route<AppCudiCatalog>(
    request,
    async (config, userId, locale) => {
      const raw = await cudiRequest<Omit<AppCudiCatalog, "available">>(config, userId, "GET", "catalog", { locale });
      return { available: true, ...raw };
    },
    () => ({
      available: false,
      gate: null,
      ordering: CLOSED_ORDERING,
      hasProfileSubjects: false,
      subjectsUrl: "https://cudi.vtk.be",
      subjects: [],
      general: [],
    }),
  );
}

const orderInput = z.object({
  items: z
    .array(z.object({ articleId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(50),
  paymentChoice: z.enum(["ONSITE", "ONLINE"]).optional(),
});

export function placeOrderRoute(request: Request): Promise<Response> {
  return route<AppCudiOrderResult>(
    request,
    async (config, userId, locale) => {
      const body = orderInput.parse(await readAppJson(request));
      return cudiRequest<AppCudiOrderResult>(config, userId, "POST", "orders", { body, locale });
    },
    () => null,
  );
}

const cancelInput = z.object({ orderItemId: z.string().min(1).max(64) });

export function cancelRoute(request: Request): Promise<Response> {
  return route<AppCudiCancelResult>(
    request,
    async (config, userId, locale) => {
      const body = cancelInput.parse(await readAppJson(request));
      return cudiRequest<AppCudiCancelResult>(config, userId, "POST", "orders/cancel", { body, locale });
    },
    () => null,
  );
}

const checkoutInput = z.object({ orderId: z.string().min(1).max(64) });

export function checkoutRoute(request: Request): Promise<Response> {
  return route<{ checkoutUrl: string }>(
    request,
    async (config, userId, locale) => {
      const body = checkoutInput.parse(await readAppJson(request));
      return cudiRequest<{ checkoutUrl: string }>(config, userId, "POST", "orders/checkout", { body, locale });
    },
    () => null,
  );
}
