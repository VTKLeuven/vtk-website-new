"use client";

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@vtk/i18n";
import { Modal } from "@/app/[locale]/admin/admin-table";
import { CalendarPlusIcon, CheckIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

/**
 * Abonneerknop en dialoog voor de Theokot-verhuurkalender.
 *
 * Werkt net zoals CalendarSubscribe op /kalender: genereert een webcal-link en
 * een Google Calendar deeplink voor de live iCalendar-feed, zodat
 * zaalverantwoordelijken nieuwe aanvragen direct in hun agenda-app ontvangen.
 */
export function RentalCalendarSubscribe({
  feedBaseUrl,
  locale,
  compact = false,
}: {
  /** Basis-URL naar de feed, bijv. https://vtk.be/api/theokot/verhuur/feed/TOKEN.ics */
  feedBaseUrl: string;
  locale: Locale;
  compact?: boolean;
}) {
  const nl = locale === "nl";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "approved">("all");
  const [copied, setCopied] = useState<"link" | "google" | null>(null);
  const showToast = useToast();

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 3500);
    return () => clearTimeout(timer);
  }, [copied]);

  const feedUrl = useMemo(() => {
    const url = new URL(feedBaseUrl);
    if (locale === "en") url.searchParams.set("lang", "en");
    else url.searchParams.delete("lang");

    if (mode === "approved") url.searchParams.set("status", "approved");
    else url.searchParams.delete("status");

    return url.toString();
  }, [feedBaseUrl, mode, locale]);

  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");
  const googleUrl = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

  async function copy(kind: "link" | "google" = "link") {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(kind);
      showToast({
        message: nl ? "Abonnementslink gekopieerd." : "Subscription link copied.",
        variant: "success",
      });
    } catch {
      // Clipboard geweigerd
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-semibold text-vtk-ink hover:bg-vtk-blue-soft/60 transition-colors"
            : "inline-flex items-center gap-1.5 rounded-full border border-vtk-blue/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-vtk-ink shadow-xs hover:bg-vtk-blue-soft/60 transition-colors"
        }
        title={nl ? "Abonneren op kalender" : "Subscribe to calendar"}
      >
        <CalendarPlusIcon />
        <span>{nl ? "Abonneren" : "Subscribe"}</span>
      </button>

      {open && (
        <Modal
          title={nl ? "Abonneren op de verhuurkalender" : "Subscribe to the rental calendar"}
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4 text-sm text-[#34405e]">
            <p>
              {nl
                ? "Zet de verhuurkalender in je eigen kalender-app (Apple Calendar, Google Calendar, Outlook). Nieuwe aanvragen en statuswijzigingen komen er automatisch in."
                : "Add the rental calendar to your own calendar app (Apple Calendar, Google Calendar, Outlook). New requests and status updates will appear automatically."}
            </p>

            <div className="space-y-2">
              <label
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                  mode === "all"
                    ? "border-vtk-ink bg-vtk-blue-soft/40"
                    : "border-vtk-blue/15 hover:bg-vtk-blue-soft/20"
                }`}
              >
                <input
                  type="radio"
                  name="rental-feed-mode"
                  value="all"
                  checked={mode === "all"}
                  onChange={() => setMode("all")}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-vtk-ink">
                    {nl
                      ? "Alle aanvragen (inclusief nieuwe)"
                      : "All requests (including new ones)"}
                  </div>
                  <div className="text-xs text-[#5c667f]">
                    {nl
                      ? "Nieuwe aanvragen verschijnen direct in je agenda als [Aanvraag], ook wanneer ze nog wachten op goedkeuring."
                      : "New requests appear immediately in your calendar as [Request], even while awaiting approval."}
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                  mode === "approved"
                    ? "border-vtk-ink bg-vtk-blue-soft/40"
                    : "border-vtk-blue/15 hover:bg-vtk-blue-soft/20"
                }`}
              >
                <input
                  type="radio"
                  name="rental-feed-mode"
                  value="approved"
                  checked={mode === "approved"}
                  onChange={() => setMode("approved")}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-vtk-ink">
                    {nl ? "Enkel goedgekeurde verhuren" : "Only approved rentals"}
                  </div>
                  <div className="text-xs text-[#5c667f]">
                    {nl
                      ? "Enkel verhuren die al goedgekeurd zijn. Geen wachtende aanvragen."
                      : "Only rentals that have already been approved. No pending requests."}
                  </div>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={webcalUrl}
                className="inline-flex items-center gap-2 rounded-full border border-vtk-ink bg-vtk-ink px-4 py-2 text-xs font-semibold text-white hover:bg-vtk-navy transition-colors"
              >
                {nl ? "Agenda-app (Apple / Outlook)" : "Calendar app (Apple / Outlook)"}
              </a>
              <a
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => void copy("google")}
                className="inline-flex items-center gap-2 rounded-full border border-vtk-blue/20 bg-white px-4 py-2 text-xs font-semibold text-vtk-ink hover:bg-vtk-blue-soft/60 transition-colors"
              >
                {copied === "google"
                  ? nl
                    ? "Link gekopieerd. Plak in Google"
                    : "Link copied. Paste in Google"
                  : "Google Calendar"}
              </a>
              <button
                type="button"
                onClick={() => void copy("link")}
                className="inline-flex items-center gap-2 rounded-full border border-vtk-blue/20 bg-white px-4 py-2 text-xs font-semibold text-vtk-ink hover:bg-vtk-blue-soft/60 transition-colors"
              >
                {copied === "link" ? <CheckIcon /> : <CopyIcon />}
                <span>
                  {copied === "link"
                    ? nl
                      ? "Gekopieerd"
                      : "Copied"
                    : nl
                      ? "Kopieer link"
                      : "Copy link"}
                </span>
              </button>
            </div>

            <div className="pt-2">
              <label
                htmlFor="tv-feed-url-input"
                className="block text-xs font-medium text-[#5c667f] mb-1"
              >
                {nl
                  ? "Of kopieer de abonnementslink handmatig:"
                  : "Or copy the subscription link manually:"}
              </label>
              <input
                id="tv-feed-url-input"
                type="text"
                readOnly
                value={feedUrl}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-lg border border-vtk-blue/20 bg-slate-50 px-3 py-1.5 text-xs text-[#34405e] font-mono select-all"
              />
            </div>

            <p className="text-xs text-[#5c667f] border-t border-vtk-blue/10 pt-3">
              {nl
                ? "💡 Tip: Bij Google Calendar opent de knop het scherm ‘Via URL toevoegen’. Plak daar de link die automatisch naar je klembord is gekopieerd."
                : "💡 Tip: For Google Calendar, the button opens ‘From URL’. Paste the link automatically copied to your clipboard."}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
