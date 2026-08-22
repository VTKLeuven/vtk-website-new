'use client';

import { useRouter } from 'next/navigation';
import { createReservationAction } from '@/app/actions/uitleen';
import type { CatalogCategory, RequestTemplate } from '@/lib/uitleen-server';
import type { SelectableEvent } from '@/components/event-picker';
import { emptyEventValues, type RequesterOption } from './event-fields';
import { ReservationForm } from './reservation-form';

export function MaterialRequestForm({
  catalog,
  groups,
  locale,
  showRentPrices = false,
  paymentNote,
  lastMinuteDays,
  userId,
  templates,
  events,
}: {
  catalog: CatalogCategory[];
  groups: RequesterOption[];
  locale: 'nl' | 'en';
  showRentPrices?: boolean;
  /** Beheerbare waarborg-/betaalnota uit /beheer/teksten (getPublicCopy). */
  paymentNote?: string;
  lastMinuteDays: number;
  /** Voor het lokale concept: per lid, want de logikot-pc is gedeeld. */
  userId: string;
  templates: RequestTemplate[];
  /** Weggelaten voor een externe aanvrager; zie `requestsAsExternal` (E3). */
  events?: SelectableEvent[];
}) {
  const en = locale === 'en';
  const router = useRouter();

  return (
    <ReservationForm
      catalog={catalog}
      groups={groups}
      locale={locale}
      showRentPrices={showRentPrices}
      paymentNote={paymentNote}
      lastMinuteDays={lastMinuteDays}
      draftKey={`materiaal:${userId}`}
      templates={templates}
      events={events}
      initial={{
        event: emptyEventValues(groups),
        pickupDate: '',
        returnDate: '',
        note: '',
        quantities: {},
      }}
      submitLabel={en ? 'Submit request' : 'Aanvraag indienen'}
      submittingLabel={en ? 'Submitting...' : 'Indienen...'}
      onSubmit={async (payload) => {
        const result = await createReservationAction(payload);
        if (result.ok) router.push('/reservaties?aangevraagd=1');
        return result;
      }}
    />
  );
}
