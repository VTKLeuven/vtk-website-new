'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { consentAction, type ConsentState } from './actions';

const IDLE: ConsentState = { status: 'idle' };

export type ConsentScopeRow = {
  code: string;
  label: string;
  sensitive: boolean;
  /** Nog niet eerder toegestaan; bepaalt of het lid er nu over beslist. */
  isNew: boolean;
};

/**
 * Het toestemmingsscherm (13.2). De vormgeving volgt daar een paar regels die
 * er om veiligheidsredenen staan:
 *
 * - de naam van de toepassing is de grootste tekst, want consent-phishing werkt
 *   door je te laten denken dat je iets anders goedkeurt;
 * - "VTK-toepassing" of "externe toepassing" staat er altijd bij;
 * - scopes staan als zin, nooit als code;
 * - gevoelige scopes zijn apart weigerbaar (voorgevinkt, op vraag van VTK);
 * - `offline_access` krijgt een eigen blok met uitleg;
 * - weigeren en toestaan zien er even belangrijk uit. Een grijze weigerknop
 *   naast een felle toestaanknop is geen keuze.
 */
export function ConsentScreen({
  nl,
  oauthQuery,
  userEmail,
  client,
  scopes,
  alreadyGranted,
  requestsOfflineAccess,
}: {
  nl: boolean;
  oauthQuery: string;
  userEmail: string;
  client: {
    name: string;
    logoUri: string | null;
    clientUri: string | null;
    policyUri: string | null;
    tosUri: string | null;
    vtkOwned: boolean;
  };
  scopes: ConsentScopeRow[];
  alreadyGranted: string[];
  requestsOfflineAccess: boolean;
}) {
  const [state, formAction, actionPending] = useActionState(consentAction, IDLE);
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  // Alles staat voorgevinkt; het lid vinkt af wat het niet wil afstaan.
  const [accepted, setAccepted] = useState<string[]>(() => scopes.map((scope) => scope.code));

  useEffect(() => {
    if (state.status === 'done') window.location.assign(state.redirectTo);
  }, [state]);

  const done = state.status === 'done';
  const offline = scopes.find((scope) => scope.code === 'offline_access');
  const regular = scopes.filter((scope) => scope.code !== 'offline_access');

  function submit(accept: boolean) {
    const formData = new FormData();
    formData.set('oauthQuery', oauthQuery);
    formData.set('accept', accept ? '1' : '0');
    // `openid` blijft altijd mee: zonder die scope is het geen OIDC-login meer.
    // Eerder toegestane scopes gaan ook mee, anders vervangt de plugin de rij
    // en verliest het lid wat het eerder al gaf.
    for (const scope of new Set(['openid', ...alreadyGranted, ...accepted])) {
      formData.append('scopes', scope);
    }
    // Er staat hier geen <form>, dus geen `action`-prop die dit voor ons doet:
    // buiten een transition klaagt React en loopt `pending` niet mee.
    startTransition(() => formAction(formData));
  }

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        {client.logoUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.logoUri} alt="" className="mx-auto mb-3 h-12 w-12 rounded-xl object-cover" />
        )}

        <h1 className="vtk-auth-title text-center">
          {client.name}
          <span className="mt-1 block text-base font-normal">
            {nl ? 'wil toegang tot je VTK-account' : 'wants access to your VTK account'}
          </span>
        </h1>

        <p className="mb-4 text-center text-sm">
          {client.vtkOwned ? (
            <span className="text-[#5c667f]">{nl ? 'VTK-toepassing' : 'VTK application'}</span>
          ) : (
            <span className="font-medium text-amber-800">{nl ? '⚠ Externe toepassing' : '⚠ External application'}</span>
          )}
          {client.clientUri && (
            <>
              {' · '}
              <a href={client.clientUri} target="_blank" rel="noreferrer noopener" className="underline">
                {new URL(client.clientUri).hostname}
              </a>
            </>
          )}
        </p>

        <p className="mb-2 text-sm font-medium">{nl ? 'Deze toepassing krijgt:' : 'This application will get:'}</p>

        <ul className="mb-4 space-y-2 text-sm">
          {regular.map((scope) => (
            <li key={scope.code}>
              {scope.sensitive ? (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={accepted.includes(scope.code)}
                    onChange={(e) =>
                      setAccepted((prev) =>
                        e.target.checked ? [...prev, scope.code] : prev.filter((code) => code !== scope.code)
                      )
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="text-amber-800">⚠ {scope.label}</span>
                    <span className="block text-xs text-[#5c667f]">
                      {nl ? 'Optioneel; je kan dit weigeren.' : 'Optional; you may refuse this.'}
                    </span>
                  </span>
                </label>
              ) : (
                <span className="flex items-start gap-2">
                  <span aria-hidden>✓</span>
                  <span>
                    {scope.label}
                    {scope.code === 'email' && <span className="block text-xs text-[#5c667f]">{userEmail}</span>}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>

        {offline && requestsOfflineAccess && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={accepted.includes(offline.code)}
                onChange={(e) =>
                  setAccepted((prev) =>
                    e.target.checked ? [...prev, offline.code] : prev.filter((code) => code !== offline.code)
                  )
                }
                className="mt-1"
              />
              <span>
                <span className="font-medium">
                  {nl ? 'Toegang houden wanneer je niet aangemeld bent' : 'Keep access while you are signed out'}
                </span>
                <span className="mt-1 block text-xs text-amber-900">
                  {nl
                    ? 'De toepassing kan je gegevens ook opvragen wanneer je niet ingelogd bent, tot je de toegang intrekt.'
                    : 'The application can request your data even when you are not signed in, until you revoke its access.'}
                </span>
              </span>
            </label>
          </div>
        )}

        {alreadyGranted.length > 0 && (
          <p className="mb-4 text-xs text-[#5c667f]">
            {nl
              ? 'Deze toepassing had al eerder toegang tot een deel van je gegevens; die keuze blijft staan.'
              : 'This application already had access to some of your data; that choice stays as it is.'}
          </p>
        )}

        {(client.policyUri || client.tosUri) && (
          <p className="mb-2 text-xs">
            {client.policyUri && (
              <a href={client.policyUri} target="_blank" rel="noreferrer noopener" className="underline">
                {nl ? 'Privacybeleid ↗' : 'Privacy policy ↗'}
              </a>
            )}
            {client.policyUri && client.tosUri && ' · '}
            {client.tosUri && (
              <a href={client.tosUri} target="_blank" rel="noreferrer noopener" className="underline">
                {nl ? 'Gebruiksvoorwaarden ↗' : 'Terms of use ↗'}
              </a>
            )}
          </p>
        )}

        {/* Toestaan mag niet aanvoelen als een eenrichtingsdeur. */}
        <p className="mb-4 text-xs text-[#5c667f]">
          {nl
            ? 'Je kan deze toegang altijd intrekken via Mijn account → Verbonden apps.'
            : 'You can revoke this access at any time via My account → Connected apps.'}
        </p>

        {state.status === 'error' && (
          <p className="vtk-auth-error">
            {nl
              ? 'Deze aanvraag is verlopen of ongeldig. Start opnieuw vanuit de toepassing.'
              : 'This request has expired or is invalid. Start again from the application.'}
          </p>
        )}

        <div className="flex gap-3">
          {/* Beide knoppen even zwaar; zie de opmerking bovenaan. */}
          <Button variant="ghost" type="button" disabled={pending || done} onClick={() => submit(false)}>
            {nl ? 'Weigeren' : 'Refuse'}
          </Button>
          <Button variant="primary" type="button" disabled={pending || done} onClick={() => submit(true)}>
            {nl ? 'Toestaan' : 'Allow'}
          </Button>
        </div>
      </div>
    </div>
  );
}
