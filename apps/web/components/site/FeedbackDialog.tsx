"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDictionary, type Locale } from "@vtk/i18n";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { SaveForm } from "@/components/ui/SaveForm";
import { useReportFormBusy } from "@/components/ui/formBusy";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_HINTS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_LIMITS,
  type FeedbackKind,
} from "@/lib/feedback";
import { imageUploadError, imageUploadSizeError } from "@/lib/imageUpload";
import { storageKeyPath } from "@/lib/storageKeyPath";

/**
 * "Feedback Website", vanuit het accountmenu.
 *
 * Het formulier staat in een modal en niet op een eigen pagina, omdat de
 * melding altijd over de pagina gaat waar je nét stond: wegnavigeren zou het
 * enige stuk context weggooien dat je niet hoeft te typen. `usePathname` stuurt
 * dat pad mee.
 *
 * De screenshot is de reden dat dit geen mailtje naar IT is. Plakken werkt
 * overal in het paneel: wie een schermafdruk maakt, heeft ze in het klembord en
 * niet als bestand op zijn bureaublad.
 */
export function FeedbackDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const dict = getDictionary(locale).feedback;

  // Naar `document.body` en niet in het accountmenu: dat paneel heeft
  // `overflow: hidden` en een `backdrop-filter`, en dat laatste maakt het het
  // referentiekader voor `position: fixed`. Een modal daarbinnen zou in de hoek
  // van het menu geknipt worden.
  //
  // De check op `document` is voor de serverrender van de omliggende client
  // component; het paneel zelf verschijnt pas na een klik, dus er valt niets te
  // hydrateren en een `mounted`-vlag is hier overbodig.
  if (typeof document === "undefined") return null;

  return createPortal(<FeedbackPanel locale={locale} dict={dict} onClose={onClose} />, document.body);
}

function FeedbackPanel({
  locale,
  dict,
  onClose,
}: {
  locale: Locale;
  dict: ReturnType<typeof getDictionary>["feedback"];
  onClose: () => void;
}) {
  const fieldId = useId();
  const pathname = usePathname();
  const [kind, setKind] = useState<FeedbackKind>("BUG");
  const [done, setDone] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // De focus in het paneel zetten, anders staat hij nog op het menu-item
  // erachter en doet Tab niets zichtbaars.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("textarea, button")?.focus();
  }, []);

  const errorMessages: Record<string, string> = {
    KIND_INVALID: dict.kindInvalid,
    MESSAGE_REQUIRED: dict.messageRequired,
    MESSAGE_TOO_LONG: dict.messageTooLong,
    IMAGE_INVALID: dict.imageInvalid,
    SAVE_FAILED: dict.saveFailed,
  };

  return (
    <div
      className="vtk-feedback-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={dict.title}
      onClick={onClose}
    >
      <div
        className="vtk-feedback-panel"
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="vtk-feedback-head">
          <h2>{dict.title}</h2>
          <button
            type="button"
            className="vtk-feedback-close"
            onClick={onClose}
            title={dict.close}
            aria-label={dict.close}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {done ? (
          <div className="vtk-feedback-done">
            <p className="vtk-feedback-done-title">{dict.doneTitle}</p>
            <p>{dict.doneText}</p>
            <div className="vtk-feedback-done-actions">
              <button type="button" className="vtk-button vtk-button-primary" onClick={onClose}>
                {dict.close}
              </button>
              <button
                type="button"
                className="vtk-button vtk-button-ghost"
                onClick={() => setDone(false)}
              >
                {dict.another}
              </button>
            </div>
          </div>
        ) : (
          <SaveForm
            action={submitFeedbackAction}
            submitLabel={dict.submit}
            savingLabel={dict.sending}
            savedMessage={dict.sent}
            errorMessages={errorMessages}
            fallbackErrorMessage={dict.failed}
            onSuccess={() => setDone(true)}
            className="vtk-feedback-form"
          >
            <p className="vtk-feedback-intro">{dict.intro}</p>

            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="path" value={pathname} />

            <fieldset className="vtk-feedback-kinds">
              <legend>{dict.kindLabel}</legend>
              <div className="vtk-feedback-chips">
                {FEEDBACK_KINDS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="vtk-feedback-chip"
                    aria-pressed={kind === option}
                    title={
                      locale === "nl"
                        ? FEEDBACK_KIND_HINTS[option].nl
                        : FEEDBACK_KIND_HINTS[option].en
                    }
                    onClick={() => setKind(option)}
                  >
                    {locale === "nl"
                      ? FEEDBACK_KIND_LABELS[option].nl
                      : FEEDBACK_KIND_LABELS[option].en}
                  </button>
                ))}
              </div>
              <p className="vtk-feedback-kind-hint">
                {locale === "nl" ? FEEDBACK_KIND_HINTS[kind].nl : FEEDBACK_KIND_HINTS[kind].en}
              </p>
            </fieldset>

            <label htmlFor={`${fieldId}-message`}>
              <span>{dict.messageLabel}</span>
              <textarea
                id={`${fieldId}-message`}
                name="message"
                rows={5}
                required
                maxLength={FEEDBACK_LIMITS.message}
                placeholder={dict.messagePlaceholder}
              />
            </label>

            <ScreenshotField locale={locale} dict={dict} />

            <label className="vtk-feedback-check">
              <input type="checkbox" name="anonymous" value="1" />
              <span>
                <strong>{dict.anonymous}</strong>
                <em>{dict.anonymousHint}</em>
              </span>
            </label>

            <p className="vtk-feedback-privacy">
              <span className="vtk-feedback-path">
                {dict.pageLabel}: <code>{pathname}</code>
              </span>
              {dict.pageHint}
            </p>
          </SaveForm>
        )}
      </div>
    </div>
  );
}

