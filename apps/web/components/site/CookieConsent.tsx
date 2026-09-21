"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  COOKIE_CONSENT_NAME,
  OPEN_COOKIE_PREFERENCES_EVENT,
  browserCookieConsent,
  hidesCookieBanner,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";

function copy() {
  const english = window.location.pathname === "/en" || window.location.pathname.startsWith("/en/");
  return english
    ? {
        title: "Your cookie choices",
        body: "VTK uses essential cookies for sign-in, security, language and ticket access. With your permission we also count page views with Umami, which runs on VTK's own server and sets no cookies, and Sentry may collect error diagnostics, performance traces and masked session replays.",
        privacy: "Read the cookie policy",
        accept: "Allow statistics and diagnostics",
        reject: "Essential only",
        save: "Save choice",
        analytics: "Optional: cookieless visitor statistics and technical diagnostics",
      }
    : {
        title: "Jouw cookiekeuze",
        body: "VTK gebruikt noodzakelijke cookies voor aanmelden, beveiliging, taal en tickettoegang. Met jouw toestemming tellen we ook paginaweergaves met Umami, dat op onze eigen server draait en geen cookies plaatst, en mag Sentry technische monitoringgegevens verzamelen: browserfouten, prestatiemetingen en gemaskeerde sessieopnames.",
        privacy: "Lees het cookiebeleid",
        accept: "Statistieken en monitoring toestaan",
        reject: "Enkel noodzakelijk",
        save: "Keuze opslaan",
        analytics: "Optioneel: bezoekersstatistieken zonder cookies en technische monitoring",
      };
}

/** Zie het effect in `CookieConsent`; vtk-base.css leest deze variabele. */
const COOKIE_CONSENT_SPACE_VAR = "--vtk-cookie-consent-space";

function setConsent(choice: CookieConsentChoice) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_CONSENT_NAME}=${choice}; Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: choice }));
}

export function CookieConsent() {
  // Bewust het pad uit de router en niet uit de root-layout: die layout wordt
  // bij een client-side navigatie niet opnieuw gerenderd, dus een server-side
  // controle zou de banner op de linkpagina alsnog laten staan wanneer je er
  // vanaf een andere pagina naartoe navigeert.
  const pathname = usePathname();
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
  const panelRef = useRef<HTMLElement>(null);
  const visible =
    !hidesCookieBanner(pathname) && current !== "server" && (preferencesOpen || current === null);

  useEffect(() => {
    const showPreferences = () => {
      setDraft(browserCookieConsent() ?? "essential");
      setPreferencesOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, showPreferences);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, showPreferences);
  }, []);

  // Hoeveel van de onderkant van het scherm de banner inneemt, als variabele op
  // <html>. De aankondiging (AnnouncementCard) staat rechtsonder en schuift
  // daarmee boven de banner in plaats van eronder te verdwijnen; bij een eerste
  // bezoek staan ze precies samen open. Gemeten en niet vast: de hoogte hangt af
  // van de taal en de breedte, want de tekst loopt over meer of minder regels.
  useEffect(() => {
    const panel = panelRef.current;
    if (!visible || !panel) return;
    const root = document.documentElement;
    const publish = () => {
      const space = Math.max(0, window.innerHeight - panel.getBoundingClientRect().top);
      root.style.setProperty(COOKIE_CONSENT_SPACE_VAR, `${Math.round(space)}px`);
    };
    const observer = new ResizeObserver(publish);
    observer.observe(panel);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty(COOKIE_CONSENT_SPACE_VAR);
    };
  }, [visible]);

  if (!visible) return null;
  const labels = copy();
  const base = window.location.pathname === "/en" || window.location.pathname.startsWith("/en/") ? "/en" : "";

  const save = (next: CookieConsentChoice) => {
    setConsent(next);
    setPreferencesOpen(false);
    // instrumentation-client runs before hydration and the analytics script is
    // rendered server-side. Reload so a newly granted choice can start Sentry
    // and Umami, or a withdrawn choice stops both immediately.
    window.location.reload();
  };

  return (
    <div className="vtk-cookie-consent-positioner">
      <section
        ref={panelRef}
        className="vtk-cookie-consent"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vtk-cookie-title"
      >
        <div className="vtk-cookie-consent-copy">
          <h2 id="vtk-cookie-title">{labels.title}</h2>
          <p>
            {labels.body}{" "}
            <a href={`${base}/cookies`}>{labels.privacy}</a>
          </p>
        </div>
        <div className="vtk-cookie-consent-controls">
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
