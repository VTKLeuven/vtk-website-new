"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Card } from "@vtk/ui";

const PAGE_QR_CACHE_BUSTER = "uncached-v1";

export function PageQrModal({
  host,
  nl,
  page,
  onClose,
}: {
  host: string;
  nl: boolean;
  page: { slug: string; title: string; published: boolean };
  onClose: () => void;
}) {
  const [retry, setRetry] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const endpoint = `/api/pages/${encodeURIComponent(page.slug)}/qr`;
  const freshEndpoint = `${endpoint}?v=${PAGE_QR_CACHE_BUSTER}`;
  const previewEndpoint = `${freshEndpoint}&preview=${retry}`;
  const filename = `vtk-${page.slug}-qr.png`;
  const urlDisplay = `https://${host}/p/${page.slug}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <Card
        className="my-8 w-full max-w-md p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-qr-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="page-qr-title" className="text-lg font-semibold">
              {nl ? "QR-code" : "QR code"}
            </h2>
            <p className="mt-1 break-all text-sm text-zinc-500">{urlDisplay}</p>
          </div>
          <button
            type="button"
            className="shrink-0 text-zinc-400 hover:text-zinc-700"
            onClick={onClose}
            aria-label={nl ? "Sluiten" : "Close"}
          >
            ✕
          </button>
        </div>

        <figure className="mx-auto mt-5 grid aspect-square w-full max-w-[340px] place-items-center overflow-hidden rounded-[28px] border border-vtk-blue/10 bg-white p-2 shadow-sm">
          {imageFailed ? (
            <div className="px-6 text-center">
              <p className="text-sm text-red-700">
                {nl ? "De QR-code kon niet geladen worden." : "The QR code could not be loaded."}
              </p>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-vtk-ink underline underline-offset-4"
                onClick={() => {
                  setImageFailed(false);
                  setRetry((value) => value + 1);
                }}
              >
                {nl ? "Opnieuw proberen" : "Try again"}
              </button>
            </div>
          ) : (
            <>
              {/* Dynamisch gegenereerde PNG; de image-optimizer kan hier niets winnen. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewEndpoint}
                alt={nl ? `QR-code voor ${urlDisplay}` : `QR code for ${urlDisplay}`}
                className="aspect-square h-auto w-full rounded-[22px]"
                onError={() => setImageFailed(true)}
              />
            </>
          )}
        </figure>

        <p className="mt-4 text-sm leading-6 text-zinc-600">
          {nl
            ? "PNG van 1200 × 1200 px met afgeronde VTK-blauwe vormgeving en het VTK-logo. Test voor drukwerk altijd één proefscan op het uiteindelijke formaat."
            : "1200 × 1200 px PNG with rounded VTK blue styling and the VTK logo. Always test-scan one proof at its final print size."}
        </p>

        {!page.published ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {nl
              ? "Let op: deze pagina is momenteel niet gepubliceerd. De QR-code werkt pas wanneer de pagina gepubliceerd is."
              : "Note: this page is currently not published. The QR code only works while the page is published."}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {nl ? "Sluiten" : "Close"}
          </Button>
          <a
            href={`${freshEndpoint}&download=1`}
            download={filename}
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface shadow-sm transition-colors hover:bg-vtk-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vtk-ink"
          >
            <Download size={16} aria-hidden="true" />
            {nl ? "PNG downloaden" : "Download PNG"}
          </a>
        </div>
      </Card>
    </div>
  );
}
