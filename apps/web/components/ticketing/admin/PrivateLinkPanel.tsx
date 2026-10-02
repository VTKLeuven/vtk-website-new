"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, Globe, Info, Lock, RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import {
  makeTicketEventPrivateAction,
  makeTicketEventPublicAction,
  renewPrivateLinkAction,
} from "@/app/actions/tickets";
import { privateLinkPath } from "@/lib/ticketing/shopPath";
import type { SaveState } from "@/lib/saveState";
import type { AdminLocale } from "./format";

type Pending = "private" | "public" | "renew";

const T = {
  nl: {
    introPublic:
      "Dit event is openbaar: het staat op /tickets, bij het kalenderevent, in het nieuws en in de app.",
    introPublicWerkgroep:
      "Dit event is openbaar: het staat op /tickets, bij het kalenderevent en in de app. In het nieuws op de homepage staat een verkoop van een werkgroep enkel wanneer de redactie het erin zet.",
    introPrivate:
      "Dit event is privé: het staat nergens op de site en /tickets/{slug} geeft een 404. Enkel wie de link hieronder opent, kan het zien en tickets bestellen.",
    makePrivate: "Privé maken",
    makePublic: "Openbaar maken",
    renew: "Link vernieuwen",
    label: "Privélink",
    copy: "Link kopiëren",
    copied: "Gekopieerd",
    warn:
      "Iedereen die deze link doorkrijgt, kan bestellen. Werd hij te breed gedeeld, vernieuw hem dan.",
    draft: "Het event staat nog in concept: de link werkt pas na publiceren.",
    presale:
      "De private voorverkooplink opent de pagina ook, zodat wie vroeger mag kopen geen tweede link nodig heeft.",
    privateTitle: "Dit event privé maken?",
    privateBody:
      "Het event verdwijnt van /tickets, uit de kalender, het nieuws en de app. Wie het adres /tickets/{slug} al had, krijgt een 404; enkel de privélink werkt nog. Bestellingen en tickets die er al zijn, blijven geldig.",
    publicTitle: "Dit event openbaar maken?",
    publicBody:
      "Het event komt voor iedereen op /tickets, bij het kalenderevent, in het nieuws en in de app. De privélink blijft werken en leidt naar dezelfde pagina.",
    publicBodyWerkgroep:
      "Het event komt voor iedereen op /tickets, bij het kalenderevent en in de app; in het nieuws enkel wanneer de redactie het erin zet. De privélink blijft werken en leidt naar dezelfde pagina.",
    renewTitle: "Privélink vernieuwen?",
    renewBody:
      "De huidige link werkt meteen niet meer, ook niet voor wie hem al opende; stuur de nieuwe link opnieuw naar de groep. Wie al besteld heeft, houdt zijn tickets.",
    cancel: "Annuleren",
    madePrivate: "Het event is nu privé. Kopieer de link en deel ze met de groep.",
    madePublic: "Het event is terug openbaar.",
    renewed: "Nieuwe link aangemaakt; de oude werkt niet meer.",
    failed: "Dat is niet gelukt. Probeer het opnieuw.",
  },
  en: {
    introPublic:
      "This event is public: it is listed on /tickets, with the calendar event, in the news and in the app.",
    introPublicWerkgroep:
      "This event is public: it is listed on /tickets, with the calendar event and in the app. A sale by a werkgroep is only in the news on the homepage when the editors put it there.",
    introPrivate:
      "This event is private: it is not listed anywhere on the site and /tickets/{slug} returns a 404. Only people who open the link below can see it and order tickets.",
    makePrivate: "Make private",
    makePublic: "Make public",
    renew: "Renew link",
    label: "Private link",
    copy: "Copy link",
    copied: "Copied",
    warn: "Anyone who receives this link can order. If it was shared too widely, renew it.",
    draft: "The event is still a draft: the link only works once it is published.",
    presale:
      "The private presale link opens the page too, so people who may buy early do not need a second link.",
    privateTitle: "Make this event private?",
    privateBody:
      "The event disappears from /tickets, the calendar, the news and the app. Anyone who already had the address /tickets/{slug} gets a 404; only the private link still works. Existing orders and tickets stay valid.",
    publicTitle: "Make this event public?",
    publicBody:
      "The event appears for everyone on /tickets, with the calendar event, in the news and in the app. The private link keeps working and leads to the same page.",
    publicBodyWerkgroep:
      "The event appears for everyone on /tickets, with the calendar event and in the app; in the news only when the editors put it there. The private link keeps working and leads to the same page.",
    renewTitle: "Renew the private link?",
    renewBody:
      "The current link stops working immediately, also for people who already opened it; send the new link to the group again. Anyone who already ordered keeps their tickets.",
    cancel: "Cancel",
    madePrivate: "The event is now private. Copy the link and share it with the group.",
    madePublic: "The event is public again.",
    renewed: "New link created; the old one no longer works.",
    failed: "That did not work. Please try again.",
  },
} as const;

