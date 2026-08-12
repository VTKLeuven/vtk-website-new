"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { FormBusyProvider, useFormBusy } from "@/components/ui/formBusy";
import { SAVE_IDLE, type SaveAction } from "@/lib/saveState";

/**
 * Slaat een geldig formulier kort na elke wijziging op en toont de toestand op
 * een vaste plek. Een fout blijft staan tot de gebruiker iets wijzigt of zelf
 * opnieuw probeert.
 */
export function AutoSaveForm({
  action,
  savedMessage,
  dirtyMessage,
  savingMessage,
  invalidMessage,
  retryLabel,
  errorMessages,
  fallbackErrorMessage,
  className,
  children,
  delay = 800,
}: {
  action: SaveAction;
  savedMessage: string;
  dirtyMessage: string;
  savingMessage: string;
  invalidMessage: string;
  retryLabel: string;
  errorMessages?: Record<string, string>;
  fallbackErrorMessage: string;
  className?: string;
  children?: ReactNode;
  delay?: number;
}) {
  const [state, formAction, pending] = useActionState(action, SAVE_IDLE);
  const { busy, register } = useFormBusy();
  const formRef = useRef<HTMLFormElement>(null);
  const handledNonce = useRef<number | null>(null);
  const submittedRevision = useRef(0);
  const blockedRevision = useRef<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [visibleError, setVisibleError] = useState<string | null>(null);

  const dirty = revision !== savedRevision;

  function submitCurrent() {
    const form = formRef.current;
    if (!form || pending || busy || !dirty) return;
    if (!form.checkValidity()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    blockedRevision.current = null;
    submittedRevision.current = revision;
    startTransition(() => formAction(new FormData(form)));
  }

  useEffect(() => {
    if (!dirty || pending || busy || blockedRevision.current === revision) return;
    const timer = window.setTimeout(submitCurrent, delay);
    return () => window.clearTimeout(timer);
    // submitCurrent leest bewust de actuele refs en state van deze render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, dirty, pending, busy, delay]);

  useEffect(() => {
    if (state.status === "idle" || handledNonce.current === state.nonce) return;
    handledNonce.current = state.nonce;
    if (state.status === "success") {
      setSavedRevision(submittedRevision.current);
      blockedRevision.current = null;
      setVisibleError(null);
    } else {
      blockedRevision.current = submittedRevision.current;
      setVisibleError(errorMessages?.[state.code] ?? fallbackErrorMessage);
    }
  }, [state, errorMessages, fallbackErrorMessage]);

  useEffect(() => {
    if (!dirty && !pending) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty, pending]);

  const status = pending || busy
      ? "saving"
      : visibleError
        ? "error"
      : invalid
        ? "invalid"
        : dirty
          ? "dirty"
          : "saved";

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(event) => event.preventDefault()}
      onInputCapture={() => {
        blockedRevision.current = null;
        setInvalid(false);
        setVisibleError(null);
        setRevision((current) => current + 1);
      }}
    >
      <div className="form-admin-autosave" data-state={status} role="status" aria-live="polite">
        {status === "saving" ? (
          <LoaderCircle aria-hidden="true" className="form-admin-autosave-spinner" size={16} />
        ) : status === "error" || status === "invalid" ? (
          <AlertCircle aria-hidden="true" size={16} />
        ) : (
          <Check aria-hidden="true" size={16} />
        )}
        <span>
          {visibleError ??
            (status === "saving"
              ? savingMessage
              : status === "invalid"
                ? invalidMessage
                : status === "dirty"
                  ? dirtyMessage
                  : savedMessage)}
        </span>
        {visibleError ? (
          <button type="button" onClick={submitCurrent}>
            {retryLabel}
          </button>
        ) : null}
      </div>
      <FormBusyProvider register={register}>{children}</FormBusyProvider>
    </form>
  );
}
