'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { startPaymentAction } from '@/app/actions/uitleen';

/* Start de online betaling en stuurt de browser naar de hosted checkout. */
export function PayButton({
  target,
  id,
  amountLabel,
  locale = 'nl',
}: {
  target: 'reservation' | 'van';
  id: string;
  amountLabel: string;
  locale?: 'nl' | 'en';
}) {
  const en = locale === 'en';
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pay() {
    setError(null);
    startTransition(async () => {
      const result = await startPaymentAction(target, id);
      if (result.ok) {
        window.location.assign(result.url);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <Button type="button" className="w-full" onClick={pay} disabled={pending}>
        {pending ? (en ? 'One moment...' : 'Even geduld...') : en ? `Pay ${amountLabel} online` : `Betaal ${amountLabel} online`}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
