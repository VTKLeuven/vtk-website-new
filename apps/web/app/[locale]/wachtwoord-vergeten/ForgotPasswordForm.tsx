'use client';

import { useActionState } from 'react';
import { requestPasswordResetAction } from '@/app/actions/register';
import { SAVE_IDLE, type SaveState } from '@/lib/saveState';

/**
 * Vraagt een herstellink aan. Toont na het indienen altijd hetzelfde scherm,
 * ook wanneer er geen account op dat adres staat: anders is dit formulier een
 * manier om te achterhalen wie hier een account heeft.
 */
export function ForgotPasswordForm({
  locale,
  labels,
}: {
  locale: 'nl' | 'en';
  labels: {
    email: string;
    submit: string;
    sentTitle: string;
    sentBody: string;
    error: string;
  };
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    requestPasswordResetAction,
    SAVE_IDLE,
  );

  if (state.status === 'success') {
    return (
      <div>
        <h2 className="vtk-auth-alt-title">{labels.sentTitle}</h2>
        <p className="vtk-auth-done">{labels.sentBody}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="vtk-auth-form">
      <input type="hidden" name="locale" value={locale} />
      <div>
        <label htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.status === 'error' && <p className="vtk-auth-error">{labels.error}</p>}
      <button type="submit" className="vtk-auth-submit" disabled={pending}>
        {labels.submit}
      </button>
    </form>
  );
}
