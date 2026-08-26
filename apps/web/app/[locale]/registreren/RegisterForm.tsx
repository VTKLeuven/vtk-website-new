'use client';

import { useActionState } from 'react';
import { registerAction } from '@/app/actions/register';
import { SAVE_IDLE, type SaveState } from '@/lib/saveState';

/**
 * Registratie voor wie geen KU Leuven-login (meer) heeft.
 *
 * Het formulier verdwijnt na een geslaagde inzending en maakt plaats voor
 * "kijk je mailbox na". Dat scherm is bewust hetzelfde of het adres nu vrij was
 * of al een account had: zie `registerAction`.
 */
export function RegisterForm({
  locale,
  labels,
}: {
  locale: 'nl' | 'en';
  labels: {
    firstName: string;
    lastName: string;
    email: string;
    emailHint: string;
    password: string;
    passwordHint: string;
    passwordRepeat: string;
    graduationYear: string;
    graduationYearHint: string;
    wasInVtk: string;
    wasInVtkHint: string;
    mailOptIn: string;
    submit: string;
    sentTitle: string;
    sentBody: string;
    sentSpam: string;
    errors: Record<string, string>;
    errorFallback: string;
  };
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    registerAction,
    SAVE_IDLE,
  );

  if (state.status === 'success') {
    return (
      <div>
        <h2 className="vtk-auth-alt-title">{labels.sentTitle}</h2>
        <p className="vtk-auth-done">{labels.sentBody}</p>
        <p className="vtk-auth-hint">{labels.sentSpam}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="vtk-auth-form">
      <input type="hidden" name="locale" value={locale} />
      <div className="vtk-auth-row">
        <div>
          <label htmlFor="firstName">{labels.firstName}</label>
          <input id="firstName" name="firstName" autoComplete="given-name" required />
        </div>
        <div>
          <label htmlFor="lastName">{labels.lastName}</label>
          <input id="lastName" name="lastName" autoComplete="family-name" required />
        </div>
      </div>

      <div>
        <label htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <p className="vtk-auth-hint">{labels.emailHint}</p>
      </div>

      <div className="vtk-auth-row">
        <div>
          <label htmlFor="password">{labels.password}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
          <p className="vtk-auth-hint">{labels.passwordHint}</p>
        </div>
        <div>
          <label htmlFor="passwordRepeat">{labels.passwordRepeat}</label>
          <input
            id="passwordRepeat"
            name="passwordRepeat"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="graduationYear">{labels.graduationYear}</label>
        {/* `inputMode` en geen `type="number"`: een spinner op een jaartal is
            onbruikbaar op een telefoon en scrollt per ongeluk mee. */}
        <input
          id="graduationYear"
          name="graduationYear"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          placeholder="2019"
        />
        <p className="vtk-auth-hint">{labels.graduationYearHint}</p>
      </div>

      <div>
        <div className="vtk-auth-check">
          <input id="wasInVtk" name="wasInVtk" type="checkbox" />
          <label htmlFor="wasInVtk">{labels.wasInVtk}</label>
        </div>
        <p className="vtk-auth-hint">{labels.wasInVtkHint}</p>
      </div>

      <div className="vtk-auth-check">
        <input id="mailOptIn" name="mailOptIn" type="checkbox" />
        <label htmlFor="mailOptIn">{labels.mailOptIn}</label>
      </div>

      {state.status === 'error' && (
        <p className="vtk-auth-error">{labels.errors[state.code] ?? labels.errorFallback}</p>
      )}

      <button type="submit" className="vtk-auth-submit" disabled={pending}>
        {labels.submit}
      </button>
    </form>
  );
}
