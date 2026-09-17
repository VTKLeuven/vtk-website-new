"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, TriangleAlert } from "lucide-react";
import { ConfirmDialog } from "@vtk/ui";
import { createPresaleLinkAction, revokePresaleLinkAction } from "@/app/actions/tickets";
import type { AdminLocale } from "./format";

const T = {
  nl: {
    title: "Private voorverkooplink",
    intro:
      "Wie deze link opent, koopt mee tijdens de voorverkoop, ook zonder post en zonder shiften. Voor een groep die je niet in een post kan vatten: de band, de sponsors, de ouders van.",
    needsPresale:
      "Zet eerst een voorverkoop aan hierboven; zonder voorverkoop valt er niets vroeger open te zetten.",
    create: "Link aanmaken",
    renew: "Vernieuwen",
    revoke: "Intrekken",
    copy: "Link kopiëren",
    copied: "Gekopieerd",
    none: "Er staat nog geen link klaar.",
    warn: "Deel hem enkel met wie vroeger mag kopen: iedereen die de link doorkrijgt, kan hem gebruiken.",
    renewTitle: "Link vernieuwen?",
    renewBody:
      "De huidige link werkt daarna niet meer, ook niet voor wie hem al gebruikte. Er komt een nieuwe link in de plaats.",
    revokeTitle: "Link intrekken?",
    revokeBody:
      "De link werkt daarna niet meer en er komt geen nieuwe in de plaats. Wie al besteld heeft, houdt zijn tickets.",
    confirm: "Doorgaan",
    cancel: "Annuleren",
  },
  en: {
    title: "Private presale link",
    intro:
      "Whoever opens this link buys during the presale, without a post and without shifts. For a group you cannot capture in a post: the band, the sponsors, the parents.",
    needsPresale: "Turn on a presale above first; without one there is nothing to open earlier.",
    create: "Create link",
    renew: "Renew",
    revoke: "Revoke",
    copy: "Copy link",
    copied: "Copied",
    none: "No link yet.",
    warn: "Only share it with people who may buy early: anyone who receives it can use it.",
    renewTitle: "Renew the link?",
    renewBody:
      "The current link stops working, also for people who already used it. A new link takes its place.",
    revokeTitle: "Revoke the link?",
    revokeBody:
      "The link stops working and no new one takes its place. Anyone who already ordered keeps their tickets.",
    confirm: "Continue",
    cancel: "Cancel",
  },
} as const;

/**
 * De private voorverkooplink van een event: aanmaken, kopiëren, vernieuwen en
 * intrekken.
 *
 * Staat naast het instellingenformulier en niet erin: het zijn eigen acties met
 * een eigen bevestiging, en een formulier in een formulier bestaat niet in HTML.
 *
 * Het vinkje blijft na het kopiëren in de knop staan (en niet enkel in een
 * tooltip), want dat is het enige dat zegt dat er iets gebeurd is.
 */
export function PresaleLinkPanel({
  eventId,
  slug,
  token,
  hasPresale,
  locale,
}: {
  eventId: string;
  slug: string;
  token: string | null;
  hasPresale: boolean;
  locale: AdminLocale;
}) {
  const t = T[locale];
  const base = locale === "nl" ? "" : "/en";
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<"renew" | "revoke" | null>(null);
  const [pending, startTransition] = useTransition();

  const url = token
    ? `${typeof window === "undefined" ? "" : window.location.origin}${base}/tickets/${slug}/voorverkoop/${token}`
    : null;

  function run(action: (formData: FormData) => Promise<void>) {
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("locale", locale);
    startTransition(async () => {
      await action(form);
      setConfirming(null);
      setCopied(false);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* geen klembord: de link staat leesbaar op het scherm */
    }
  }

  if (!hasPresale) {
    return (
      <div className="ticket-admin-alert">
        <TriangleAlert aria-hidden="true" size={16} />
        <span>{t.needsPresale}</span>
      </div>
    );
  }

  return (
    <div className="ticket-admin-form">
      <p className="ticket-admin-help">{t.intro}</p>
      {token && url ? (
        <>
          <div className="ticket-admin-field">
            <label htmlFor="presale-link">{t.title}</label>
            <input id="presale-link" readOnly value={url} onFocus={(e) => e.target.select()} />
            <span className="ticket-admin-help">{t.warn}</span>
          </div>
          <div className="ticket-admin-actions">
            <button type="button" className="ticket-admin-button" onClick={copy}>
              {copied ? (
                <Check aria-hidden="true" size={16} />
              ) : (
                <Copy aria-hidden="true" size={16} />
              )}
              {copied ? t.copied : t.copy}
            </button>
            <button
              type="button"
              className="ticket-admin-button"
              disabled={pending}
              onClick={() => setConfirming("renew")}
            >
              {t.renew}
            </button>
            <button
              type="button"
              className="ticket-admin-button"
              data-variant="danger"
              disabled={pending}
              onClick={() => setConfirming("revoke")}
            >
              {t.revoke}
            </button>
          </div>
        </>
      ) : (
        <div className="ticket-admin-actions">
          <span className="ticket-admin-help">{t.none}</span>
          <button
            type="button"
            className="ticket-admin-button"
            data-variant="primary"
            disabled={pending}
            onClick={() => run(createPresaleLinkAction)}
          >
            <Link2 aria-hidden="true" size={16} />
            {t.create}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "revoke" ? t.revokeTitle : t.renewTitle}
        description={confirming === "revoke" ? t.revokeBody : t.renewBody}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        pending={pending}
        onConfirm={() =>
          run(confirming === "revoke" ? revokePresaleLinkAction : createPresaleLinkAction)
        }
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
