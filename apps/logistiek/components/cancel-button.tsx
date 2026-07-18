'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ConfirmDialog } from '@vtk/ui';
import type { ActionResult } from '@/app/actions/uitleen';

/* Annuleren is onomkeerbaar en krijgt dus altijd eerst een bevestigings-modal
   (zie CLAUDE.md > UX-conventies). */
export function CancelButton({
  label,
  dialogTitle,
  dialogDescription,
  action,
}: {
  label: string;
  dialogTitle: string;
  dialogDescription: string;
  action: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel="Ja, annuleren"
        cancelLabel="Terug"
        pending={pending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
