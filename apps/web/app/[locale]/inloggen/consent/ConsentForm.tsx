'use client';

import { useActionState, useEffect } from 'react';
import { consentAction, type ConsentState } from './actions';

export function ConsentForm({ oauthQuery }: { oauthQuery: string }) {
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(consentAction, undefined);

  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state?.redirectTo]);

  const done = !!state?.redirectTo;

  return (
    <form className="vtk-auth-form">
      {/* Verbatim terug: de plugin verifieert de handtekening hierover. */}
      <input type="hidden" name="oauthQuery" value={oauthQuery} />

      {state?.error === 'EXPIRED' && (
        <p className="vtk-auth-error">
          Deze aanvraag is verlopen of ongeldig. Start opnieuw vanuit de applicatie die je hierheen stuurde.
        </p>
      )}

      {/* Weigeren verwijdert niets, dus geen bevestigingsdialoog. */}
      <button type="submit" name="accept" value="1" formAction={formAction} disabled={pending || done}>
        Toestaan
      </button>
      <button type="submit" name="accept" value="0" formAction={formAction} disabled={pending || done}>
        Weigeren
      </button>
    </form>
  );
}
