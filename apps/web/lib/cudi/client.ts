import "server-only";

import { prisma } from "@vtk/db";
import { signCudiRequest } from "./signature";

/**
 * Praten met cudi.vtk.be namens een lid, voor de cursusdienst in de app.
 *
 * Hetzelfde stramien als bij Burgieclan (`lib/burgieclan/client.ts`): de app
 * kent cudi niet en logt er niet in; vtk.be zegt in een ondertekende kop wie het
 * lid is, en cudi zoekt of maakt de student (`lib/vtk-app/` in de repo
 * cursusdienst). Zie `docs/cursusdienst-integratie.md`, "3. De VTK-app".
 *
 * - `CURSUSDIENST_ORIGIN`: cudi, standaard `https://cudi.vtk.be` (dezelfde als
 *   voor de openingsuren en de shiftbrug).
 * - `CUDI_APP_SECRET`: gelijk aan `VTK_APP_SECRET` bij cudi, minstens 32 tekens.
 *   Bewust een ander geheim dan `CUDI_SYNC_SECRET`: dit laat bestellen namens
 *   een student toe, en hoort niet samen te lekken met de shiftbrug.
 * - `CUDI_ASSOCIATION`: de kring op cudi, standaard `vtk`.
 *
 * Ontbreekt het geheim, dan is de cursusdienst in de app niet beschikbaar
 * (`cudiConfig()` geeft `null`) in plaats van een 500.
 */
export type CudiConfig = { origin: string; secret: string; association: string };

export function cudiConfig(): CudiConfig | null {
  const secret = process.env.CUDI_APP_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return {
    origin: (process.env.CURSUSDIENST_ORIGIN?.trim() || "https://cudi.vtk.be").replace(/\/+$/, ""),
    secret,
    association: process.env.CUDI_ASSOCIATION?.trim() || "vtk",
  };
}

export class CudiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly detail: string | null,
  ) {
    super(`cudi antwoordde met HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "CudiError";
  }
}

export class CudiUnreachableError extends Error {
  constructor(cause: unknown) {
    super("cudi is niet bereikbaar");
    this.name = "CudiUnreachableError";
    this.cause = cause;
  }
}

async function identityFor(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, firstName: true, lastName: true, rNumber: true },
  });
  if (!user) throw new Error("UNAUTHENTICATED");
  const claims = {
    sub: userId,
    email: user.email,
    name: user.name,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    rNumber: user.rNumber ?? null,
  };
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
}

/**
 * Eén aanvraag naar `/api/integrations/vtk-app/<path>` namens `userId`.
 * Geeft de JSON terug, ook bij een verwachte weigering (`{ ok: false }` komt
 * met status 200); een HTTP-fout wordt een `CudiError`.
 */
export async function cudiRequest<T>(
  config: CudiConfig,
  userId: string,
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; locale?: "nl" | "en" } = {},
): Promise<T> {
  const fullPath = `/api/integrations/vtk-app/${path}`;
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  const user = await identityFor(userId);
  const timestamp = Math.floor(Date.now() / 1000);
  const lang = options.locale ?? "nl";
  const url = `${config.origin}${fullPath}?association=${encodeURIComponent(config.association)}&lang=${lang}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(raw ? { "Content-Type": "application/json" } : {}),
        // `tr()` bij cudi leest de taal uit deze cookie.
        Cookie: `language=${lang}`,
        "X-Vtk-User": user,
        "X-Vtk-Timestamp": String(timestamp),
        "X-Vtk-Signature": signCudiRequest({ secret: config.secret, method, path: fullPath, timestamp, user, body: raw }),
      },
      body: raw || undefined,
      cache: "no-store",
      // Een bestelling wacht bij drukte op een vrije plaats (de poort in cudi wacht tot 30 s).
      signal: AbortSignal.timeout(40_000),
    });
  } catch (error) {
    throw new CudiUnreachableError(error);
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const body = (json ?? {}) as { error?: unknown; message?: unknown };
    throw new CudiError(
      response.status,
      typeof body.error === "string" ? body.error : null,
      typeof body.message === "string" ? body.message : null,
    );
  }
  return json as T;
}
