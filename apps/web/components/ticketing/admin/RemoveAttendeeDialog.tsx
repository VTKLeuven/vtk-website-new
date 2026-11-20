"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button, ConfirmDialog, FormError, Textarea } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { useUnsentGuard } from "@/components/ui/unsentGuard";
import type { SaveState } from "@/lib/saveState";

type Labels = {
  button: string;
  title: string;
  description: string;
  confirm: string;
  cancel: string;
  /** Het vinkje voor terugbetalen via Mollie; weg wanneer dat niet kan. */
  refund?: { label: string; hint: string };
  notify: string;
  reason: string;
  reasonHint: string;
  reasonRequired: string;
  success: string;
  successNotified: string;
  errorFallback: string;
};

/**
 * De bevestiging van "Ticket verwijderen", met twee keuzes die `DeleteButton`
 * niet kent: terugbetalen en de koper mailen met een reden. Verder dezelfde
 * flow: bevestigen, uitvoeren via het vangnet, en de uitkomst als toast.
 */
export function RemoveAttendeeDialog({
  action,
  fields,
  labels,
  errorMessages,
}: {
  action: (formData: FormData) => Promise<SaveState>;
  fields: Record<string, string>;
  labels: Labels;
  errorMessages: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [refund, setRefund] = useState(false);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [pending, startTransition] = useTransition();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const showToast = useToast();
  const unsent = useUnsentGuard();
  const reasonId = useId();
  const hintId = useId();
  const errorId = useId();

  // Elke keer opnieuw vanaf de standaard: een keuze uit een geannuleerde
  // poging hoort niet stil mee te gaan naar het volgende ticket.
  function openDialog() {
    setRefund(false);
    setNotify(true);
    setReason("");
    setReasonError(false);
    setOpen(true);
  }

  function onConfirm() {
    if (notify && !reason.trim()) {
      setReasonError(true);
      reasonRef.current?.focus();
      return;
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (refund) form.append("refund", "on");
    if (notify) {
      form.append("notify", "on");
      form.append("reason", reason.trim());
    }
    startTransition(async () => {
      let result: SaveState;
      try {
        result = await action(form);
      } catch (error) {
        setOpen(false);
        if (unsent.report(error)) return;
        throw error;
      }
      if (result.status === "error") {
        setOpen(false);
        showToast({
          message: errorMessages[result.code] ?? result.detail ?? labels.errorFallback,
          variant: "error",
          duration: 0,
        });
        return;
      }
      setOpen(false);
      showToast({ message: notify ? labels.successNotified : labels.success, variant: "success" });
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" type="button" onClick={openDialog}>
        {labels.button}
      </Button>
      <ConfirmDialog
        open={open}
        title={labels.title}
        description={
          <>
            <p>{labels.description}</p>
            {labels.refund ? (
              <label className="mt-3 flex items-start gap-2 text-vtk-ink">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={refund}
                  disabled={pending}
                  onChange={(event) => setRefund(event.target.checked)}
                />
                <span>
                  {labels.refund.label}
                  <span className="mt-0.5 block text-xs text-vtk-muted">{labels.refund.hint}</span>
                </span>
              </label>
            ) : null}
            <label className="mt-3 flex items-start gap-2 text-vtk-ink">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={notify}
                disabled={pending}
                onChange={(event) => {
                  setNotify(event.target.checked);
                  if (!event.target.checked) setReasonError(false);
                }}
              />
              <span>{labels.notify}</span>
            </label>
            {notify ? (
              <div className="mt-3">
                <label htmlFor={reasonId} className="block text-sm font-semibold text-vtk-ink">
                  {labels.reason}
                </label>
                <p id={hintId} className="mt-0.5 text-xs text-vtk-muted">
                  {labels.reasonHint}
                </p>
                <Textarea
                  ref={reasonRef}
                  id={reasonId}
                  className="mt-1.5"
                  rows={4}
                  maxLength={2000}
                  value={reason}
                  disabled={pending}
                  aria-invalid={reasonError || undefined}
                  aria-describedby={reasonError ? `${hintId} ${errorId}` : hintId}
                  onChange={(event) => {
                    setReason(event.target.value);
                    if (event.target.value.trim()) setReasonError(false);
                  }}
                />
                <FormError id={errorId}>{reasonError ? labels.reasonRequired : null}</FormError>
              </div>
            ) : null}
          </>
        }
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
