import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@vtk/db';
import { takedownReasonLabel } from '@vtk/gallery';
import { ElixirIcon } from '@/components/elixir-icon';
import { TakedownRow } from './takedown-row';

export const metadata: Metadata = { title: 'Verwijderverzoeken' };

/**
 * Wie gevraagd heeft om een foto uit de galerij te halen.
 *
 * De rij in de databank is de waarheid; de mail naar fakbar@vtk.be is enkel een
 * seintje. Staat er een verzoek zonder dat er een mail uitging (`mailDelivered`
 * onwaar), dan wordt dat hier gemeld: anders wacht iemand op een antwoord dat
 * niemand zag aankomen.
 */
export const dynamic = 'force-dynamic';

function formatMoment(value: Date): string {
  return new Intl.DateTimeFormat('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export default async function TakedownRequestsPage() {
  const requests = await prisma.photoTakedownRequest.findMany({
    where: { gallery: 'FAKBAR' },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { handledBy: { select: { name: true } } },
  });

  const open = requests.filter((request) => request.status === 'NEW');
  const handled = requests.filter((request) => request.status !== 'NEW');

  return (
    <div className="space-y-6">
      <div className="fakbar-section-head">
        <h2>Verwijderverzoeken</h2>
        <p>
          Mensen die vroegen om een foto uit de galerij te halen. Verwijderen zet de foto in de prullenmand van Immich;
          ze verdwijnt meteen van de site.
        </p>
      </div>

      {open.length === 0 ? (
        <div className="fakbar-empty">
          <h3>Geen openstaande verzoeken</h3>
          <p>Er staat niets te behandelen. Nieuwe verzoeken komen hier binnen en gaan ook per mail naar de fakbar.</p>
        </div>
      ) : (
        <section className="space-y-3">
          <h3 className="fakbar-subheading">
            Te behandelen <span className="fakbar-badge" data-tone="warn">{open.length}</span>
          </h3>
          {open.map((request) => (
            <TakedownRow
              key={request.id}
              request={{
                id: request.id,
                albumSlug: request.albumSlug,
                albumTitle: request.albumTitle,
                photoFilename: request.photoFilename,
                reporterName: request.reporterName,
                reporterEmail: request.reporterEmail,
                reasonLabel: takedownReasonLabel(request.reason),
                message: request.message,
                createdAt: formatMoment(request.createdAt),
                mailDelivered: request.mailDelivered,
                status: request.status,
                handlingNote: null,
                handledBy: null,
                handledAt: null,
              }}
            />
          ))}
        </section>
      )}

      {handled.length > 0 ? (
        <section className="space-y-3">
          <h3 className="fakbar-subheading">Afgehandeld</h3>
          {handled.map((request) => (
            <TakedownRow
              key={request.id}
              request={{
                id: request.id,
                albumSlug: request.albumSlug,
                albumTitle: request.albumTitle,
                photoFilename: request.photoFilename,
                reporterName: request.reporterName,
                reporterEmail: request.reporterEmail,
                reasonLabel: takedownReasonLabel(request.reason),
                message: request.message,
                createdAt: formatMoment(request.createdAt),
                mailDelivered: request.mailDelivered,
                status: request.status,
                handlingNote: request.handlingNote,
                handledBy: request.handledBy?.name ?? null,
                handledAt: request.handledAt ? formatMoment(request.handledAt) : null,
              }}
            />
          ))}
        </section>
      ) : null}

      <p className="fakbar-hint">
        <ElixirIcon name="lock" className="mr-2 inline h-4 w-4 align-[-3px]" />
        Verzoeken worden na een jaar geanonimiseerd: de afhandeling blijft, de gegevens van de melder niet. Zie{' '}
        <Link href="/fotos">de galerij</Link> voor wat er nu online staat.
      </p>
    </div>
  );
}
