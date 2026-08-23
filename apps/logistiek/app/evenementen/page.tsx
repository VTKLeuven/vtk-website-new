import Link from 'next/link';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { formatEventMoment } from '@/lib/uitleen';
import { memberEvents, type AdminEvent } from '@/lib/uitleen-server';
import { getLocale } from '@/lib/i18n';

/**
 * De evenementen van je post of werkgroep (N5).
 *
 * /beheer/evenementen bestond al voor Logistiek, maar een postverantwoordelijke
 * had geen enkel scherm waar alles van één evenement samen stond: hij zag drie
 * losse aanvragen onder "Mijn reservaties" en moest zelf onthouden dat ze bij
 * elkaar hoorden.
 */
function countByKind(event: AdminEvent) {
  const material = event.reservations.filter((r) => r.lines.length > 0).length;
  const drinks = event.reservations.filter((r) => r.flesserkeLines.length > 0).length;
  const transport = event.transport.length;
  return { material, drinks, transport };
}

export default async function EvenementenPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return <LoginGate variant="reservations" />;
  const en = locale === 'en';

  const events = await memberEvents(
    session.user.id,
    session.groups.map((group) => group.id)
  );

  return (
    <PageShell
      title={
        <>
          {en ? 'My ' : 'Mijn '}
          <em>{en ? 'events' : 'evenementen'}</em>
        </>
      }
      intro={
        en
          ? 'Everything your group requested for one event, on one screen.'
          : 'Alles wat je post of werkgroep voor één evenement aanvroeg, op één scherm.'
      }
    >
      {events.length === 0 ? (
        <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 text-sm text-vtk-muted">
          {en ? (
            <>
              No events yet. You create one while requesting equipment or transport, under &quot;Part
              of an event?&quot;.
            </>
          ) : (
            <>
              Nog geen evenementen. Je maakt er een aan bij het aanvragen van materiaal of transport,
              onder &quot;Hoort dit bij een evenement?&quot;.
            </>
          )}
        </p>
      ) : (
        <ul className="grid gap-4">
          {events.map((event) => {
            const counts = countByKind(event);
            const moment = formatEventMoment(event, locale);
            return (
              <li key={event.id}>
                <Link
                  href={`/evenementen/${event.id}`}
                  className="block rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 transition hover:border-vtk-navy/30"
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold tracking-tight text-vtk-ink">
                      {event.name}
                    </span>
                    {event.group ? (
                      <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
                        {event.group.nameNl}
                      </span>
                    ) : null}
                  </p>
                  <dl className="logistics-fact-grid mt-3">
                    <div>
                      <dt>{en ? 'When' : 'Wanneer'}</dt>
                      <dd>{moment ?? (en ? 'Not filled in yet' : 'Nog niet ingevuld')}</dd>
                    </div>
                    <div>
                      <dt>{en ? 'Where' : 'Locatie'}</dt>
                      <dd>{event.location || (en ? 'Not filled in yet' : 'Nog niet ingevuld')}</dd>
                    </div>
                    <div>
                      <dt>{en ? 'Requested' : 'Aangevraagd'}</dt>
                      <dd>
                        {counts.material + counts.drinks + counts.transport === 0
                          ? en
                            ? 'Nothing yet'
                            : 'Nog niets'
                          : [
                              counts.material > 0 ? `${counts.material}× materiaal` : null,
                              counts.drinks > 0 ? `${counts.drinks}× flesserke` : null,
                              counts.transport > 0 ? `${counts.transport}× transport` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
