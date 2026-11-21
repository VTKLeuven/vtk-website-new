import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { z, ZodError } from "zod";

import { sendStudyGroupStartPush } from "@/lib/app-api/notifications";
import { startStudySession, stopStudySession, updateStudySession } from "@/lib/app-api/study";
import { burgieclanConfig } from "@/lib/burgieclan/client";
import { verifyBurgieclanRequest, type BurgieclanIdentity } from "@/lib/burgieclan/signature";
import { burgieclanStudy } from "@/lib/burgieclan/study";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

const actionSchema = z.object({
  action: z.enum(["start", "pause", "resume", "heartbeat", "stop"]),
  subject: z.string().trim().max(60).optional(),
});

/**
 * De studietimer van Burgieclan (`docs/burgieclan-planning.md`, "Studietimer").
 *
 * Dezelfde richting als de peilingen: de backend van Burgieclan vraagt namens een
 * lid, ondertekend met het gedeelde geheim. De timer daar is dezelfde sessie als
 * Samen blokken in de app, met dezelfde regels (`lib/app-api/study.ts`): het
 * levensteken, de pauzemarge, het maximum.
 *
 * - `GET`: de stand, als `BurgieclanStudy`.
 * - `POST { action, subject? }`: `start`, `pause`, `resume`, `heartbeat` of
 *   `stop`; geeft de nieuwe stand terug. Burgieclan stuurt elke minuut een
 *   `heartbeat` zolang de pagina openstaat.
 */
export async function GET(request: Request) {
  const member = await memberFor(request, "");
  if (member instanceof Response) return member;
  return json(await burgieclanStudy(request, member));
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ error: "BODY_TOO_LARGE" }, 413);

  const member = await memberFor(request, raw);
  if (member instanceof Response) return member;

  let input: z.infer<typeof actionSchema>;
  try {
    input = actionSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return json({ error: "INVALID_REQUEST" }, 400);
    throw error;
  }

  if (input.action === "start") {
    const { started } = await startStudySession(member, { subject: input.subject });
    // Zoals in de app: "de eerste is begonnen" gaat naar de groep, maar mag de sessie nooit tegenhouden.
    if (started) {
      try {
        await sendStudyGroupStartPush(member);
      } catch (error) {
        console.error("Studiegroep-startbericht mislukt", error);
      }
    }
  } else if (input.action === "stop") {
    await stopStudySession(member);
  } else {
    await updateStudySession(member, { action: input.action, subject: input.subject });
  }

  return json(await burgieclanStudy(request, member));
}

/**
 * Het lid waarvoor Burgieclan spreekt, of het antwoord dat de aanvraag weigert.
 * Hetzelfde als bij de peilingen (`../polls/route.ts`): op de `sub` van de SSO,
 * anders op het universitaire adres; een verwijderd account telt niet.
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
    console.warn("[burgieclan] handtekening op /api/burgieclan/v1/studeren klopt niet");
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