/**
 * Openbaar of privé, en de privélink zelf.
 *
 * Een eigen paneel en geen vinkje in het instellingenformulier: privé zetten
 * haalt een live event meteen overal weg, en dat hoort een eigen beslissing met
 * een eigen bevestiging te zijn, niet iets dat pas bij "Wijzigingen opslaan"
 * meegaat. Zelfde reden als de voorverkooplink ernaast.
 *
 * Het vinkje blijft na het kopiëren in de knop staan (en niet enkel in een
 * tooltip): dat is het enige dat zegt dat er iets gebeurd is.
 */
export function PrivateLinkPanel({
  eventId,
  slug,
  isPrivate,
  token,
  isDraft,
  hasPresaleLink,
  werkgroepSale,
  locale,
}: {
  eventId: string;
  slug: string;
  isPrivate: boolean;
  token: string | null;
  isDraft: boolean;
  hasPresaleLink: boolean;
  /**
   * Het event is van een werkgroep: dan staat het standaard niet in het nieuws
   * op de homepage (zie `ticketNeedsNewsOptIn`), en mag dit paneel dat niet
   * beloven.
   */
  werkgroepSale: boolean;
  locale: AdminLocale;
}) {
  const t = T[locale];
  const base = locale === "nl" ? "" : "/en";
  const showToast = useToast();
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Pas in de browser: op de server bestaat er geen origin, en een link die bij
  // het hydrateren van vorm verandert, geeft een mismatch.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const url = isPrivate && token ? `${origin}${base}${privateLinkPath(slug, token)}` : null;
  const withSlug = (text: string) => text.replace("{slug}", slug);

  const actions: Record<Pending, (formData: FormData) => Promise<SaveState>> = {
    private: makeTicketEventPrivateAction,
    public: makeTicketEventPublicAction,
    renew: renewPrivateLinkAction,
  };
  const successMessages: Record<Pending, string> = {
    private: t.madePrivate,
    public: t.madePublic,
    renew: t.renewed,
  };

  function run(kind: Pending) {
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("locale", locale);
    startTransition(async () => {
      try {
        const result = await actions[kind](form);
        setConfirming(null);
        if (result.status === "error") throw new Error(result.code);
        setCopiedUrl(null);
        showToast({ message: successMessages[kind], variant: "success" });
      } catch {
        setConfirming(null);
        showToast({ message: t.failed, variant: "error", duration: 0 });
      }
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
    } catch {
      /* geen klembord: de link staat leesbaar in het veld */
    }
  }

  const dialog =
    confirming === "private"
      ? { title: t.privateTitle, body: withSlug(t.privateBody), confirm: t.makePrivate }
      : confirming === "public"
        ? {
            title: t.publicTitle,
            body: werkgroepSale ? t.publicBodyWerkgroep : t.publicBody,
            confirm: t.makePublic,
          }
        : { title: t.renewTitle, body: t.renewBody, confirm: t.renew };

  return (
    <div className="ticket-admin-form">
      <p className="ticket-admin-help">{isPrivate
          ? withSlug(t.introPrivate)
          : werkgroepSale
            ? t.introPublicWerkgroep
            : t.introPublic}</p>
      {url ? (
        <>
          <div className="ticket-admin-field">
            <label htmlFor="private-link">{t.label}</label>
            <input id="private-link" readOnly value={url} onFocus={(e) => e.target.select()} />
            <span className="ticket-admin-help">{t.warn}</span>
          </div>
          {isDraft || hasPresaleLink ? (
            <div className="ticket-admin-alert" data-tone="info">
              <Info aria-hidden="true" size={16} />
              <span>
                {isDraft ? t.draft : null}
                {isDraft && hasPresaleLink ? " " : null}
                {hasPresaleLink ? t.presale : null}
              </span>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="ticket-admin-actions">
        {url ? (
          <>
            <button type="button" className="ticket-admin-button" data-variant="primary" onClick={copy}>
              {copiedUrl === url ? (
                <Check aria-hidden="true" size={16} />
              ) : (
                <Copy aria-hidden="true" size={16} />
              )}
              {copiedUrl === url ? t.copied : t.copy}
            </button>
            <button
              type="button"
              className="ticket-admin-button"
              disabled={pending}
              onClick={() => setConfirming("renew")}
            >
              <RefreshCw aria-hidden="true" size={16} />
              {t.renew}
            </button>
            <button
              type="button"
              className="ticket-admin-button"
              disabled={pending}
              onClick={() => setConfirming("public")}
            >
              <Globe aria-hidden="true" size={16} />
              {t.makePublic}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ticket-admin-button"
            disabled={pending}
            onClick={() => setConfirming("private")}
          >
            <Lock aria-hidden="true" size={16} />
            {t.makePrivate}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={dialog.title}
        description={dialog.body}
        confirmLabel={dialog.confirm}
        cancelLabel={t.cancel}
        // Enkel vernieuwen neemt iets terug (de gedeelde link); privé of openbaar
        // zetten is met één klik terug te draaien en hoort geen rode knop.
        destructive={confirming === "renew"}
        pending={pending}
        onConfirm={() => confirming && run(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
