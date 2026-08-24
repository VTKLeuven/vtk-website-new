import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { applyCors } from "@/lib/cors";
import { APP_ERROR, type AppErrorBody } from "./contract";

/**
 * De antwoordlaag van `/api/app/v1/*`.
 *
 * Eén plek waar de vorm van een geslaagd antwoord en van een fout vastligt, en
 * één plek waar de CORS-headers opgezet worden. De app leest de `error`-code en
 * niet de tekst, dus die codes zijn contract; zie `contract.ts`.
 */

/** Geslaagd antwoord. Altijd JSON, altijd met de CORS-headers erop. */
export function appJson<T>(request: Request, data: T, status = 200): Response {
  return applyCors(request, NextResponse.json(data, { status }));
}

export function appError(
  request: Request,
  error: string,
  status: number,
  extra?: Omit<AppErrorBody, "error">,
): Response {
  return applyCors(request, NextResponse.json({ error, ...extra }, { status }));
}

/**
 * Zet een gegooide fout om in het juiste antwoord.
 *
 * De verwachte fouten (`UNAUTHENTICATED` en `FORBIDDEN` uit `lib/session.ts`,
 * en een `ZodError` uit het parsen van de body) krijgen hun eigen status. Al de
 * rest is onverwacht en gaat als 500 naar buiten, met de echte fout in de logs
 * en niet in het antwoord: een stacktrace hoort niet op een telefoon te landen.
 */
export function appErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof ZodError) {
    return appError(request, APP_ERROR.invalidRequest, 400, {
      fields: error.flatten().fieldErrors as Record<string, string[]>,
      message: "De aanvraag klopt niet.",
    });
  }

  if (error instanceof SyntaxError) {
    return appError(request, APP_ERROR.invalidRequest, 400, { message: "Onleesbare aanvraag." });
  }

  if (error instanceof Error) {
    if (error.message === "BODY_TOO_LARGE") {
      return appError(request, APP_ERROR.invalidRequest, 413, { message: "Aanvraag te groot." });
    }
    if (error.message === "UNAUTHENTICATED") {
      return appError(request, APP_ERROR.unauthenticated, 401, {
        message: "Je moet ingelogd zijn.",
      });
    }
    if (error.message === "FORBIDDEN") {
      return appError(request, APP_ERROR.forbidden, 403, {
        message: "Je hebt hier geen toegang toe.",
      });
    }
  }

  console.error("[app-api] onverwachte fout", error);
  return appError(request, APP_ERROR.serverError, 500, {
    message: "Er ging iets mis. Probeer het straks opnieuw.",
  });
}

export function appNotFound(request: Request, message = "Niet gevonden."): Response {
  return appError(request, APP_ERROR.notFound, 404, { message });
}

/**
 * Leest een JSON-body met een harde bovengrens.
 *
 * Zonder grens is elke POST een manier om geheugen op te eten. 64 kB is ruim
 * voor alles wat de app stuurt (een bestelling is een handvol regels); uploads
 * lopen niet langs hier.
 */
export async function readAppJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) throw new Error("BODY_TOO_LARGE");

  const text = await request.text();
  if (text.length > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (!text) return {};
  return JSON.parse(text) as unknown;
}
