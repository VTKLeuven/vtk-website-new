import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/session";
import { canAccessAnyTicketEvent } from "@/lib/ticketing/authorization";
import { canAccessAnyForm } from "@/lib/forms/authorization";
import { getAiConfig } from "@/lib/ai/config";
import { AiTranslateError, AiTranslator } from "@/lib/ai/translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FIELDS = 30;
const MAX_FIELD_CHARS = 30_000;
const MAX_TOTAL_CHARS = 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const requestTimestamps = new Map<string, number[]>();

function isRateLimited(userId: string, now = Date.now()): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (requestTimestamps.get(userId) ?? []).filter((ts) => ts > cutoff);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestTimestamps.set(userId, recent);
    return true;
  }
  recent.push(now);
  requestTimestamps.set(userId, recent);
  return false;
}

const bodySchema = z.object({
  direction: z.enum(["nl-to-en", "en-to-nl"]),
  fields: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        text: z.string().max(MAX_FIELD_CHARS),
        markdown: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(MAX_FIELDS),
});

/**
 * Server-side vertaalendpoint voor adminformulieren (`POST /api/admin/translate`).
 *
 * Enkel voor ingelogde beheerders/redacteuren (zelfde toegangsgrens als /admin).
 * De AI-API-sleutel blijft altijd op de server; de browser praat nooit direct
 * met vLLM of Open WebUI.
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    return authErrorResponse(error);
  }

  const allowed =
    session.user.isSuperAdmin ||
    session.permissions.length > 0 ||
    session.groups.length > 0 ||
    (await canAccessAnyTicketEvent()) ||
    (await canAccessAnyForm());

  if (!allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (isRateLimited(session.user.id)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const totalChars = parsed.data.fields.reduce((sum, f) => sum + f.text.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
  }

  const config = await getAiConfig();
  if (!config.apiUrl) {
    return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const translator = new AiTranslator(config);
    const result = await translator.translate(parsed.data.direction, parsed.data.fields);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiTranslateError) {
      const status =
        error.code === "NOT_CONFIGURED"
          ? 503
          : error.code === "TIMEOUT"
            ? 504
            : 502;
      return NextResponse.json({ error: error.code }, { status });
    }
    return NextResponse.json({ error: "UPSTREAM_ERROR" }, { status: 502 });
  }
}
