'use client';

import { useState } from 'react';
import { signInKul } from '@vtk/auth/client';

export function KulSignInButton({ nextParam, label }: { nextParam: string; label: string }) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      className="vtk-auth-sso"
      onClick={async () => {
        setPending(true);
        try {
          await signInKul(nextParam || '/');
        } catch {
          // signInKul redirects on success; on a thrown error fall through so
          // the button re-enables and the user can retry.
          setPending(false);
        }
      }}
    >
      {label}
    </button>
  );
}
