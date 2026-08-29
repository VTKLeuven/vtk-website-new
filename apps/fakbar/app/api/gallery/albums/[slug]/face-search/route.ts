import { NextResponse } from 'next/server';
import { faceSearchStatus } from '@vtk/gallery';
import { fakbarFaceSearch } from '@/lib/face-search';
import { readLimitedFormData, RequestBodyTooLargeError, trustedClientIp } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Start een gezichtszoekopdracht binnen één fakbaralbum.
 *
 * De snelheidsbegrenzer staat hier en niet in de motor: het is een eigenschap
 * van de publieke route, niet van de zoekopdracht. Vijf pogingen per kwartier
 * per IP; dat is ruim voor iemand die een tweede selfie probeert en te weinig
 * om de albumindex uit te lezen door met foto's te blijven strooien.
 */
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const attemptsByClient = new Map<string, number[]>();

function consumeRateLimit(client: string, now = Date.now()): boolean {
  const recent = (attemptsByClient.get(client) ?? []).filter((attempt) => now - attempt < RATE_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    attemptsByClient.set(client, recent);
    return false;
  }
  recent.push(now);
  attemptsByClient.set(client, recent);
  // De kaart mag niet onbeperkt groeien met IP's die niet meer terugkomen.
  if (attemptsByClient.size > 10_000) {
    for (const [key, values] of attemptsByClient) {
      if (!values.some((attempt) => now - attempt < RATE_WINDOW_MS)) attemptsByClient.delete(key);
    }
  }
  return true;
}

function asFile(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value === 'string') return null;
  return value;
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;

    if (!consumeRateLimit(trustedClientIp(request))) {
      return NextResponse.json(
        { error: 'Er lopen te veel zoekopdrachten vanaf dit adres.', code: 'face_search_rate_limited' },
        { status: 429 },
      );
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data') && !contentType.includes('application/x-www-form-urlencoded')) {
      return NextResponse.json(
        { error: 'Er is geen foto meegestuurd.', code: 'face_search_file_missing' },
        { status: 400 },
      );
    }

    const { maxUploadBytes } = fakbarFaceSearch.publicConfig();
    const form = await readLimitedFormData(request, maxUploadBytes + 64 * 1024);
    const job = await fakbarFaceSearch.start({
      slug,
      file: asFile(form.get('selfie')),
      consent: form.get('consent'),
    });

    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: 'De geüploade foto is te groot.', code: 'face_search_file_too_large' },
        { status: 413 },
      );
    }
    const status = faceSearchStatus(error);
    return NextResponse.json({ error: status.message, code: status.code }, { status: status.status });
  }
}
