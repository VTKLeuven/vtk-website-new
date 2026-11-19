import "server-only";

import { createHmac } from "node:crypto";
import { prisma } from "@vtk/db";
import { burgieclanAuthHeaders, type BurgieclanIdentity } from "./signature";

/**
 * Praten met de backend van Burgieclan, namens een lid. Zie
 * `docs/burgieclan-planning.md` voor het geheel.
 *
 * Drie env-vars:
 * - `BURGIECLAN_API_URL`: de publieke basis-URL van de Symfony-backend
 *   (`https://api.burgieclan.be`, lokaal `http://localhost:8000`). Ook de
 *   geëxporteerde agenda staat daar, dus de app krijgt die URL te zien.
 * - `BURGIECLAN_SERVICE_SECRET`: gedeeld met `VTK_SERVICE_SECRET` bij
 *   Burgieclan, minstens 32 tekens.
 * - `BURGIECLAN_CLIENT_ID` (optioneel): de SSO-client van Burgieclan. Enkel
 *   nodig wanneer die client op `pairwise` staat; dan is de `sub` die Burgieclan
 *   kent niet de id van het lid, en rekenen we hem hier na.
 *
 * Ontbreekt een van de eerste twee, dan is de planning in de app gewoon niet
 * beschikbaar (`burgieclanConfig()` geeft `null`), in plaats van een 500.
 */
export type BurgieclanConfig = { apiUrl: string; secret: string; clientId: string | null; siteUrl: string };

export function burgieclanConfig(): BurgieclanConfig | null {
  const apiUrl = process.env.BURGIECLAN_API_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.BURGIECLAN_SERVICE_SECRET?.trim();
  if (!apiUrl || !secret || secret.length < 32) return null;
  return {
    apiUrl,
    secret,
    clientId: process.env.BURGIECLAN_CLIENT_ID?.trim() || null,
    siteUrl: (process.env.BURGIECLAN_URL?.trim() || "https://burgieclan.be").replace(/\/+$/, ""),
  };
}

/** Burgieclan antwoordde met een fout; `status` en `detail` komen van daar. */
export class BurgieclanError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(`Burgieclan antwoordde met HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "BurgieclanError";
  }
}

/** Burgieclan was niet te bereiken. */
export class BurgieclanUnreachableError extends Error {
  constructor(cause: unknown) {
    super("Burgieclan is niet bereikbaar");
    this.name = "BurgieclanUnreachableError";
    this.cause = cause;
  }
}

/**
 * De `sub` van dit lid zoals de SSO-client van Burgieclan hem kreeg.
 *
 * Standaard is dat gewoon de id van het lid (`subject_type: public`). Staat de
 * client op `pairwise`, dan rekent de plugin een HMAC over de host van de eerste
 * redirect-URI en de id (`computePairwiseSub` in `@better-auth/oauth-provider`);
 * dat doen we hier exact na, anders zou Burgieclan het lid niet herkennen en een
 * tweede account aanmaken.
 */
async function subjectFor(userId: string, config: BurgieclanConfig): Promise<string> {
  if (!config.clientId) return userId;
  const client = await prisma.oauthClient.findUnique({
    where: { clientId: config.clientId },
    select: { subjectType: true, redirectUris: true },
  });
  const pairwiseSecret = process.env.OAUTH_PAIRWISE_SECRET;
  if (client?.subjectType !== "pairwise" || !pairwiseSecret) return userId;
  const redirect = client.redirectUris[0];
  if (!redirect) return userId;
  const host = new URL(redirect).host;
  return createHmac("sha256", pairwiseSecret).update(`${host}.${userId}`).digest("base64");
}

export async function burgieclanIdentity(userId: string, config: BurgieclanConfig): Promise<BurgieclanIdentity> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) throw new Error("UNAUTHENTICATED");
  return { sub: await subjectFor(userId, config), email: user.email, name: user.name };
}

/**
 * Eén aanvraag naar Burgieclan namens `userId`. Geeft de JSON terug, of `null`
 * bij een leeg antwoord (204 na het ontkoppelen).
 *
 * Enkel paden onder `/api/study_planner`: Burgieclan aanvaardt de handtekening
 * nergens anders, zodat een gelekt geheim niet de hele site openzet.
 */
export async function burgieclanRequest<T>(
  config: BurgieclanConfig,
  userId: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T | null> {
  const identity = await burgieclanIdentity(userId, config);
  const raw = body === undefined ? "" : JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        // API Platform spreekt daar enkel JSON-LD; de velden zelf zijn gewone JSON.
        Accept: "application/ld+json",
        ...(body === undefined ? {} : { "Content-Type": "application/ld+json" }),
        ...burgieclanAuthHeaders({ secret: config.secret, method, path, body: raw, identity }),
      },
      body: body === undefined ? undefined : raw,
      cache: "no-store",
      // Een sync haalt de lessenrooster-feed van KU Leuven op; die mag even duren.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new BurgieclanUnreachableError(error);
  }

  const text = await response.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const detail =
      json && typeof json === "object"
        ? ((json as { detail?: unknown }).detail ?? (json as { message?: unknown }).message ?? null)
        : null;
    throw new BurgieclanError(response.status, typeof detail === "string" ? detail : null);
  }
  return json as T | null;
}
