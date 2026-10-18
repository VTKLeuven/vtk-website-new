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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => doplFeedbackEmbedUrl(window.location.origin, context));
  const [height, setHeight] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
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
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
    };
  }, [onClose]);

  return (
    <div
      className="vtk-feedback-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={dict.title}
      onClick={onClose}
    >
      <div className="vtk-feedback-embed" onClick={(event) => event.stopPropagation()}>
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
              frameRef.current?.focus();
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
          <button type="button" onClick={onClose}>
            {dict.close}
          </button>
        </p>
      </div>
    </div>
  );
}
