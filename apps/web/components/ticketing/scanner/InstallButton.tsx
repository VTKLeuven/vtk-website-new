"use client";

import { useEffect, useState } from "react";
import { Share, Smartphone, X } from "lucide-react";

/**
 * Knop om de scanner op het beginscherm te zetten.
 *
 * Zonder browserbalk heb je meer beeld voor de camera, en de scanner start met
 * één tik in plaats van via een link opzoeken.
 *
 * Drie gevallen, en ze verschillen echt:
 * - **Android/Chrome**: de browser vuurt `beforeinstallprompt`. Dat event vangen
 *   we op en tonen we als een eigen knop; die roept `prompt()` aan. Dat gebeurt
 *   enkel wanneer er ook een service worker met fetch-handler geregistreerd is,
 *   vandaar de registratie hieronder; zonder die stap blijft de knop stil weg.
 * - **iOS/Safari**: `beforeinstallprompt` bestaat daar niet en zal ook nooit
 *   bestaan. Installeren kan enkel via Deel → "Zet op beginscherm", dus daar
 *   tonen we die uitleg in plaats van een knop die niets doet.
 * - **Al geïnstalleerd**: dan draait de pagina in `display-mode: standalone` (of
 *   `navigator.standalone` op iOS) en verdwijnt alles. Precies wat gevraagd was.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "vtk-scanner-install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari op iOS kent de media query niet en zet dit in plaats daarvan.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPad met desktop-user-agent.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Chrome en Firefox op iOS kunnen niet installeren; enkel Safari.
  return iOS && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Uitgesteld, zodat we geen state zetten tijdens het effect zelf.
    const timer = window.setTimeout(() => {
      if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;
      setHidden(false);
      if (isIosSafari()) setShowIosHint(true);

      // In dev niet registreren: de worker cachet de gehashte build-assets, en
      // die wisselen bij elke hot reload. Je zou dan oude chunks blijven zien.
      if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
        void navigator.serviceWorker.register("/sw.js").catch(() => {
          // Geen worker betekent enkel: geen installatieknop op Android. De
          // scanner zelf werkt gewoon door.
        });
      }
    }, 0);

    const onPrompt = (event: Event) => {
      // Chrome toont anders zijn eigen balk; wij willen de knop op onze plaats.
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    // Na het installeren is de knop overbodig.
    const onInstalled = () => setHidden(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* privémodus: dan komt de knop bij een volgend bezoek gewoon terug */
    }
  }

  // Niets te bieden: geen prompt van de browser en geen iOS-instructie.
  if (hidden || (!promptEvent && !showIosHint)) return null;

  return (
    <div className="scanner-install">
      <Smartphone size={18} aria-hidden="true" />
      {promptEvent ? (
        <>
          <span>Zet de scanner op je beginscherm</span>
          <button
            type="button"
            onClick={async () => {
              await promptEvent.prompt();
              const choice = await promptEvent.userChoice;
              setPromptEvent(null);
              if (choice.outcome === "accepted") setHidden(true);
            }}
          >
            Toevoegen
          </button>
        </>
      ) : (
        <span>
          Zet de scanner op je beginscherm: tik op <Share size={14} aria-hidden="true" /> en
          daarna op &ldquo;Zet op beginscherm&rdquo;.
        </span>
      )}
      <button type="button" className="scanner-install-close" onClick={dismiss} aria-label="Niet tonen">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
