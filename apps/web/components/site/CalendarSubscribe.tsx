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
  const [copied, setCopied] = useState<"link" | "google" | null>(null);

  // Het vinkje mag niet blijven staan: na een paar seconden is de knop weer een
  // gewone kopieerknop.
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 3500);
    return () => clearTimeout(timer);
  }, [copied]);

  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");
  // Google ondersteunt "Via URL" officieel, maar niet een stabiele deeplink die
  // een externe ICS-feed vooraf invult. Open daarom precies dat instellingenscherm
  // en kopieer de URL bij de klik, in plaats van de foutgevoelige `?cid=`-route.
  const googleUrl = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

  async function copy(kind: "link" | "google" = "link") {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(kind);
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
        <a
          className="btn btn-ghost arrow"
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => void copy("google")}
        >
          {copied === "google"
            ? nl
              ? "Link gekopieerd — plak in Google"
              : "Link copied — paste in Google"
            : "Google Calendar"}
        </a>
        <button
          type="button"
          className="btn btn-ghost subscribe-copy"
          onClick={() => void copy("link")}
          title={
            copied === "link"
              ? nl
                ? "Gekopieerd"
                : "Copied"
              : nl
                ? "Kopieer feed-link"
                : "Copy feed link"
          }
          aria-label={
            copied === "link"
              ? nl
                ? "Feed-link gekopieerd"
                : "Feed link copied"
              : nl
                ? "Kopieer feed-link"
                : "Copy feed link"
          }
        >
          {copied === "link" ? <CheckIcon /> : <CopyIcon />}
          <span>
            {copied === "link" ? (nl ? "Gekopieerd" : "Copied") : nl ? "Kopieer link" : "Copy link"}
          </span>
        </button>
      </div>
      <p className="subscribe-hint">
        {nl
          ? "Google opent ‘Via URL’. Plak daar de feed-link die bij je klik wordt gekopieerd."
          : "Google opens ‘From URL’. Paste the feed link copied when you click."}
      </p>
    </div>
  );
}
