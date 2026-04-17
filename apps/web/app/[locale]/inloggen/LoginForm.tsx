"use client";

import { useActionState } from "react";
import { Button, Input, Label, FormError } from "@vtk/ui";
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
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={nextParam} />
      <div>
        <Label htmlFor="email">{labels.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">{labels.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.error === "INVALID" && <FormError>{labels.invalid}</FormError>}
      <Button type="submit" disabled={pending} className="w-full">
        {labels.signIn}
      </Button>
    </form>
  );
}
