"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";

export function LoginForm({
  nextParam,
  labels,
}: {
  nextParam: string;
  labels: { email: string; password: string; signIn: string; invalid: string };
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);

  return (
    <form action={formAction} className="vtk-auth-form">
      <input type="hidden" name="next" value={nextParam} />
      <div>
        <label htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
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
      {state?.error === "INVALID" && <p className="vtk-auth-error">{labels.invalid}</p>}
      <button type="submit" disabled={pending} className="vtk-auth-submit">
        {labels.signIn}
      </button>
    </form>
  );
}
