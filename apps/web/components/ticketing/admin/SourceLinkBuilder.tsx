"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import {
  CAMPAIGN_PARAM,
  describeSource,
  SHAREABLE_SOURCES,
  SOURCE_PARAM,
  sanitizeSourceKey,
} from "@/lib/ticketing/source";
import type { AdminLocale } from "./format";

const OTHER = "__other";

/**
 * Een deelbare link naar de ticketpagina met de herkomst erin
 * (`?via=facebook&c=story`). Wie via die link koopt, telt in de statistieken
 * onder dat kanaal; zonder zo'n link weet de site enkel wat de browser als
 * referrer meegeeft, en een app als Instagram of WhatsApp geeft meestal niets.
 *
 * Enkel een linkbouwer, geen opgeslagen campagnes: de link draagt alles zelf,
 * dus er is niets om bij te houden of op te ruimen.
 */
export function SourceLinkBuilder({ slug, locale }: { slug: string; locale: AdminLocale }) {
  const nl = locale === "nl";
  const id = useId();
  // Pas in de browser: op de server bestaat er geen origin.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const [channel, setChannel] = useState<string>(SHAREABLE_SOURCES[0]);
  const [custom, setCustom] = useState("");
  const [campaign, setCampaign] = useState("");
  // De link die gekopieerd werd; verandert de link, dan staat er geen vinkje meer.
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const source = channel === OTHER ? sanitizeSourceKey(custom) : channel;
  const campaignKey = sanitizeSourceKey(campaign);
  const params = new URLSearchParams();
  if (source) params.set(SOURCE_PARAM, source);
  if (source && campaignKey) params.set(CAMPAIGN_PARAM, campaignKey);
  const query = params.toString();
  const url = `${origin}${nl ? "" : "/en"}/tickets/${slug}${query ? `?${query}` : ""}`;

  const copied = copiedUrl === url;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
    } catch {
      /* geen klembord: de link staat leesbaar in het veld */
    }
  }

  return (
    <div className="ticket-admin-form">
      <div className="ticket-admin-form-grid">
        <div className="ticket-admin-field">
          <label htmlFor={`${id}-channel`}>{nl ? "Waar deel je de link?" : "Where will you share it?"}</label>
          <select id={`${id}-channel`} value={channel} onChange={(event) => setChannel(event.target.value)}>
            {SHAREABLE_SOURCES.map((key) => (
              <option key={key} value={key}>
                {describeSource(key, locale).label}
              </option>
            ))}
            <option value={OTHER}>{nl ? "Iets anders..." : "Something else..."}</option>
          </select>
        </div>
        {channel === OTHER ? (
          <div className="ticket-admin-field">
            <label htmlFor={`${id}-custom`}>{nl ? "Naam van het kanaal" : "Channel name"}</label>
            <input
              id={`${id}-custom`}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder={nl ? "bv. flyer-agora" : "e.g. flyer-agora"}
              maxLength={40}
            />
          </div>
        ) : null}
        <div className="ticket-admin-field">
          <label htmlFor={`${id}-campaign`}>{nl ? "Campagne (optioneel)" : "Campaign (optional)"}</label>
          <input
            id={`${id}-campaign`}
            value={campaign}
            onChange={(event) => setCampaign(event.target.value)}
            placeholder={nl ? "bv. story of affiche-cw" : "e.g. story or poster-cw"}
            maxLength={40}
          />
          <span className="ticket-admin-help">
            {nl
              ? "Om twee posts op hetzelfde kanaal uit elkaar te houden."
              : "To tell two posts on the same channel apart."}
          </span>
        </div>
      </div>
      <div className="ticket-admin-field">
        <label htmlFor={`${id}-url`}>{nl ? "Link" : "Link"}</label>
        <div className="ticket-stats-link-row">
          <input id={`${id}-url`} readOnly value={url} onFocus={(event) => event.target.select()} />
          <button type="button" className="ticket-admin-button" onClick={copy} disabled={!origin}>
            {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
            {copied ? (nl ? "Gekopieerd" : "Copied") : nl ? "Kopiëren" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
