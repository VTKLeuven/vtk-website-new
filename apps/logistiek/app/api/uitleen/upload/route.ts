import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { newStorageKey, putObject } from '@vtk/storage';
import { hasPermission } from '@vtk/auth';
import { requireSession } from '@/lib/session';
import { publicUrl } from '@/lib/storage';

export const runtime = 'nodejs';

/** Foto-upload voor catalogusitems. Enkel voor het Logistiek-team; enkel beelden. */
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
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'not_an_image' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let body: Buffer = bytes;
  let contentType = 'image/jpeg';
  try {
    body = await sharp(bytes)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  } catch {
    // Kan sharp het beeld niet verwerken, dan bewaren we de originele bytes.
    body = bytes;
    contentType = file.type || 'application/octet-stream';
  }

  const key = newStorageKey('uitleen', 'foto.jpg');
  await putObject(key, body, contentType);

  return NextResponse.json({ key, url: publicUrl(key) });
}
