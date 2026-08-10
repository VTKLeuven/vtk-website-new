"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Link2, QrCode } from "lucide-react";
import { createFormShortLinkAction } from "@/app/actions/forms";
import { SaveForm } from "@/components/ui/SaveForm";
import { IconButton } from "@/components/ui/IconButton";
import type { AdminLocale } from "./format";

/**
 * De link naar het formulier, met een QR-code om op een affiche te zetten.
 *
 * De QR wordt in de browser getekend uit de link die er al staat; hem serverside
 * maken zou een route en een cache vragen voor iets dat een paar kilobyte is.
 */
export function SharePanel({
  locale,
  formId,
  formUrl,
  shortLink,
}: {
  locale: AdminLocale;
  formId: string;
  formUrl: string;
  shortLink: string | null;
}) {
  const nl = locale === "nl";
  const shareUrl = shortLink ?? formUrl;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(shareUrl, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0A0F1F", light: "#FFFFFF" },
    })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {
        if (active) setQr(null);
      });
    return () => {
      active = false;
    };
  }, [shareUrl]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section className="ticket-admin-section" aria-labelledby="share-heading">
      <div className="ticket-admin-section-head">
        <div className="ticket-admin-section-heading">
          <span className="ticket-admin-section-icon">
            <QrCode aria-hidden="true" size={17} />
          </span>
          <div>
            <h2 id="share-heading">{nl ? "Delen" : "Share"}</h2>
            <p>{nl ? "Voor een affiche, een story of een mail." : "For a poster, a story or a mail."}</p>
          </div>
        </div>
      </div>

      <div className="form-admin-share">
        <div>
          <p className="ticket-admin-row-meta">{nl ? "Link" : "Link"}</p>
          <p className="ticket-admin-row-title form-admin-share-url">
            {shareUrl}
            <IconButton
              label={copied ? (nl ? "Gekopieerd" : "Copied") : nl ? "Link kopiëren" : "Copy link"}
              srLabel={nl ? "Link kopiëren" : "Copy link"}
              onClick={() => {
                navigator.clipboard?.writeText(shareUrl).then(
                  () => setCopied(true),
                  () => setCopied(false)
                );
              }}
            >
              {/* Het vinkje zit in het icoon zelf, niet enkel in de tooltip. */}
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            </IconButton>
          </p>

          {shortLink ? (
            <p className="form-admin-hint">
              {nl
                ? "Deze verkorte link telt kliks; je vindt hem terug bij Verkorte links."
                : "This short link counts clicks; you find it under Short links."}
            </p>
          ) : (
            <SaveForm
              action={createFormShortLinkAction}
              className="ticket-admin-form"
              submitLabel={nl ? "Verkorte link maken" : "Create short link"}
              savingLabel={nl ? "Bezig..." : "Creating..."}
              savedMessage={nl ? "Verkorte link gemaakt" : "Short link created"}
              fallbackErrorMessage={
                nl ? "Verkorte link maken is niet gelukt." : "Creating the short link failed."
              }
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="formId" value={formId} />
              <p className="form-admin-hint">
                <Link2 aria-hidden="true" size={14} />{" "}
                {nl
                  ? "Een kortere link is handiger op papier en telt hoeveel mensen erop klikken."
                  : "A shorter link works better on paper and counts how many people click it."}
              </p>
            </SaveForm>
          )}
        </div>

        {qr ? (
          <figure className="form-admin-qr">
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URI, geen optimalisatie nodig */}
            <img src={qr} alt={nl ? "QR-code naar het formulier" : "QR code to the form"} />
            <figcaption>
              <a href={qr} download={`formulier-qr.png`}>
                {nl ? "QR-code downloaden" : "Download QR code"}
              </a>
            </figcaption>
          </figure>
        ) : null}
      </div>
    </section>
  );
}
