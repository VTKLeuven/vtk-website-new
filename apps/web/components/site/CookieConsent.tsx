"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  COOKIE_CONSENT_NAME,
  OPEN_COOKIE_PREFERENCES_EVENT,
  browserCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";

function copy() {
  const english = window.location.pathname === "/en" || window.location.pathname.startsWith("/en/");
  return english
    ? {
        title: "Your cookie choices",
        body: "VTK uses essential cookies for sign-in, security, language and ticket access. With your permission, Sentry may also collect error diagnostics, performance traces and masked session replays.",
        privacy: "Read the cookie policy",
        accept: "Allow diagnostics",
        reject: "Essential only",
        save: "Save choice",
        analytics: "Optional diagnostics and masked session replay",
      }
    : {
        title: "Jouw cookiekeuze",
        body: "VTK gebruikt noodzakelijke cookies voor aanmelden, beveiliging, taal en tickettoegang. Met jouw toestemming mag Sentry ook technische monitoringgegevens verzamelen: browser errors, performance traces and masked session replays.",
        privacy: "Lees het cookiebeleid",
        accept: "Optionele cookies toestaan",
        reject: "Enkel noodzakelijk",
        save: "Keuze opslaan",
        analytics: "Optional monitoring: browser errors, performance traces and masked session replays",
      };
}

function setConsent(choice: CookieConsentChoice) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_CONSENT_NAME}=${choice}; Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: choice }));
}

export function CookieConsent() {
  const current = useSyncExternalStore<CookieConsentChoice | null | "server">(
    (onChange) => {
      window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
      return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
    },
    browserCookieConsent,
    () => "server",
  );
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [draft, setDraft] = useState<CookieConsentChoice>("essential");

  useEffect(() => {
    const showPreferences = () => {
      setDraft(browserCookieConsent() ?? "essential");
      setPreferencesOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, showPreferences);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, showPreferences);
  }, []);

  if (current === "server" || (!preferencesOpen && current !== null)) return null;
  const labels = copy();
  const base = window.location.pathname === "/en" || window.location.pathname.startsWith("/en/") ? "/en" : "";

  const save = (next: CookieConsentChoice) => {
    setConsent(next);
    setPreferencesOpen(false);
    // instrumentation-client runs before hydration. Reload so a newly granted
    // choice can initialize Sentry, or a withdrawn choice stops it immediately.
    window.location.reload();
  };

  return (
    <div className="vtk-cookie-consent-positioner">
      <section className="vtk-cookie-consent" role="dialog" aria-modal="true" aria-labelledby="vtk-cookie-title">
        <div className="vtk-cookie-consent-copy">
          <h2 id="vtk-cookie-title">{labels.title}</h2>
          <p>{labels.body}</p>
          <a href={`${base}/cookies`}>{labels.privacy}</a>
        </div>
        <label className="vtk-cookie-consent-option">
          <input
            type="checkbox"
            checked={draft === "analytics"}
            onChange={(event) => setDraft(event.target.checked ? "analytics" : "essential")}
          />
          <span>{labels.analytics}</span>
        </label>
        <div className="vtk-cookie-consent-actions">
          <button type="button" className="vtk-cookie-secondary" onClick={() => save("essential")}>
            {labels.reject}
          </button>
          <button type="button" className="vtk-cookie-secondary" onClick={() => save(draft)}>
            {labels.save}
          </button>
          <button type="button" className="vtk-cookie-primary" onClick={() => save("analytics")}>
            {labels.accept}
          </button>
        </div>
      </section>
    </div>
  );
}

export function CookieSettingsButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="vtk-cookie-settings-button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT))}
    >
      {children}
    </button>
  );
}
