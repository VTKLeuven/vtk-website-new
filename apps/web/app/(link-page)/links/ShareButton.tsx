"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const data = { title, url: window.location.href };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Oude ingebouwde browsers zonder Web Share of Clipboard kunnen de URL
      // nog altijd uit hun adresbalk kopiëren; de knop blijft verder bruikbaar.
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <button
        type="button"
        onClick={share}
        className="vtk-link-page-share pointer-events-auto"
        data-umami-event="linkpagina-gedeeld"
        aria-label="Deze pagina delen"
        title={copied ? "Link gekopieerd" : "Delen"}
      >
        {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Link gekopieerd" : ""}
      </span>
    </div>
  );
}
