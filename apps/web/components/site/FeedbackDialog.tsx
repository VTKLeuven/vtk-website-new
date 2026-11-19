"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDictionary, type Locale } from "@vtk/i18n";
import { DOPL_ORIGIN, doplFeedbackEmbedUrl, doplFeedbackFormUrl, type DoplFeedbackContext } from "@/lib/feedback";

/**
 * "Feedback over de website", vanuit het accountmenu.
 *
 * De melding gaat naar Dopl, waar IT al zijn werk bijhoudt; vroeger bewaarde de
 * site ze zelf en las IT ze op een apart beheerscherm na. Het formulier is dat
 * van Dopl ("Feedback Nieuwe Website"), in een iframe.
 *
 * Bewust niet het `embed.js` van Dopl: dat zet op elke pagina een zwarte knop in
 * de hoek, in een andere huisstijl, en laadt een extern script voor iedereen.
 * Hier blijft de ingang waar ze was (het accountmenu) en laadt Dopl pas na een
 * klik. Het gesprek met de iframe is wel dat van `embed.js`: `?embed=modal`,
 * en de berichten `dopl:resize` en `dopl:close`, enkel van Dopl zelf.
 *
 * Het formulier van Dopl draagt zijn eigen titel en sluitknop; deze modal is
 * daarom enkel een kader, zonder tweede kop. De taal van de pagina en de naam
 * en het adres van wie ingelogd is gaan mee in de URL, zodat Dopl niet in het
 * Engels vraagt wie je bent terwijl de site dat al weet.
 */
export function FeedbackDialog({
  locale,
  name,
  email,
  onClose,
}: {
  locale: Locale;
  name: string;
  email: string;
  onClose: () => void;
}) {
  const dict = getDictionary(locale).feedback;

  // Naar `document.body` en niet in het accountmenu: dat paneel heeft
  // `overflow: hidden` en een `backdrop-filter`, en dat laatste maakt het het
  // referentiekader voor `position: fixed`. Een modal daarbinnen zou in de hoek
  // van het menu geknipt worden.
  if (typeof document === "undefined") return null;

  return createPortal(
    <FeedbackFrame dict={dict} context={{ locale, name, email }} onClose={onClose} />,
    document.body,
  );
}

function FeedbackFrame({
  dict,
  context,
  onClose,
}: {
  dict: ReturnType<typeof getDictionary>["feedback"];
  context: DoplFeedbackContext;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const pressedOutsideRef = useRef(false);
  const suppressCloseCountRef = useRef(0);
  const [src] = useState(() => doplFeedbackEmbedUrl(window.location.origin, context));
  const [height, setHeight] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
    }
    closeBtnRef.current?.focus();
    return () => {
      if (dialog.open) {
        // React Strict Mode dubbelt mounts door cleanup + remount te draaien; een
        // programmatisch `dialog.close()` vuurt een asynchroon `close`-event.
        // Sla dat event over zodat remount niet meteen `onClose` triggert.
        suppressCloseCountRef.current += 1;
        dialog.close();
      }
    };
  }, []);

  useEffect(() => {
    // Enkel van Dopl en enkel van deze iframe: elk ander venster kan ook
    // berichten sturen, en "sluit" of "word 9000 px hoog" hoort daar niet bij.
    function onMessage(event: MessageEvent) {
      if (event.origin !== DOPL_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      const data = (event.data ?? {}) as { type?: unknown; height?: unknown };
      if (data.type === "dopl:close") onClose();
      if (data.type === "dopl:resize" && typeof data.height === "number") {
        setHeight(Math.ceil(data.height));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onClose]);

  function isOutside(clientX: number, clientY: number, dialog: HTMLDialogElement) {
    const r = dialog.getBoundingClientRect();
    return clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom;
  }

  return (
    <dialog
      ref={dialogRef}
      className="vtk-feedback-dialog"
      aria-label={dict.title}
      {...({ closedby: "any" } as Record<string, string>)}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        if (suppressCloseCountRef.current > 0) {
          suppressCloseCountRef.current -= 1;
          return;
        }
        if (event.currentTarget.open) return;
        onClose();
      }}
      onPointerDown={(event) => {
        if ("closedBy" in HTMLDialogElement.prototype) {
          pressedOutsideRef.current = false;
          return;
        }
        pressedOutsideRef.current =
          event.target === event.currentTarget &&
          isOutside(event.clientX, event.clientY, event.currentTarget);
      }}
      onPointerUp={(event) => {
        if ("closedBy" in HTMLDialogElement.prototype) return;
        const wasOutside = pressedOutsideRef.current;
        pressedOutsideRef.current = false;
        if (
          wasOutside &&
          event.target === event.currentTarget &&
          isOutside(event.clientX, event.clientY, event.currentTarget)
        ) {
          onClose();
        }
      }}
    >
      <div className="vtk-feedback-embed">
        <div className="vtk-feedback-frame" data-loaded={loaded || undefined}>
          {loaded ? null : (
            <p className="vtk-feedback-loading" role="status">
              {dict.loading}
            </p>
          )}
          <iframe
            ref={frameRef}
            src={src}
            title={dict.title}
            style={height ? { height } : undefined}
            onLoad={() => {
              setLoaded(true);
            }}
          />
        </div>
        {/* Dopl kent de pagina niet waar je stond; vroeger ging die vanzelf mee.
            Ze staat hier, zodat je ze kan overnemen als het daarover gaat. */}
        <p className="vtk-feedback-context">
          {dict.pageLabel}: <code>{pathname}</code>
          <span aria-hidden="true"> · </span>
          <a href={doplFeedbackFormUrl(context)} target="_blank" rel="noopener noreferrer">
            {dict.openInTab}
          </a>
          <span aria-hidden="true"> · </span>
          {/* Ook wanneer Dopl niet laadt, en dus zijn eigen sluitknop er niet is. */}
          <button ref={closeBtnRef} type="button" onClick={onClose}>
            {dict.close}
          </button>
        </p>
      </div>
    </dialog>
  );
}
