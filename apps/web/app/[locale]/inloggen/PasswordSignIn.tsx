'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { loginAction, type LoginState } from '@/app/actions/auth';
import { resendVerificationAction } from '@/app/actions/register';
import { SAVE_IDLE, type SaveState } from '@/lib/saveState';

/**
 * De tweede deur op het inlogscherm: e-mail en wachtwoord.
 *
 * Ze staat bewust dicht. Verreweg de meeste bezoekers zijn student en horen op
 * de KU Leuven-knop te drukken; twee even grote formulieren naast elkaar zetten
 * betekent dat de helft van hen eerst een wachtwoord probeert te verzinnen dat
 * niet bestaat. Wie hier moet zijn (alumni, ereleden, beheerdersaccounts) weet
 * dat van zichzelf en klikt de regel eronder open.
 *
 * Staat KU Leuven-SSO uit (geen env-vars), dan is dit het enige pad en staat het
 * open; dan is er niets om achter te verbergen.
 */
export function PasswordSignIn({
  nextParam,
  hardRedirect = false,
  base,
  defaultOpen = false,
  labels,
}: {
  nextParam: string;
  hardRedirect?: boolean;
  /** "" voor NL, "/en" voor EN. */
  base: string;
  defaultOpen?: boolean;
  labels: {
    lead: string;
    link: string;
    panelTitle: string;
    panelIntro: string;
    email: string;
    password: string;
    signIn: string;
    invalid: string;
    unverified: string;
    resend: string;
    resendSent: string;
    noAccountYet: string;
    createAccount: string;
    forgotPassword: string;
  };
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  const [resendState, resendAction, resendPending] = useActionState<SaveState, FormData>(
    resendVerificationAction,
    SAVE_IDLE,
  );
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state?.redirectTo]);

  if (!open) {
    return (
      <p className="vtk-auth-alt">
        {labels.lead}{' '}
        <button type="button" className="vtk-auth-alt-link" onClick={() => setOpen(true)}>
          {labels.link}
        </button>
      </p>
    );
  }

  return (
    <div className="vtk-auth-alt-panel">
      <h2 className="vtk-auth-alt-title">{labels.panelTitle}</h2>
      <p className="vtk-auth-alt-intro">{labels.panelIntro}</p>

      <form action={formAction} className="vtk-auth-form">
        <input type="hidden" name="next" value={nextParam} />
        <input type="hidden" name="hardRedirect" value={hardRedirect ? '1' : '0'} />
        <div>
          <label htmlFor="email">{labels.email}</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password">{labels.password}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
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

      {/* Enkel wanneer het wachtwoord klopte maar het adres nooit bevestigd is.
          Dat onderscheid maakt de server (zie checkLoginBlocked), zodat dit
          bericht niet verklapt welke adressen een account hebben. */}
      {state?.error === 'UNVERIFIED' && (
        <div className="vtk-auth-notice">
          <p>{labels.unverified}</p>
          {resendState.status === 'success' ? (
            <p className="vtk-auth-notice-done">{labels.resendSent}</p>
          ) : (
            <form action={resendAction}>
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="locale" value={base === '/en' ? 'en' : 'nl'} />
              <button type="submit" className="vtk-auth-alt-link" disabled={resendPending}>
                {labels.resend}
              </button>
            </form>
          )}
        </div>
      )}

      <p className="vtk-auth-links">
        <Link href={`${base}/wachtwoord-vergeten`}>{labels.forgotPassword}</Link>
        <span>
          {labels.noAccountYet}{' '}
          <Link href={`${base}/registreren`}>{labels.createAccount}</Link>
        </span>
      </p>
    </div>
  );
}
