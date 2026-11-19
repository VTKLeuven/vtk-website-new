import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { newStorageKey, putObject } from '@vtk/storage';
import { hasPermission } from '@vtk/auth';
import { requireSession } from '@/lib/session';
import { publicUrl } from '@/lib/storage';

export const runtime = 'nodejs';

/** Foto- en pdf-upload voor catalogusitems. Enkel voor het Logistiek-team. */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !hasPermission(session, 'logistiek.manage')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  const isImage = file.type.startsWith('image/');
  if (!isImage && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'unsupported_file' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let body: Buffer = bytes;
  // Nooit `file.type` bewaren: dat kiest de browser. Een afbeelding wordt altijd
  // een JPEG, en lukt dat niet, dan weigeren we ze. Vroeger bleef dan het
  // opgegeven type staan, bv. `image/svg+xml`, en dat opent met script.
  let contentType = 'application/pdf';
  if (isImage) {
    contentType = 'image/jpeg';
    try {
      body = await sharp(bytes)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer();
    } catch {
      return NextResponse.json({ error: 'invalid_image' }, { status: 415 });
    }
  } else if (bytes.subarray(0, 1024).indexOf(Buffer.from('%PDF-')) === -1) {
    return NextResponse.json({ error: 'invalid_pdf' }, { status: 415 });
  }

  const key = newStorageKey('uitleen', isImage ? 'foto.jpg' : file.name);
  await putObject(key, body, contentType);

  return NextResponse.json({ key, url: publicUrl(key) });
}
