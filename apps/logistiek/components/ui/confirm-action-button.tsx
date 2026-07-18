'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ConfirmDialog } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import type { ActionResult } from '@/app/actions/uitleen';

/**
 * Knop voor een beheer-actie met bevestiging vooraf en een toast achteraf.
 * Zet `confirm` uit voor onschuldige, omkeerbare acties (die krijgen enkel de
 * toast); onomkeerbare acties houden de bevestigings-modal (CLAUDE.md).
 */
export function ConfirmActionButton({
  label,
  action,
  successMessage,
  dialogTitle,
  dialogDescription,
  confirm = true,
  destructive = false,
  variant = 'ghost',
}: {
  label: string;
  action: () => Promise<ActionResult>;
  successMessage: string;
  dialogTitle?: string;
  dialogDescription?: string;
  confirm?: boolean;
  destructive?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await action();
      setOpen(false);
      if (result.ok) {
        showToast({ message: result.message ?? successMessage, variant: 'success' });
        router.refresh();
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={pending}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {label}
      </Button>
      {confirm ? (
        <ConfirmDialog
          open={open}
          title={dialogTitle ?? `${label}?`}
          description={dialogDescription}
          confirmLabel={label}
          cancelLabel="Annuleren"
          destructive={destructive}
          pending={pending}
          onConfirm={run}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
