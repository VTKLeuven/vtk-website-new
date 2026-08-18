"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { trackCalendarFeedCopy } from "@/lib/analytics-client";

/**
 * Abonneerblok bij een kalender. Bewust abonneren en niet downloaden: een
 * gedownload .ics is een momentopname die nooit meer bijwerkt, terwijl een
 * abonnement elke wijziging vanzelf oppikt.
 *
 * Drie ingangen, omdat er geen enkele link is die overal werkt:
 * - `webcal:` opent de standaard agenda-app (Apple Calendar, Outlook desktop);
 * - Google Calendar heeft een eigen "toevoegen via URL"-scherm;
 * - de gekopieerde link dekt de rest (Outlook web, Thunderbird, ...).
 */
export function CalendarSubscribe({
  feedUrl,
  locale,
  labels,
}: {
  /** Absolute URL van de ICS-feed, inclusief protocol. */
  feedUrl: string;
  locale: "nl" | "en";
  labels: { title: string; sub: string };
}) {
  const nl = locale === "nl";
  const [copied, setCopied] = useState(false);

  // Het vinkje mag niet blijven staan: na een paar seconden is de knop weer een
  // gewone kopieerknop.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      trackCalendarFeedCopy();
    } catch {
      // Clipboard geweigerd (geen https, of de gebruiker blokkeert het): dan
      // selecteert hij de link zelf maar, geen reden om iets te laten crashen.
    }
  }

  return (
    <div className="subscribe-box">
      <h3>{labels.title}</h3>
      <div className="sub">{labels.sub}</div>
      <div className="subscribe-actions">
        <a className="btn btn-ghost arrow" href={webcalUrl}>
          {nl ? "Agenda-app" : "Calendar app"}
        </a>
        <a className="btn btn-ghost arrow" href={googleUrl} target="_blank" rel="noreferrer">
          Google Calendar
        </a>
        <button
          type="button"
          className="btn btn-ghost subscribe-copy"
          onClick={copy}
          title={copied ? (nl ? "Gekopieerd" : "Copied") : nl ? "Kopieer feed-link" : "Copy feed link"}
          aria-label={
            copied
              ? nl
                ? "Feed-link gekopieerd"
                : "Feed link copied"
              : nl
                ? "Kopieer feed-link"
                : "Copy feed link"
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? (nl ? "Gekopieerd" : "Copied") : nl ? "Kopieer link" : "Copy link"}</span>
        </button>
      </div>
    </div>
  );
}
