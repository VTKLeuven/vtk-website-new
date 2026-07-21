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

        <fieldset>
          <legend className="text-sm font-medium">{nl ? 'Toegang' : 'Access'}</legend>
          <p className="mt-1 text-xs text-zinc-500">
            {nl
              ? 'De testclient wordt hierop ingesteld voor je vertrekt. Zo test je de toegangspoort met dezelfde flow als een echt lid.'
              : 'The test client is set to this before you leave. That way you test the access gate with the same flow a real member takes.'}
          </p>
          <div className="mt-2 space-y-1">
            {[
              {
                value: 'open',
                label: nl ? 'Open, elk lid mag binnen' : 'Open, any member may enter',
                hint: nl ? 'De gewone flow.' : 'The ordinary flow.',
              },
              {
                value: 'restricted-denied',
                label: nl ? 'Beperkt, zonder toegang voor mij' : 'Restricted, without access for me',
                hint: nl
                  ? 'Je hoort op de blokpagina te landen in plaats van bij het toestemmingsscherm.'
                  : 'You should land on the block page instead of the consent screen.',
              },
              {
                value: 'restricted-granted',
                label: nl ? 'Beperkt, met toegang voor mij' : 'Restricted, with access for me',
                hint: nl
                  ? 'Je krijgt flowtest.access toegekend en de flow hoort gewoon door te gaan.'
                  : 'You are granted flowtest.access and the flow should continue as normal.',
              },
            ].map((option) => (
              <label key={option.value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="access"
                  value={option.value}
                  defaultChecked={option.value === 'open'}
                  className="mt-1"
                />
                <span>
                  {option.label}
                  <span className="block text-xs text-zinc-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="skipConsent" className="mt-1" />
          <span>
            {nl ? 'Toestemmingsscherm overslaan' : 'Skip the consent screen'}
            <span className="block text-xs text-zinc-500">
              {nl
                ? 'De sluiproute waar een toegangscontrole op het toestemmingsscherm zou openvallen. Gecombineerd met "beperkt zonder toegang" hoort de blokkade nog altijd te werken.'
                : 'The shortcut where an access check on the consent screen would fail open. Combined with "restricted without access", the block should still hold.'}
            </span>
          </span>
        </label>

        <div>
          <label htmlFor="prompt" className="block text-sm font-medium">
            prompt
          </label>
          <select id="prompt" name="prompt" className="rounded border p-2 text-sm">
            <option value="">{nl ? '(geen)' : '(none)'}</option>
            <option value="consent">
              consent {nl ? ', toon het toestemmingsscherm altijd' : ', always show consent'}
            </option>
            <option value="login">login {nl ? ', vraag opnieuw aanmelden' : ', force re-authentication'}</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            {nl
              ? 'Kies "consent" om het toestemmingsscherm te zien wanneer je al eerder toestemming gaf.'
              : 'Pick "consent" to see the consent screen even when you already granted access before.'}
          </p>
        </div>

        <p className="text-xs text-zinc-500">
          {nl
            ? 'De test gebruikt een aparte publieke client (vtk-flow-tester) met PKCE. Je geeft toestemming als jezelf, dus je ziet exact wat een lid zou zien. Na afloop worden de toestemming, de tokens en de testpermissie weer opgeruimd, zodat elke run gelijk begint.'
            : 'The test uses a separate public client (vtk-flow-tester) with PKCE. You consent as yourself, so you see exactly what a member would see. Afterwards the consent, the tokens and the test permission are cleaned up again, so every run starts the same.'}
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
