import { NextResponse } from "next/server";
import {
  getImmichFaceSearchPublicConfig,
  immichFaceSearchStatus,
  startImmichFaceSearch,
} from "@/lib/immich-face-search";
import {
  readLimitedFormData,
  RequestBodyTooLargeError,
  trustedClientIp,
} from "@/lib/ticketing/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === "string") return null;
  return value;
}

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const attemptsByClient = new Map<string, number[]>();

function consumeRateLimit(client: string, now = Date.now()): boolean {
  const recent = (attemptsByClient.get(client) ?? []).filter(
    (attempt) => now - attempt < RATE_WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    attemptsByClient.set(client, recent);
    return false;
  }
  recent.push(now);
  attemptsByClient.set(client, recent);
  if (attemptsByClient.size > 10_000) {
    for (const [key, values] of attemptsByClient) {
      if (!values.some((attempt) => now - attempt < RATE_WINDOW_MS)) attemptsByClient.delete(key);
    }
  }
  return true;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    if (!consumeRateLimit(trustedClientIp(request))) {
      return NextResponse.json(
        { error: "Too many face search requests.", code: "face_search_rate_limited" },
        { status: 429 },
      );
    }
    const contentType = request.headers.get("content-type") || "";
    if (
      !contentType.includes("multipart/form-data") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      return NextResponse.json(
        {
          error: "Expected a profile photo upload.",
          code: "face_search_file_missing",
        },
        { status: 400 },
      );
    }

    const { maxUploadBytes } = getImmichFaceSearchPublicConfig();
    const form = await readLimitedFormData(request, maxUploadBytes + 64 * 1024);
    const job = await startImmichFaceSearch({
      slug,
      file: asFile(form.get("selfie")),
      consent: form.get("consent"),
    });

    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "The uploaded profile photo is too large.", code: "face_search_file_too_large" },
        { status: 413 },
      );
    }
    const status = immichFaceSearchStatus(error);
    return NextResponse.json(
      {
        error: status.message,
        code: status.code,
      },
      { status: status.status },
    );
  }
}
