import { NextResponse } from 'next/server';
import { newStorageKey, putObject } from '@vtk/storage';
import { canManage, getSession } from '@/lib/session';
import { publicUrl } from '@/lib/storage';
import { prepareUpload, requestTooLarge, type UploadError } from '@/lib/upload';

export const runtime = 'nodejs';

function refuse(error: UploadError | 'unauthenticated' | 'forbidden', status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Foto- en pdf-upload voor catalogusitems. Enkel voor het Logistiek-team.
 *
 * Wat er in de bucket komt, beslist `prepareUpload` op de bytes zelf, niet op
 * wat de browser opgaf (zie `lib/upload.ts`). Een geweigerde upload geeft een
 * code die `catalogue-editors.tsx` op een zin mapt.
 */
export async function POST(request: Request) {
  // 401 en geen 500: een verlopen sessie is geen serverfout.
  const session = await getSession();
  if (!session) return refuse('unauthenticated', 401);
  if (!canManage(session)) return refuse('forbidden', 403);

  // Voor `formData()`, want dat leest het hele verzoek in het geheugen.
  if (requestTooLarge(request.headers.get('content-length'))) return refuse('too_large', 413);

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return refuse('no_file', 400);

  const prepared = await prepareUpload(Buffer.from(await file.arrayBuffer()), file.name);
  if (!prepared.ok) return refuse(prepared.error, prepared.error === 'too_large' ? 413 : 400);

  const key = newStorageKey('uitleen', prepared.name);
  await putObject(key, prepared.body, prepared.contentType);

  return NextResponse.json({ key, url: publicUrl(key) });
}
