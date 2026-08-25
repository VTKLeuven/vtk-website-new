import type { Metadata } from 'next';
import { prisma } from '@vtk/db';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Avondtelling' };

export default async function AvondtellingPage() {
  const weeks = await prisma.fakbarWeek.findMany({
    where: { status: 'OPEN' },
    orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    take: 4,
    include: {
      evenings: {
        orderBy: { date: 'asc' },
        include: { hoofdtapper: { select: { name: true } } },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div className="fakbar-section-head">
        <h2>Avondtelling</h2>
        <p>Selecteer een avond om de kassa- en verbruiksgegevens in te vullen.</p>
      </div>

      {weeks.length === 0 ? (
        <p className="text-[--muted] text-sm">Geen open weken gevonden.</p>
      ) : (
        weeks.map((week) => (
          <div key={week.id}>
            <p className="mb-3 text-sm font-semibold text-[--muted] uppercase tracking-wider">
              Week {week.weekNumber} — {week.year}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {week.evenings.map((evening) => (
                <Link
                  key={evening.id}
                  href={`/admin/avondtelling/${evening.id}`}
                  className="fakbar-row flex-col items-start gap-2 no-underline transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-semibold text-[--ink]">{evening.dayOfWeek}</span>
                    <span className="rounded-md bg-[--paper-2] px-2 py-0.5 text-xs font-medium text-[--muted]">
                      {new Date(evening.date).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                  <div className="w-full text-sm text-[--muted]">
                    Hoofdtapper: <span className="font-medium text-[--ink]">{evening.hoofdtapper?.name ?? '—'}</span>
                  </div>
                  {evening.specialeActiviteit && (
                    <span className="rounded bg-[--paper-2] px-2 py-0.5 text-xs text-[--muted]">
                      ★ {evening.specialeActiviteit}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
