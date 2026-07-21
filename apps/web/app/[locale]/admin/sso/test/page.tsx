import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { SCOPES } from '@vtk/auth';
import { startFlowTestAction } from './actions';

/**
 * Doorloopt een echte autorisatieflow met een vaste, publieke testclient. Zo
 * zie je wat een integratie werkelijk terugkrijgt, in plaats van te moeten
 * afgaan op wat het toestemmingsscherm belooft.
 */
export default async function FlowTestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission('oauth.client.edit');
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${base}/admin/sso`} className="text-sm text-zinc-500 underline">
          {nl ? '← Alle applicaties' : '← All applications'}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{nl ? 'Flow testen' : 'Test a flow'}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? 'Doorloopt een echte aanmelding met een aparte testclient, inclusief het toestemmingsscherm, en toont daarna precies welke claims er terugkomen.'
            : 'Runs a real sign-in with a separate test client, including the consent screen, then shows exactly which claims come back.'}
        </p>
      </div>

      <form action={startFlowTestAction} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <fieldset>
          <legend className="text-sm font-medium">{nl ? 'Scopes aanvragen' : 'Request scopes'}</legend>
          <div className="mt-2 space-y-1">
            {SCOPES.map((scope) => (
              <label key={scope.code} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope.code}
                  defaultChecked={scope.code === 'openid' || scope.defaultSelected}
                  className="mt-1"
                />
                <span>
                  <span className={scope.sensitive ? 'text-amber-800' : ''}>
                    {nl ? scope.consentNl : scope.consentEn}
                  </span>
                  <code className="ml-2 text-xs text-zinc-400">{scope.code}</code>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="prompt" className="block text-sm font-medium">
            prompt
          </label>
          <select id="prompt" name="prompt" className="rounded border p-2 text-sm">
            <option value="">{nl ? '(geen)' : '(none)'}</option>
            <option value="consent">
              consent {nl ? '— toon het toestemmingsscherm altijd' : '— always show consent'}
            </option>
            <option value="login">login {nl ? '— vraag opnieuw aanmelden' : '— force re-authentication'}</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            {nl
              ? 'Kies "consent" om het toestemmingsscherm te zien wanneer je al eerder toestemming gaf.'
              : 'Pick "consent" to see the consent screen even when you already granted access before.'}
          </p>
        </div>

        <p className="text-xs text-zinc-500">
          {nl
            ? 'De test gebruikt een aparte publieke client (vtk-flow-tester) met PKCE. Je geeft toestemming als jezelf, dus je ziet exact wat een lid zou zien.'
            : 'The test uses a separate public client (vtk-flow-tester) with PKCE. You consent as yourself, so you see exactly what a member would see.'}
        </p>

        <button
          type="submit"
          className="inline-flex h-8 items-center justify-center rounded-full border border-vtk-ink bg-vtk-ink px-3 text-sm font-medium text-vtk-surface shadow-sm transition-colors hover:bg-vtk-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vtk-ink"
        >
          {nl ? 'Flow starten' : 'Start flow'}
        </button>
      </form>
    </div>
  );
}
