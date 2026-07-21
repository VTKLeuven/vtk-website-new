'use client';

import { useActionState, useEffect } from 'react';
import { loginAction, type LoginState } from '@/app/actions/auth';

export function LoginForm({
  nextParam,
  hardRedirect = false,
  labels,
}: {
  nextParam: string;
  /**
   * Bestemming is een route handler (het authorize-endpoint), geen pagina: de
   * App Router kan daar niet client-side naartoe, dus navigeren we hard.
   */
  hardRedirect?: boolean;
  labels: { email: string; password: string; signIn: string; invalid: string };
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);

  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state?.redirectTo]);

  return (
    <form action={formAction} className="vtk-auth-form">
      <input type="hidden" name="next" value={nextParam} />
      <input type="hidden" name="hardRedirect" value={hardRedirect ? '1' : '0'} />
      <div>
        <label htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label htmlFor="password">{labels.password}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error === 'INVALID' && <p className="vtk-auth-error">{labels.invalid}</p>}
      <button
        type="submit"
        // Na login staat de hard-redirect nog te gebeuren; niet opnieuw laten indienen.
        disabled={pending || !!state?.redirectTo}
        className="vtk-auth-submit"
      >
        {labels.signIn}
      </button>
    </form>
  );
}
