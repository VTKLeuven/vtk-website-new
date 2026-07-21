import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { accessRoleGrantCountsByClient, listSsoClients } from '@vtk/auth/server';
import type { Locale } from '@vtk/i18n';
import { attentionForAll } from './attention';

export default async function AdminSsoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission('oauth.client.edit');

  const requestHeaders = await headers();
  const [clients, accessRoleGrantCounts] = await Promise.all([
    listSsoClients(requestHeaders),
    accessRoleGrantCountsByClient(requestHeaders),
  ]);
  const attention = attentionForAll(clients, accessRoleGrantCounts);
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  const dateFmt = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? 'SSO & apps' : 'SSO & apps'}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? 'Applicaties die leden met hun VTK-account laten aanmelden.'
            : 'Applications that let members sign in with their VTK account.'}
        </p>
      </div>

      {attention.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="sso-attention">
          <h2 id="sso-attention" className="text-sm font-semibold text-amber-900">
            {nl ? 'Aandacht vereist' : 'Needs attention'}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {attention.map((item) => (
              <li key={`${item.clientId}-${item.code}`}>
                <Link href={`${base}/admin/sso/${item.clientId}`} className="font-medium underline">
                  {item.clientName}
                </Link>{' '}
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <Link
          href={`${base}/admin/sso/nieuw`}
          // Een Link kan de Button-component niet gebruiken (die rendert een
          // <button>), dus hier dezelfde primary-stijl met de vtk-tokens.
          className="inline-flex h-8 items-center justify-center rounded-full border border-vtk-ink bg-vtk-ink px-3 text-sm font-medium text-vtk-surface shadow-sm transition-colors hover:bg-vtk-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vtk-ink"
        >
          {nl ? 'Nieuwe applicatie' : 'New application'}
        </Link>
        <Link href={`${base}/admin/sso/test`} className="ml-3 text-sm underline">
          {nl ? 'Flow testen' : 'Test a flow'}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">{nl ? 'Naam' : 'Name'}</th>
              <th className="px-4 py-3 font-medium">Client ID</th>
              <th className="px-4 py-3 font-medium">{nl ? 'Status' : 'Status'}</th>
              <th className="px-4 py-3 font-medium">{nl ? 'Aangemaakt' : 'Created'}</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  {nl ? 'Nog geen applicaties.' : 'No applications yet.'}
                </td>
              </tr>
            )}
            {clients.map((client) => (
              <tr key={client.clientId} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`${base}/admin/sso/${client.clientId}`} className="font-medium underline">
                    {client.name ?? client.clientId}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{client.clientId}</td>
                <td className="px-4 py-3">
                  {client.disabled ? (
                    <span className="text-amber-700">{nl ? 'Uitgeschakeld' : 'Disabled'}</span>
                  ) : (
                    <span className="text-emerald-700">{nl ? 'Actief' : 'Active'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-500">{client.createdAt ? dateFmt.format(client.createdAt) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
