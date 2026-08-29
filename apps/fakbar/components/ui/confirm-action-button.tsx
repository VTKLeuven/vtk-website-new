'use client';

import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ConfirmDialog } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import type { ActionResult } from '@/app/actions/fakbar';

/**
 * Knop voor een beheer-actie met een bevestiging vooraf en een toast achteraf.
 * Overgenomen uit `apps/logistiek/components/ui/confirm-action-button.tsx`.
 *
 * Zet `confirm` uit voor onschuldige, omkeerbare acties (die krijgen enkel de
 * toast); wat weg is en niet terugkomt houdt de dialoog (CLAUDE.md). Zeg in
 * `dialogDescription` wat er precies verdwijnt en wat blijft, niet enkel "weet
 * je het zeker?".
 */
export function ConfirmActionButton({
  label,
  srLabel,
  confirmLabel,
  action,
  successMessage,
  dialogTitle,
  dialogDescription,
  confirm = true,
  destructive = false,
  variant = 'ghost',
  icon,
}: {
  /** Tooltip en aria-label; geef context mee ("Verwijderen: Duvel"). */
  label: string;
  /** Context voor een screenreader wanneer de knop tekst toont in plaats van een icoon. */
  srLabel?: string;
  confirmLabel?: string;
  action: () => Promise<ActionResult>;
  successMessage: string;
  dialogTitle?: string;
  dialogDescription?: ReactNode;
  confirm?: boolean;
  destructive?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
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
        className={icon ? 'w-8 !px-0' : undefined}
        aria-label={icon ? label : srLabel}
        title={icon ? label : undefined}
      >
        {icon ?? label}
      </Button>
      {confirm ? (
        <ConfirmDialog
          open={open}
          title={dialogTitle ?? `${label}?`}
          description={dialogDescription}
          confirmLabel={confirmLabel ?? label}
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