/**
 * De screenshot. De plak-listener hangt aan `document` en niet aan een
 * uploadveld, zodat Ctrl+V werkt terwijl je nog in het tekstvak staat te typen;
 * dat is precies het moment waarop je hem geplakt wil hebben. Hij bestaat enkel
 * zolang het paneel open staat, en dat paneel is modaal.
 */
function ScreenshotField({
  locale,
  dict,
}: {
  locale: Locale;
  dict: ReturnType<typeof getDictionary>["feedback"];
}) {
  const [key, setKey] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Zonder dit kan de SaveForm verzenden terwijl de upload nog loopt, en komt
  // de melding zonder screenshot binnen onder een groene toast.
  useReportFormBusy(uploading);

  useEffect(() => {
    async function onPaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file || !file.type.startsWith("image/")) continue;
        event.preventDefault();
        await upload(file);
        return;
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // `upload` leest enkel state-setters, dus deze listener hoeft niet mee te
    // veranderen met de geüploade key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(file: File) {
    const sizeError = imageUploadSizeError(file, locale, "feedback");
    setError(sizeError);
    if (sizeError) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "feedback");
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      if (!res.ok) {
        setError(imageUploadError(locale, res.status, "feedback"));
        return;
      }
      const data = (await res.json()) as { key: string };
      setKey(data.key);
    } catch {
      setError(imageUploadError(locale, undefined, "feedback"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="vtk-feedback-shot">
      <span className="vtk-feedback-shot-label">{dict.screenshotLabel}</span>
      <input type="hidden" name="imageKey" value={key} />

      <div
        className="vtk-feedback-drop"
        data-dragging={dragging ? "" : undefined}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          const file = event.dataTransfer.files?.[0];
          setDragging(false);
          if (!file || !file.type.startsWith("image/")) return;
          event.preventDefault();
          void upload(file);
        }}
      >
        {key ? (
          <div className="vtk-feedback-preview">
            <Image
              src={`/api/media/${storageKeyPath(key)}`}
              alt=""
              width={320}
              height={200}
              unoptimized
            />
            <button
              type="button"
              className="vtk-button vtk-button-ghost"
              onClick={() => {
                setKey("");
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              {dict.screenshotRemove}
            </button>
          </div>
        ) : (
          <>
            <p>{uploading ? dict.screenshotUploading : dict.screenshotHint}</p>
            <button
              type="button"
              className="vtk-button vtk-button-ghost"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {dict.screenshotChoose}
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>

      {error ? <p className="vtk-feedback-error">{error}</p> : null}
    </div>
  );
}
