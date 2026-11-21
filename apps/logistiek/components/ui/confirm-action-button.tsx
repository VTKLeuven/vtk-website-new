'use client';

import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ConfirmDialog } from '@vtk/ui';
import { useToast } from '@vtk/ui/toast';
import type { ActionResult } from '@/app/actions/uitleen';
import { UNSENT, unsentGuard } from '@vtk/ui/unsent-guard';

/**
 * Knop voor een beheer-actie met bevestiging vooraf en een toast achteraf.
 * Zet `confirm` uit voor onschuldige, omkeerbare acties (die krijgen enkel de
 * toast); onomkeerbare acties houden de bevestigings-modal (CLAUDE.md).
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
  /** Tooltip en aria-label van de knop; geef hier de context mee ("Verwijderen: Career Fair"). */
  label: string;
  /**
   * Context voor een screenreader wanneer de knop tekst toont in plaats van een
   * icoon. Bij een icoon is `label` al de aria-label; bij tekst is de zichtbare
   * tekst kort gehouden ("Niet met de kar") en hoort er nog bij wiens knop het
   * is, anders hoort een screenreader tien keer dezelfde zin.
   */
  srLabel?: string;
  /** Korte knoptekst in de bevestigingsdialoog; standaard `label`. */
  confirmLabel?: string;
  action: () => Promise<ActionResult>;
  successMessage: string;
  dialogTitle?: string;
  dialogDescription?: string;
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
      const result = await unsentGuard.run(() => action());
      // Ook wanneer de actie de server nooit bereikte: de rode melding staat er
      // dan al, en een dialoog die openblijft, dekt ze toe.
      setOpen(false);
      if (result === UNSENT) return;
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
