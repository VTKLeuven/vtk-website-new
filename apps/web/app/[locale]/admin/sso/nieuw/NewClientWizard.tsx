'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { createClientAction, type CreateClientState } from '../actions';
import { checkRedirectUris, describeRedirectUriProblem } from '../redirectUris';
import { SecretOnceModal } from '../SecretOnceModal';

const IDLE: CreateClientState = { status: 'idle' };

export type ScopeChoice = {
  code: string;
  label: string;
  sensitive: boolean;
  defaultSelected: boolean;
};

type Step = 0 | 1 | 2;

/**
 * Aanmaken in drie stappen: wie is de app, hoe praat ze met ons, en wat mag ze
 * zien. Bewust gescheiden omdat de derde stap over gegevens van leden gaat en
 * niet ondergesneeuwd mag raken tussen de invulvelden.
 *
 * Elke stap valideert voor je verder kan, en bij het aanmaken valideren we ze
 * alle drie opnieuw. De velden zijn gecontroleerd (waarde in state); de
 * `name`-attributen zijn er enkel als documentatie van het veld in de action.
 * Zie de opmerking bij de knoppen waarom hier geen `<form>` staat.
 */
export function NewClientWizard({ nl, scopes, listHref }: { nl: boolean; scopes: ScopeChoice[]; listHref: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [state, formAction, actionPending] = useActionState(createClientAction, IDLE);
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  const [name, setName] = useState('');
  const [clientUri, setClientUri] = useState('');
  const [contacts, setContacts] = useState('');
  const [type, setType] = useState<'web' | 'user-agent-based' | 'native'>('web');
  const [redirectUris, setRedirectUris] = useState('');
  // Voorselectie komt uit de registry, niet uit een lijstje hier.
  const [selectedScopes, setSelectedScopes] = useState<string[]>(() =>
    scopes.filter((scope) => scope.defaultSelected).map((scope) => scope.code)
  );
  const [skipConsent, setSkipConsent] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const uriList = redirectUris
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  /** Alle redirect-URI's op een VTK-domein? Bepaalt of skipConsent verdedigbaar is. */
  const vtkOwned =
    uriList.length > 0 &&
    uriList.every((uri) => {
      try {
        const { hostname } = new URL(uri);
        return hostname === 'vtk.be' || hostname.endsWith('.vtk.be');
      } catch {
        return false;
      }
    });

  function validate(current: Step): string | null {
    if (current === 0) {
      if (!name.trim()) return nl ? 'Geef de applicatie een naam.' : 'Give the application a name.';
      return null;
    }
    if (current === 1) {
      if (!uriList.length) {
        return nl ? 'Voeg minstens één redirect-URI toe.' : 'Add at least one redirect URI.';
      }
      const problem = checkRedirectUris(uriList);
      if (problem) return describeRedirectUriProblem(problem, nl);
      return null;
    }
    if (!selectedScopes.length) {
      return nl ? 'Kies minstens één scope.' : 'Select at least one scope.';
    }
    return null;
  }

  function toggleScope(code: string, checked: boolean) {
    setSelectedScopes((prev) => (checked ? [...prev, code] : prev.filter((existing) => existing !== code)));
  }

  function next() {
    const error = validate(step);
    setStepError(error);
    if (!error && step < 2) setStep((step + 1) as Step);
  }

  /**
   * Verstuurt de action met de waarden uit de state, niet uit het DOM. Zo kan er
   * niets meegaan van een stap die de gebruiker nooit gezien heeft, en valideren
   * we alle stappen nog eens voor we vertrekken.
   */
  function submit() {
    for (const current of [0, 1, 2] as Step[]) {
      const error = validate(current);
      if (error) {
        setStep(current);
        setStepError(error);
        return;
      }
    }
    setStepError(null);

    const formData = new FormData();
    formData.set('name', name);
    formData.set('clientUri', clientUri);
    formData.set('contacts', contacts);
    formData.set('type', type);
    formData.set('redirectUris', redirectUris);
    if (skipConsent) formData.set('skipConsent', 'on');
    for (const scope of selectedScopes) formData.append('scopes', scope);

    // Buiten een transition zou React klagen en zou `pending` niet meelopen;
    // dat regelt de `action`-prop normaal, en die gebruiken we hier bewust niet.
    startTransition(() => formAction(formData));
  }

  const offlineScope = scopes.find((scope) => scope.code === 'offline_access');
  const dataScopes = scopes.filter((scope) => scope.code !== 'offline_access');

  const steps = nl ? ['Identiteit', 'Techniek', 'Toegang'] : ['Identity', 'Technical', 'Access'];

  return (
    <>
      <ol className="flex gap-2 text-sm" aria-label={nl ? 'Stappen' : 'Steps'}>
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${
              index === step
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : index < step
                  ? 'border-zinc-300 text-zinc-600'
                  : 'border-zinc-200 text-zinc-400'
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {/*
        Bewust GEEN <form>. De knop rechtsonder wisselt tussen "Volgende" en
        "Aanmaken", en React hergebruikt daarvoor hetzelfde <button>-element: het
        zet enkel `type` om. De browser bepaalt de standaardactie van een klik
        pas nadat de handlers gelopen hebben, ziet dan een submitknop, en
        verstuurde het formulier meteen bij het doorklikken naar stap 3.
        Programmatisch verzenden haalt die hele klasse fouten weg.
      */}
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        {/* Stap 1 */}
        <div className={step === 0 ? 'space-y-3' : 'hidden'}>
          <div>
            <label htmlFor="name" className="block text-sm">
              {nl ? 'Naam' : 'Name'}
            </label>
            <input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border p-2 text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">
              {nl
                ? 'Dit ziet het lid op het toestemmingsscherm, dus gebruik de naam die het herkent.'
                : 'This is what the member sees on the consent screen, so use the name they recognise.'}
            </p>
          </div>

          <div>
            <label htmlFor="clientUri" className="block text-sm">
              {nl ? 'Website (optioneel)' : 'Website (optional)'}
            </label>
            <input
              id="clientUri"
              name="clientUri"
              value={clientUri}
              onChange={(e) => setClientUri(e.target.value)}
              className="w-full rounded border p-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="contacts" className="block text-sm">
              {nl ? 'Contactadressen (één per regel)' : 'Contact addresses (one per line)'}
            </label>
            <textarea
              id="contacts"
              name="contacts"
              rows={2}
              value={contacts}
              onChange={(e) => setContacts(e.target.value)}
              className="w-full rounded border p-2 text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">
              {nl
                ? 'Wie contacteren we als er iets misloopt met deze integratie?'
                : 'Who do we contact when something goes wrong with this integration?'}
            </p>
          </div>
        </div>

        {/* Stap 2 */}
        <div className={step === 1 ? 'space-y-3' : 'hidden'}>
          <div>
            <label htmlFor="type" className="block text-sm">
              {nl ? 'Type' : 'Type'}
            </label>
            <select
              id="type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full rounded border p-2 text-sm"
            >
              <option value="web">{nl ? 'Server-app (met secret)' : 'Server app (with secret)'}</option>
              <option value="user-agent-based">{nl ? 'Browser-app (zonder secret)' : 'Browser app (no secret)'}</option>
              <option value="native">{nl ? 'Native app (zonder secret)' : 'Native app (no secret)'}</option>
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              {nl
                ? 'Een browser- of native app kan geen geheim bewaren; die krijgt er dan ook geen.'
                : 'A browser or native app cannot keep a secret, so it does not get one.'}
            </p>
          </div>

          <div>
            <label htmlFor="redirectUris" className="block text-sm">
              {nl ? 'Redirect-URI’s (één per regel)' : 'Redirect URIs (one per line)'}
            </label>
            <textarea
              id="redirectUris"
              name="redirectUris"
              rows={3}
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
              className="w-full rounded border p-2 font-mono text-xs"
              placeholder="https://app.vtk.be/callback"
            />
            <p className="mt-1 text-xs text-amber-700">
              {nl
                ? 'Alleen exact deze adressen ontvangen autorisatiecodes. Een adres dat je niet zelf beheert, kan de aanmelding van leden onderscheppen.'
                : 'Only these exact addresses receive authorization codes. An address you do not control can intercept member sign-ins.'}
            </p>
          </div>
        </div>

        {/* Stap 3 */}
        <div className={step === 2 ? 'space-y-3' : 'hidden'}>
          <fieldset>
            <legend className="text-sm">{nl ? 'Wat mag deze app zien?' : 'What may this app see?'}</legend>
            <div className="mt-2 space-y-1">
              {dataScopes.map((scope) => (
                <label key={scope.code} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope.code}
                    checked={selectedScopes.includes(scope.code)}
                    onChange={(e) => toggleScope(scope.code, e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className={scope.sensitive ? 'text-amber-800' : ''}>{scope.label}</span>
                    <code className="ml-2 text-xs text-zinc-400">{scope.code}</code>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {nl
                ? 'Vraag alleen wat de app echt nodig heeft: dit is wat het lid te lezen krijgt voor het toestemming geeft.'
                : 'Only request what the app truly needs: this is what the member reads before consenting.'}
            </p>
          </fieldset>

          {/*
            offline_access staat apart omdat het als enige geen gegevens
            vrijgeeft: het bepaalt of de app mag blijven werken wanneer het lid
            er niet is. Tussen de andere vinkjes leest het als "nog een veldje".
          */}
          {offlineScope && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scopes"
                  value={offlineScope.code}
                  checked={selectedScopes.includes(offlineScope.code)}
                  onChange={(e) => toggleScope(offlineScope.code, e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">
                    {nl ? 'Toegang houden zonder het lid erbij' : 'Keep access without the member present'}
                  </span>
                  <span className="mt-1 block text-xs text-amber-900">
                    {nl
                      ? 'Geeft geen extra gegevens vrij, maar wel een refresh token: de app kan blijven werken wanneer het lid niet ingelogd is, tot iemand de toegang intrekt. Vink dit enkel aan voor apps die echt op de achtergrond moeten draaien.'
                      : 'Releases no extra data, but grants a refresh token: the app keeps working while the member is signed out, until someone revokes it. Only tick this for apps that genuinely run in the background.'}
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="skipConsent"
                checked={skipConsent}
                onChange={(e) => setSkipConsent(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{nl ? 'Toestemmingsscherm overslaan' : 'Skip the consent screen'}</span>
                <span className="mt-1 block text-xs text-amber-900">
                  {nl
                    ? 'Enkel voor applicaties die VTK zelf bezit en beheert. Het lid krijgt dan nooit te zien welke gegevens het afstaat en kan dus ook niet weigeren. Zet je dit aan voor een externe app, dan is er geen geldige toestemming en is de doorgifte mogelijk in strijd met de GDPR.'
                    : 'Only for applications VTK itself owns and operates. The member never sees which data they hand over and cannot refuse. Enabling this for a third-party app means there is no valid consent, which may breach the GDPR.'}
                </span>
              </span>
            </label>

            {skipConsent && !vtkOwned && (
              <p className="mt-2 rounded bg-amber-200 p-2 text-xs font-medium text-amber-950">
                {nl
                  ? 'Let op: niet elke redirect-URI staat op een vtk.be-domein. Deze app lijkt dus niet van VTK te zijn, en toestemming overslaan is hier waarschijnlijk niet toegestaan.'
                  : 'Careful: not every redirect URI is on a vtk.be domain. This app does not look like VTK’s own, so skipping consent is probably not permissible here.'}
              </p>
            )}
          </div>
        </div>

        {stepError && <p className="mt-3 text-sm text-red-600">{stepError}</p>}
        {state.status === 'error' && (
          <p className="mt-3 text-sm text-red-600">
            {nl ? 'Aanmaken mislukt: ' : 'Could not create: '}
            {state.message ?? (nl ? 'controleer de gegevens en probeer opnieuw.' : 'check the values and try again.')}
          </p>
        )}

        <div className="mt-4 flex gap-3">
          {step > 0 && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setStepError(null);
                setStep((step - 1) as Step);
              }}
            >
              {nl ? 'Vorige' : 'Back'}
            </Button>
          )}

          {step < 2 ? (
            <Button variant="primary" size="sm" type="button" onClick={next}>
              {nl ? 'Volgende' : 'Next'}
            </Button>
          ) : (
            <Button variant="primary" size="sm" type="button" disabled={pending} onClick={submit}>
              {pending ? (nl ? 'Bezig…' : 'Working…') : nl ? 'Applicatie aanmaken' : 'Create application'}
            </Button>
          )}
        </div>
      </div>

      {state.status === 'success' && (
        <SecretOnceModal
          secret={state.clientSecret ?? ''}
          clientId={state.clientId}
          nl={nl}
          // Publieke clients krijgen geen secret; dan is er niets te tonen en
          // gaan we meteen door naar de lijst.
          hideSecret={!state.clientSecret}
          onClose={() => router.push(listHref)}
        />
      )}
    </>
  );
}
