'use client';

import { useActionState, useState } from 'react';
import { Button } from '@vtk/ui';
import { SaveForm } from '@/components/ui/SaveForm';
import { DeleteButton } from '@/components/ui/DeleteIconButton';
import {
  deleteClientAction,
  revokeTokensAction,
  rotateSecretAction,
  updateClientAction,
  type RotateState,
} from '../actions';
import { SecretOnceModal } from '../SecretOnceModal';
import { ToggleClientButton } from './ToggleClientButton';

const ROTATE_IDLE: RotateState = { status: 'idle' };

export type EditableClient = {
  clientId: string;
  name: string;
  redirectUris: string[];
  clientUri: string;
  contacts: string[];
  scopes: string[];
  skipConsent: boolean;
  disabled: boolean;
  /** Publieke clients (browser/native) hebben geen secret om te roteren. */
  isPublic: boolean;
};

export type ScopeChoice = { code: string; label: string; sensitive: boolean };

export function ClientEditor({
  nl,
  client,
  scopes,
  listHref,
}: {
  nl: boolean;
  client: EditableClient;
  /** De volledige scope-registry; aangevinkt staat wat de client nu heeft. */
  scopes: ScopeChoice[];
  /** Waar we naartoe gaan na verwijderen; deze pagina bestaat dan niet meer. */
  listHref: string;
}) {
  const [rotateState, rotateAction, rotating] = useActionState(rotateSecretAction, ROTATE_IDLE);
  const [secretDismissed, setSecretDismissed] = useState(false);
  const showSecret = rotateState.status === 'success' && !secretDismissed;

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">{nl ? 'Gegevens' : 'Details'}</h2>

        <SaveForm
          action={updateClientAction}
          submitLabel={nl ? 'Opslaan' : 'Save'}
          savingLabel={nl ? 'Opslaan…' : 'Saving…'}
          savedMessage={nl ? 'Opgeslagen' : 'Saved'}
          fallbackErrorMessage={nl ? 'Opslaan mislukt' : 'Could not save'}
          errorMessages={{
            INVALID_INPUT: nl
              ? 'Controleer de gegevens: naam, minstens één redirect-URI en minstens één scope zijn verplicht.'
              : 'Check the values: name, at least one redirect URI and at least one scope are required.',
            REDIRECT_INVALID_URL: nl
              ? 'Elke redirect-URI moet een volledige URL zijn, bv. https://app.vtk.be/callback.'
              : 'Every redirect URI must be a full URL, e.g. https://app.vtk.be/callback.',
            REDIRECT_FRAGMENT: nl
              ? 'Een redirect-URI mag geen fragment (#...) bevatten.'
              : 'A redirect URI must not contain a fragment (#...).',
            REDIRECT_NOT_HTTPS: nl
              ? 'Een redirect-URI moet https gebruiken; enkel localhost mag over http.'
              : 'A redirect URI must use https; only localhost may use http.',
          }}
          className="mt-3 space-y-3"
        >
          <input type="hidden" name="clientId" value={client.clientId} />

          <div>
            <label htmlFor="name" className="block text-sm">
              {nl ? 'Naam' : 'Name'}
            </label>
            <input
              id="name"
              name="name"
              defaultValue={client.name}
              required
              className="w-full rounded border p-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="redirectUris" className="block text-sm">
              {nl ? 'Redirect-URI’s (één per regel)' : 'Redirect URIs (one per line)'}
            </label>
            <textarea
              id="redirectUris"
              name="redirectUris"
              rows={3}
              defaultValue={client.redirectUris.join('\n')}
              required
              className="w-full rounded border p-2 font-mono text-xs"
            />
            <p className="mt-1 text-xs text-amber-700">
              {nl
                ? 'Wie hier een adres toevoegt, kan autorisatiecodes van leden daarheen laten sturen. Deze wijziging wordt apart gelogd.'
                : 'Adding an address here lets member authorization codes be sent there. This change is logged separately.'}
            </p>
          </div>

          <div>
            <label htmlFor="clientUri" className="block text-sm">
              {nl ? 'Website' : 'Website'}
            </label>
            <input
              id="clientUri"
              name="clientUri"
              defaultValue={client.clientUri}
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
              defaultValue={client.contacts.join('\n')}
              className="w-full rounded border p-2 text-sm"
            />
          </div>

          <fieldset>
            <legend className="text-sm">{nl ? 'Wat mag deze app zien?' : 'What may this app see?'}</legend>
            <div className="mt-2 space-y-1">
              {scopes
                .filter((scope) => scope.code !== 'offline_access')
                .map((scope) => (
                  <label key={scope.code} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="scopes"
                      value={scope.code}
                      defaultChecked={client.scopes.includes(scope.code)}
                      className="mt-1"
                    />
                    <span>
                      <span className={scope.sensitive ? 'text-amber-800' : ''}>{scope.label}</span>
                      <code className="ml-2 text-xs text-zinc-400">{scope.code}</code>
                    </span>
                  </label>
                ))}
            </div>

            {/* Zie de wizard: dit vinkje geeft geen gegevens vrij maar duur. */}
            {scopes.some((scope) => scope.code === 'offline_access') && (
              <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="scopes"
                    value="offline_access"
                    defaultChecked={client.scopes.includes('offline_access')}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">
                      {nl ? 'Toegang houden zonder het lid erbij' : 'Keep access without the member present'}
                    </span>
                    <span className="mt-1 block text-xs text-amber-900">
                      {nl
                        ? 'Geeft geen extra gegevens vrij, maar wel een refresh token: de app kan blijven werken wanneer het lid niet ingelogd is, tot iemand de toegang intrekt.'
                        : 'Releases no extra data, but grants a refresh token: the app keeps working while the member is signed out, until someone revokes it.'}
                    </span>
                  </span>
                </label>
              </div>
            )}
            <p className="mt-2 text-xs text-amber-700">
              {nl
                ? 'Een scope wegnemen geldt meteen voor nieuwe aanvragen, maar reeds uitgedeelde tokens houden hun oude scopes tot ze vervallen. Trek de tokens in wanneer het echt nu moet stoppen.'
                : 'Removing a scope applies to new requests immediately, but tokens already issued keep their old scopes until they expire. Revoke the tokens when it must stop now.'}
            </p>
          </fieldset>

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="skipConsent" defaultChecked={client.skipConsent} className="mt-1" />
              <span>
                <span className="font-medium">{nl ? 'Toestemmingsscherm overslaan' : 'Skip the consent screen'}</span>
                <span className="mt-1 block text-xs text-amber-900">
                  {nl
                    ? 'Enkel voor applicaties die VTK zelf bezit en beheert. Het lid krijgt dan nooit te zien welke gegevens het afstaat en kan dus ook niet weigeren. Zet je dit aan voor een externe app, dan is er geen geldige toestemming en is de doorgifte mogelijk in strijd met de GDPR.'
                    : 'Only for applications VTK itself owns and operates. The member never sees which data they hand over and cannot refuse. Enabling this for a third-party app means there is no valid consent, which may breach the GDPR.'}
                </span>
              </span>
            </label>
          </div>
        </SaveForm>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">{nl ? 'Beheer' : 'Management'}</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <ToggleClientButton clientId={client.clientId} disabled={client.disabled} nl={nl} />

          {!client.isPublic && (
            <form action={rotateAction}>
              <input type="hidden" name="clientId" value={client.clientId} />
              <Button variant="ghost" size="sm" type="submit" disabled={rotating}>
                {nl ? 'Nieuw secret genereren' : 'Rotate secret'}
              </Button>
            </form>
          )}

          <DeleteButton
            action={revokeTokensAction}
            fields={{ clientId: client.clientId }}
            title={nl ? 'Tokens intrekken' : 'Revoke tokens'}
            description={
              nl
                ? 'Alle refresh tokens van deze app worden weggegooid, zodat niets meer vernieuwd kan worden. Let op: access tokens die al uitgedeeld zijn, blijven geldig tot ze vervallen; de app kan dus nog even doorwerken. De app zelf blijft bestaan en leden kunnen opnieuw verbinden.'
                : 'All refresh tokens for this app are deleted, so nothing can be renewed. Note: access tokens already issued stay valid until they expire, so the app may keep working briefly. The app itself remains and members can reconnect.'
            }
            confirmLabel={nl ? 'Intrekken' : 'Revoke'}
            cancelLabel={nl ? 'Annuleren' : 'Cancel'}
            successMessage={nl ? 'Tokens ingetrokken' : 'Tokens revoked'}
          >
            {nl ? 'Tokens intrekken' : 'Revoke tokens'}
          </DeleteButton>

          <DeleteButton
            action={deleteClientAction}
            fields={{ clientId: client.clientId, redirectTo: listHref }}
            title={nl ? 'Applicatie verwijderen' : 'Delete application'}
            description={
              nl
                ? 'De app, alle toestemmingen van leden en alle tokens worden verwijderd. Leden verliezen meteen hun toegang en de integratie stopt. De geschiedenis van deze app blijft bewaard.'
                : 'The app, every member consent and all tokens are deleted. Members lose access immediately and the integration stops. This app’s history is kept.'
            }
            confirmLabel={nl ? 'Verwijderen' : 'Delete'}
            cancelLabel={nl ? 'Annuleren' : 'Cancel'}
          >
            {nl ? 'Verwijderen' : 'Delete'}
          </DeleteButton>
        </div>

        {rotateState.status === 'error' && (
          <p className="mt-2 text-sm text-red-600">{nl ? 'Roteren mislukt.' : 'Rotation failed.'}</p>
        )}
      </section>

      {showSecret && rotateState.status === 'success' && (
        <SecretOnceModal secret={rotateState.clientSecret} nl={nl} onClose={() => setSecretDismissed(true)} />
      )}
    </>
  );
}
