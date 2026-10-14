import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { bearerFrom, checkDeviceToken } from "@/lib/urenloopApp/devices";
import {
  shouldAcceptUrenloopStats,
  urenloopStatsPayloadSchema,
} from "@/lib/urenloop/stats";
import {
  readUrenloopData,
  saveUrenloopStats,
  URENLOOP_TAG,
} from "@/lib/urenloop/server";

const MAX_BODY_BYTES = 32 * 1024;

/**
 * Ontvangt de live tussenstand van de 24 urenloop vanuit de gekoppelde
 * timinglaptop op de piste.
 *
 * Hetzelfde apparaat-token als de auto-updater (`Authorization: Bearer ...`),
 * maar met een extra vlag op het e-mailadres (`UrenloopDownloadEmail.canPublishStats`).
 * Andere kringen mogen de app downloaden en updaten; enkel een adres waarvoor IT
 * die vlag aanzette mag de cijfers op vtk.be bijwerken.
 */
export async function POST(request: Request) {
  const token = bearerFrom(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const check = await checkDeviceToken(token, request.headers.get("x-app-version"));
  if (!check.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!check.canPublishStats) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = urenloopStatsPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const now = new Date();
  const { config, stats: existing } = await readUrenloopData();
  const decision = shouldAcceptUrenloopStats({
    incoming: parsed.data,
    incomingDeviceId: check.deviceId,
    existing,
    config,
    now,
  });

  if (!decision.accept) {
    return NextResponse.json(
      { ok: true, accepted: false, reason: decision.reason },
      { status: 202 },
    );
  }

  await saveUrenloopStats({
    payload: parsed.data,
    receivedAt: now.toISOString(),
    deviceId: check.deviceId,
    deviceLabel: check.label,
    deviceEmail: check.email,
  });

  revalidateTag(URENLOOP_TAG, "max");
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, accepted: true });
}
