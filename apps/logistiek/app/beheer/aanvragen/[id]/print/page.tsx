import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { PrintSheet, printSheetSelect } from '../../print-sheet';
import { PrintButton } from '../../print-button';

export default async function AanvraagPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireManage();

  const { id } = await params;
  const reservation = await prisma.uitleenReservation.findUnique({
    where: { id },
    select: printSheetSelect,
  });
  if (!reservation) notFound();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/beheer/aanvragen/${id}`} className="text-sm text-vtk-muted hover:underline">
          ← Terug naar de aanvraag
        </Link>
        <PrintButton />
      </div>
      <PrintSheet reservation={reservation} />
    </div>
  );
}
