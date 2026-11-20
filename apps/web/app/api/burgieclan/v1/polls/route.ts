import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { ZodError } from "zod";

import { appLocaleFrom } from "@/lib/app-api/contract";
import { appPollAnswerSchema } from "@/lib/app-api/schemas";
import { burgieclanConfig } from "@/lib/burgieclan/client";
import { verifyBurgieclanRequest, type BurgieclanIdentity } from "@/lib/burgieclan/signature";
import { appPollsFor, submitAppPollAnswers } from "@/lib/pocPolls/appPolls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Een antwoord met vijf open vragen van 2000 tekens past hier ruim in. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * De POC-peilingen op Burgieclan (`docs/burgieclan-planning.md`, "Peilingen").
 *
 * De omgekeerde richting van de planning: hier vraagt de backend van Burgieclan
 * iets namens een lid, ondertekend met hetzelfde geheim
 * (`verifyBurgieclanRequest`). Het pad zit in de handtekening, dus een
 * gelekte handtekening voor deze route opent niets anders.
 *
 * - `GET ?locale=nl|en`: de open peilingen voor dit lid, als `AppPolls`.
 * - `POST { pollId, answers }`: antwoorden, zoals de app ze stuurt.
 *
 * Burgieclan bewaart niets: de antwoorden komen hier in dezelfde anonieme tabel
 * als die van de homepage, de app en Discord, dus wie op twee plaatsen
 * antwoordt, telt één keer.
 */
export async function GET(request: Request) {
  const member = await memberFor(request, "");
  if (member instanceof Response) return member;

  const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
  return json(await appPollsFor(member, locale));
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ error: "BODY_TOO_LARGE" }, 413);

  const member = await memberFor(request, raw);
  if (member instanceof Response) return member;

  let input: { pollId: string; answers: Record<string, string> };
  try {
    input = appPollAnswerSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return json({ error: "INVALID_REQUEST" }, 400);
    throw error;
  }

  const code = await submitAppPollAnswers(member, input.pollId, input.answers);
  if (code) return json({ error: code }, code === "POLL_CLOSED" ? 409 : 422);

  // De strook op de site hoort meteen te verdwijnen, ook voor wie op Burgieclan antwoordde.
  revalidatePath("/", "layout");
  return json({ ok: true });
}

/**
 * Het lid waarvoor Burgieclan spreekt, of het antwoord dat de aanvraag weigert.
 *
 * Burgieclan kent het lid onder de `sub` die het bij de SSO kreeg, en dat is
 * de id hier (een publieke client). Lukt dat niet, dan op het universitaire
 * adres, zoals Burgieclan zelf een account koppelt. Een verwijderd account
 * krijgt geen peilingen.
 */
async function memberFor(request: Request, body: string): Promise<string | Response> {
  const config = burgieclanConfig();
  if (!config) return json({ error: "NOT_CONFIGURED" }, 503);

  const identity = verifyBurgieclanRequest({
    secret: config.secret,
    method: request.method,
    path: new URL(request.url).pathname,
    body,
    headers: request.headers,
  });
  if (!identity) {
    console.warn("[burgieclan] handtekening op /api/burgieclan/v1/polls klopt niet");
    return json({ error: "UNAUTHENTICATED" }, 401);
  }

  const userId = await findMember(identity);
  return userId ?? json({ error: "UNKNOWN_MEMBER" }, 404);
}

async function findMember(identity: BurgieclanIdentity): Promise<string | null> {
  const select = { id: true, deletedAt: true } as const;
  const user =
    (await prisma.user.findUnique({ where: { id: identity.sub }, select })) ??
    (await prisma.user.findFirst({ where: { email: { equals: identity.email, mode: "insensitive" } }, select }));
  return user && !user.deletedAt ? user.id : null;
}

function json(body: unknown, status = 200): Response {
  // Per lid: nooit door een proxy of de HTTP-cache bewaard.
  return NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } });
}
