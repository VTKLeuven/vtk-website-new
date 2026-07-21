import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@vtk/ui';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { listConnectedApps } from '@vtk/auth/server';
import { describeScope, isSensitiveScope } from '@vtk/auth';
import { DeleteButton } from '@/components/ui/DeleteIconButton';
import { disconnectAppAction } from './actions';

/** Toont het domein in plaats van de volledige URL; dat leest rustiger. */
function hostOf(uri: string): string | null {
  try {
    return new URL(uri).hostname;
  } catch {
    return null;
  }
}

export default async function ConnectedAppsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  await requireSession(`/inloggen?next=${base}/account/verbonden-apps`);

  const apps = await listConnectedApps(await headers());
  const dateFmt = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', { dateStyle: 'long' });

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">
          <Link href={`${base}/account`} className="underline">
            {nl ? 'Mijn account' : 'My account'}
          </Link>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">
          {nl ? 'Verbonden apps' : 'Connected apps'}
        </h1>
        <p className="mt-2 text-sm text-[#5c667f]">
          {nl
            ? 'Applicaties waaraan je toegang gaf tot je VTK-account. Je kan een verbinding op elk moment verbreken.'
            : 'Applications you granted access to your VTK account. You can disconnect any of them at any time.'}
        </p>
      </div>

      {apps.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-[#5c667f]">
            {nl
              ? 'Je hebt nog geen enkele applicatie toegang gegeven tot je account.'
              : 'You have not granted any application access to your account yet.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => {
            const host = app.clientUri ? hostOf(app.clientUri) : null;
            return (
              <Card key={app.clientId} className="overflow-hidden">
                <div className="flex items-start gap-4 p-6">
                  {app.logoUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={app.logoUri}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-xl border border-vtk-blue/10 object-cover"
                    />
                  ) : (
                    // Zonder logo een rustige initiaal, zodat de rij niet inzakt.
                    <div
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/60 text-lg font-semibold text-vtk-ink"
                    >
                      {app.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-vtk-ink">{app.name}</h2>
                    <p className="mt-0.5 text-xs text-[#5c667f]">
                      {host && app.clientUri && (
                        <>
                          <a href={app.clientUri} target="_blank" rel="noreferrer noopener" className="underline">
                            {host}
                          </a>
                          {' · '}
                        </>
                      )}
                      {nl ? 'Toegang sinds ' : 'Access since '}
                      {dateFmt.format(app.grantedAt)}
                    </p>
                  </div>
                </div>

                <div className="border-t border-vtk-blue/10 px-6 py-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                    {nl ? 'Deze app mag zien' : 'This app may see'}
                  </h3>
                  <ul className="mt-2 grid gap-1 text-sm text-[#34405e] sm:grid-cols-2">
                    {app.scopes
                      // `openid` zegt enkel "dit is een login" en release niets.
                      .filter((scope) => scope !== 'openid')
                      .map((scope) => (
                        <li key={scope} className="flex items-start gap-2">
                          <span aria-hidden className={isSensitiveScope(scope) ? 'text-amber-700' : ''}>
                            {isSensitiveScope(scope) ? '⚠' : '✓'}
                          </span>
                          <span className={isSensitiveScope(scope) ? 'text-amber-800' : ''}>
                            {describeScope(scope, nl ? 'nl' : 'en')}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>

                <div className="flex justify-end border-t border-vtk-blue/10 bg-vtk-blue-soft/25 px-6 py-3">
                  <DeleteButton
                    action={disconnectAppAction}
                    fields={{ clientId: app.clientId }}
                    title={nl ? 'Verbinding verbreken' : 'Disconnect'}
                    description={
                      nl
                        ? `${app.name} krijgt geen nieuwe toegang meer tot je gegevens en je toestemming wordt gewist. De app kan nog even doorwerken met toegang die ze al had, tot die vanzelf vervalt. Je VTK-account zelf verandert niet en je kan later opnieuw verbinden.`
                        : `${app.name} gets no new access to your data and your consent is deleted. The app may keep working briefly with access it already had, until that expires on its own. Your VTK account itself is unchanged and you can reconnect later.`
                    }
                    confirmLabel={nl ? 'Verbreken' : 'Disconnect'}
                    cancelLabel={nl ? 'Annuleren' : 'Cancel'}
                    successMessage={nl ? 'Verbinding verbroken' : 'Disconnected'}
                  >
                    {nl ? 'Verbinding verbreken' : 'Disconnect'}
                  </DeleteButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
