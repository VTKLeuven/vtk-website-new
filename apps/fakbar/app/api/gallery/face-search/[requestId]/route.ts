import { NextResponse } from 'next/server';
import { faceSearchStatus } from '@vtk/gallery';
import { fakbarFaceSearch } from '@/lib/face-search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** De stand van een lopende zoekopdracht; de pagina bevraagt dit tot ze klaar is. */
export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await context.params;
    return NextResponse.json(fakbarFaceSearch.get(requestId));
  } catch (error) {
    const status = faceSearchStatus(error);
    return NextResponse.json({ error: status.message, code: status.code }, { status: status.status });
  }
}
