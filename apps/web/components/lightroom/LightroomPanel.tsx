"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { getLightroomStatusAction, startLightroomAction, stopLightroomAction } from "@/app/actions/lightroom";
import type { LightroomError, LightroomResult } from "@/lib/lightroom";
import { lightroomPollMs, lightroomView } from "@/lib/lightroom-view";
import { LightroomCard, type LightroomLocale } from "./LightroomCard";

const T = {
  nl: {
    not_configured: "De koppeling met kenny is nog niet ingesteld (Admin -> IT -> Lightroom PC).",
    unreachable: "Kan kenny niet bereiken. Staat kenny aan en op het tailnet? Deze pagina probeert het vanzelf opnieuw.",
    unauthorized: "Kenny weigert het token van de site. IT moet het nakijken onder Admin -> IT -> Lightroom PC.",
    kenny_error: "Kenny gaf een fout terug. Deze pagina probeert het vanzelf opnieuw.",
    refused: "De Lightroom-pc kan nu niet starten.",
    started: "De Lightroom-pc start op.",
    stopped: "De Lightroom-pc gaat in slaapstand.",
    generic: "Er ging iets mis. Probeer het opnieuw.",
  },
  en: {
    not_configured: "The link with kenny is not set up yet (Admin -> IT -> Lightroom PC).",
    unreachable: "Cannot reach kenny. Is kenny on and on the tailnet? This page keeps trying.",
    unauthorized: "Kenny refuses the site's token. IT has to check it under Admin -> IT -> Lightroom PC.",
    kenny_error: "Kenny returned an error. This page keeps trying.",
    refused: "The Lightroom PC cannot start now.",
    started: "The Lightroom PC is starting.",
    stopped: "The Lightroom PC is going to sleep.",
    generic: "Something went wrong. Try again.",
  },
} as const satisfies Record<LightroomLocale, Record<LightroomError | "started" | "stopped" | "generic", string>>;

/** Zonder antwoord van kenny vragen we het om de halve minuut opnieuw. */
const RETRY_MS = 30_000;

/**
 * De Lightroom-pc op /admin/lightroom: vraagt kenny hoe hij ervoor staat, snel
 * terwijl hij opstart of in slaapstand gaat en traag als hij stilstaat, en niet
 * terwijl het tabblad verborgen is.
 */
export function LightroomPanel({ locale, initial }: { locale: LightroomLocale; initial: LightroomResult }) {
  const t = T[locale];
  const showToast = useToast();
  const [result, setResult] = useState<LightroomResult>(initial);
  const [pending, setPending] = useState<"start" | "stop" | null>(null);
  const [, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState<number | null>(null);

  // Ook een geweigerde start draagt de status mee: daarin staat waarom.
  const view = result.status ? lightroomView(result.status) : null;
  const delay = view ? lightroomPollMs(view) : RETRY_MS;

  // Opnieuw vragen: na `delay`, en meteen wanneer het tabblad terug zichtbaar wordt.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      const next = await getLightroomStatusAction().catch(() => null);
      if (!cancelled && next) setResult(next);
    }
    const timer = setTimeout(poll, delay);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [delay, result]);

  // De klok voor "bezig sinds" loopt enkel in de browser, zodat de server en de
  // browser hetzelfde renderen.
  const ticking = view?.kind === "starting";
  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [ticking]);

  function run(kind: "start" | "stop") {
    setPending(kind);
    startTransition(async () => {
      try {
        const res = kind === "start" ? await startLightroomAction() : await stopLightroomAction();
        setResult(res);
        if (res.ok) {
          showToast({ message: kind === "start" ? t.started : t.stopped, variant: "success" });
        } else {
          showToast({ message: t[res.error] ?? t.generic, variant: "error", duration: 0 });
        }
      } catch {
        showToast({ message: t.generic, variant: "error", duration: 0 });
      } finally {
        setPending(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {!result.ok && result.error !== "refused" && (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t[result.error]}
        </p>
      )}
      {view && (
        <LightroomCard
          locale={locale}
          view={view}
          pending={pending}
          nowMs={nowMs}
          onStart={() => run("start")}
          onStop={() => run("stop")}
        />
      )}
    </div>
  );
}
