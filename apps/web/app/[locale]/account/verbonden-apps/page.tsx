import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { requireSession } from '@/lib/session';
import { listConnectedApps } from '@vtk/auth/server';
import { describeScope, isSensitiveScope } from '@vtk/auth';
import { DeleteButton } from '@/components/ui/DeleteIconButton';
import { disconnectAppAction } from './actions';

export default async function ConnectedAppsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === 'nl';
  await requireSession(`/inloggen?next=${nl ? '' : '/en'}/account/verbonden-apps`);

  const apps = await listConnectedApps(await headers());
  const dateFmt = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', { dateStyle: 'long' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? 'Verbonden apps' : 'Connected apps'}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? 'Applicaties waaraan je toegang gaf tot je VTK-account.'
            : 'Applications you granted access to your VTK account.'}
        </p>
      </div>

      {apps.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {nl
            ? 'Je hebt nog geen enkele applicatie toegang gegeven.'
            : 'You have not granted access to any application yet.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {apps.map((app) => (
            <li key={app.clientId} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium">{app.name}</h2>
                  {app.clientUri && (
                    <a
                      href={app.clientUri}
                      className="text-xs text-zinc-500 underline"
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {app.clientUri}
                    </a>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">
                    {nl ? 'Toegang gegeven op ' : 'Access granted on '}
                    {dateFmt.format(app.grantedAt)}
                  </p>
                </div>

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

              <div className="mt-3">
                <div className="text-xs font-medium text-zinc-500">
                  {nl ? 'Deze app mag zien:' : 'This app may see:'}
                </div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {app.scopes.map((scope) => (
                    <li key={scope} className={isSensitiveScope(scope) ? 'text-amber-800' : ''}>
                      {describeScope(scope, nl ? 'nl' : 'en')}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
