import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { getLocale } from '@/lib/i18n';
import { emptyEventValues, requesterOptions } from '@/app/materiaal/event-values';
import {
  getFlesserkeCatalog,
  getLogistiekSettings,
  selectableEvents,
} from '@/lib/uitleen-server';
import { eventOptions } from '@/lib/uitleen';
import { FlesserkeForm } from './request-form';

export default async function FlesserkePage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) {
    return <LoginGate variant="flesserke" />;
  }
  const en = locale === 'en';

  // Flesserke is voor de interne werking: elk lid van een post, een werkgroep of
  // een jaarwerking. De gate is "heeft een groep", niet "heeft een post"; de
  // tekst zei het omgekeerde en werkgroepen concludeerden dat het niets voor hen
  // was terwijl de knop gewoon werkte.
  if (session.groups.length === 0) {
    return (
      <PageShell title="Flesserke">
        <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-7 text-vtk-body">
          {en
            ? 'Flesserke is for VTK\u2019s own activities: posts, work groups and year committees. Your account is not linked to any of those this working year; mail logistiek@vtk.be if that is wrong.'
            : 'Flesserke is voor de eigen werking van VTK: posten, werkgroepen en jaarwerkingen. Aan jouw account hangt dit werkingsjaar geen van die drie; mail logistiek@vtk.be als dat niet klopt.'}
        </p>
      </PageShell>
    );
  }

  const [catalog, settings, events] = await Promise.all([
    getFlesserkeCatalog(),
    getLogistiekSettings(),
    selectableEvents(),
  ]);
  const groups = requesterOptions(session.groups, locale);

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
          ? 'Consumables (food, drinks, cleaning) prepared per event for VTK\u2019s own activities: posts, work groups and year committees alike. Closed items come back; opened ones are consumed.'
          : 'Verbruiksgoederen (voeding, drank, kuis) die per event worden klaargezet voor de eigen werking: posten, werkgroepen en jaarwerkingen evengoed. Gesloten komt terug; geopend is verbruik.'
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
          lastMinuteDays={settings.lastMinuteDays}
          locale={locale}
          mode={{ kind: 'create' }}
          draftKey={`flesserke:${session.user.id}`}
          events={eventOptions(events, locale)}
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
