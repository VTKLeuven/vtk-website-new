import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { getLocale } from '@/lib/i18n';
import { emptyEventValues } from '@/app/materiaal/event-values';
import { getFlesserkeCatalog } from '@/lib/uitleen-server';
import { FlesserkeForm } from './request-form';

export default async function FlesserkePage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) {
    return <LoginGate variant="flesserke" />;
  }
  const en = locale === 'en';

  // Flesserke is enkel voor het praesidium (leden met een post).
  if (session.groups.length === 0) {
    return (
      <PageShell title="Flesserke">
        <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-7 text-vtk-body">
          {en
            ? 'Flesserke is only available to praesidium members.'
            : 'Flesserke is enkel beschikbaar voor het praesidium.'}
        </p>
      </PageShell>
    );
  }

  const catalog = await getFlesserkeCatalog();
  const groups = session.groups.map((g) => ({ id: g.id, name: en ? g.nameEn : g.nameNl }));

  return (
    <PageShell
      title={
        <>
          {en ? 'Flesserke' : 'Flesserke'}{' '}
          <em className="font-serif font-normal italic text-vtk-navy">{en ? 'internal' : 'intern'}</em>
        </>
      }
      intro={
        en
          ? 'Consumables (food, drinks, cleaning) prepared per event for internal use. Closed items come back; opened ones are consumed.'
          : 'Verbruiksgoederen (voeding, drank, kuis) die per event worden klaargezet voor interne werking. Gesloten komt terug; geopend is verbruik.'
      }
    >
      {catalog.length === 0 ? (
        <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-7 text-vtk-body">
          {en ? 'The flesserke list is empty for now.' : 'De flesserke-lijst is voorlopig leeg.'}
        </p>
      ) : (
        <FlesserkeForm
          catalog={catalog}
          groups={groups}
          locale={locale}
          mode={{ kind: 'create' }}
          initial={{
            event: emptyEventValues(groups),
            pickupDate: '',
            returnDate: '',
            note: '',
            quantities: {},
          }}
        />
      )}
    </PageShell>
  );
}
