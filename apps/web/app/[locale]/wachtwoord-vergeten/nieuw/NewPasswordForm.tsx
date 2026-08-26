'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { setNewPasswordAction } from '@/app/actions/register';
import { SAVE_IDLE, type SaveState } from '@/lib/saveState';

/** Nieuw wachtwoord instellen met de token uit de herstelmail. */
export function NewPasswordForm({
  token,
  signInHref,
  labels,
}: {
  token: string;
  signInHref: string;
  labels: {
    password: string;
    passwordRepeat: string;
    submit: string;
    signIn: string;
    doneTitle: string;
    doneBody: string;
    errors: Record<string, string>;
    errorFallback: string;
  };
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    setNewPasswordAction,
    SAVE_IDLE,
  );

  if (state.status === 'success') {
    return (
      <div>
        <h2 className="vtk-auth-alt-title">{labels.doneTitle}</h2>
        <p className="vtk-auth-done">{labels.doneBody}</p>
        <Link
          className="vtk-auth-submit"
          href={signInHref}
          style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}
        >
          {labels.signIn}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="vtk-auth-form">
      <input type="hidden" name="token" value={token} />
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
      {state.status === 'error' && (
        <p className="vtk-auth-error">{labels.errors[state.code] ?? labels.errorFallback}</p>
      )}
      <button type="submit" className="vtk-auth-submit" disabled={pending}>
        {labels.submit}
      </button>
    </form>
  );
}
