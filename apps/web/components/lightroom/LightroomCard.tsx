"use client";

import { useState, type ReactNode } from "react";
import { Button, Card, ConfirmDialog } from "@vtk/ui";
import { LIGHTROOM_COMPUTER_NAME, type LightroomBlocker, type LightroomView } from "@/lib/lightroom-view";

/**
 * Hoe de Lightroom-pc ervoor staat, met de ene knop die op dat moment zin heeft.
 * Puur weergave: de status en de acties komen van {@link LightroomPanel}, zodat
 * /admin/it/flows dezelfde kaart met verzonnen toestanden kan tonen.
 */

export type LightroomLocale = "nl" | "en";

export const LIGHTROOM_COPY = {
  nl: {
    offTitle: "De Lightroom-pc staat uit",
    offBody:
      "Start hem wanneer je wilt bewerken. Na ongeveer 4 minuten kun je verbinden; je werk van de vorige keer staat er nog zoals je het liet.",
    offSince: "In slaapstand sinds",
    blockedTitle: "De Lightroom-pc kan nu niet starten",
    blockers: {
      job: "Er loopt een berekening op kenny die beide GPU's nodig heeft. Probeer het later opnieuw.",
      gpu_in_use: "Iets anders gebruikt de GPU nog. Probeer het over een paar minuten opnieuw.",
      comfy_busy: "Er wordt nog een afbeelding gegenereerd. Probeer het over een paar minuten opnieuw.",
      memory: "Kenny heeft nu te weinig vrij geheugen. Probeer het later opnieuw.",
      gpu_detached: "De GPU kwam na de vorige keer niet goed terug. Vraag IT om te kijken.",
      maintenance: "IT werkt aan de Lightroom-pc.",
      check_failed: "Kenny kon niet nagaan of starten kan. Vraag IT om te kijken.",
    } satisfies Record<LightroomBlocker, string>,
    lastStart: "De vorige start lukte niet. Probeer het opnieuw; lukt het weer niet, vraag IT om te kijken.",
    details: "Details voor IT",
    start: "Start de Lightroom-pc",
    starting: "Starten...",
    startingTitle: "De Lightroom-pc start op",
    startingBody:
      "Dat duurt ongeveer 4 minuten: kenny geeft de GPU door en Windows komt uit de slaapstand. Deze pagina zegt het zodra je kunt verbinden.",
    busyFor: "Bezig sinds",
    startedBy: "Gestart door",
    readyTitle: "De Lightroom-pc is klaar",
    readyBody: `Open Parsec en klik bij Computers op Connect bij ${LIGHTROOM_COMPUTER_NAME}.`,
    connected: "Nu verbonden via Parsec:",
    nobody: "Nog niemand verbonden via Parsec.",
    sleepAfter: (limit: number, left: number | null) =>
      `Zonder muis of toetsenbord gaat hij na ${limit} minuten in slaapstand` +
      (left != null ? ` (nog ${Math.ceil(left)} min)` : "") +
      ". Een export telt als werk. Je werk blijft bewaard.",
    stop: "Ik ben klaar",
    stopping: "Bezig...",
    stopHint: "Zet hem nu in slaapstand, zodat llm.vtk.be zijn GPU meteen terugkrijgt.",
    confirmTitle: "In slaapstand zetten?",
    confirmBody: (names: string) =>
      `Nog verbonden: ${names}. Die verbinding valt weg, maar het werk op de Lightroom-pc blijft bewaard.`,
    confirm: "In slaapstand",
    cancel: "Annuleren",
    stoppingTitle: "De Lightroom-pc gaat in slaapstand",
    stoppingBody: "Windows bewaart alles wat openstaat en geeft de GPU terug. Dat duurt minder dan een minuut.",
    maintenanceTitle: "De Lightroom-pc is in onderhoud",
    maintenanceBody: "IT werkt eraan. Probeer het later opnieuw.",
    errorTitle: "De Lightroom-pc wil niet in slaapstand",
    errorBody: "De GPU zit nog vast aan de Lightroom-pc. Vraag IT om te kijken.",
  },
  en: {
    offTitle: "The Lightroom PC is off",
    offBody:
      "Start it when you want to edit. After about 4 minutes you can connect; your work from last time is still there as you left it.",
    offSince: "Asleep since",
    blockedTitle: "The Lightroom PC cannot start now",
    blockers: {
      job: "A computation that needs both of kenny's GPUs is running. Try again later.",
      gpu_in_use: "Something else is still using the GPU. Try again in a few minutes.",
      comfy_busy: "An image is still being generated. Try again in a few minutes.",
      memory: "Kenny is short on free memory right now. Try again later.",
      gpu_detached: "The GPU did not come back properly after last time. Ask IT to have a look.",
      maintenance: "IT is working on the Lightroom PC.",
      check_failed: "Kenny could not check whether starting is possible. Ask IT to have a look.",
    } satisfies Record<LightroomBlocker, string>,
    lastStart: "The last start did not work. Try again; if it fails again, ask IT to have a look.",
    details: "Details for IT",
    start: "Start the Lightroom PC",
    starting: "Starting...",
    startingTitle: "The Lightroom PC is starting",
    startingBody:
      "That takes about 4 minutes: kenny hands over the GPU and Windows wakes from hibernation. This page tells you as soon as you can connect.",
    busyFor: "Busy since",
    startedBy: "Started by",
    readyTitle: "The Lightroom PC is ready",
    readyBody: `Open Parsec and, under Computers, click Connect on ${LIGHTROOM_COMPUTER_NAME}.`,
    connected: "Connected through Parsec:",
    nobody: "Nobody is connected through Parsec yet.",
    sleepAfter: (limit: number, left: number | null) =>
      `Without mouse or keyboard input it goes to sleep after ${limit} minutes` +
      (left != null ? ` (${Math.ceil(left)} min left)` : "") +
      ". An export counts as work. Your work is kept.",
    stop: "I'm done",
    stopping: "Working...",
    stopHint: "Puts it to sleep now, so llm.vtk.be gets its GPU back right away.",
    confirmTitle: "Put it to sleep?",
    confirmBody: (names: string) =>
      `Still connected: ${names}. That connection drops, but the work on the Lightroom PC is kept.`,
    confirm: "Put to sleep",
    cancel: "Cancel",
    stoppingTitle: "The Lightroom PC is going to sleep",
    stoppingBody: "Windows keeps everything that is open and hands the GPU back. That takes less than a minute.",
    maintenanceTitle: "The Lightroom PC is under maintenance",
    maintenanceBody: "IT is working on it. Try again later.",
    errorTitle: "The Lightroom PC will not go to sleep",
    errorBody: "The GPU is still stuck to the Lightroom PC. Ask IT to have a look.",
  },
} as const;

function clock(unixSeconds: number, locale: LightroomLocale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

function elapsed(fromUnixSeconds: number, nowMs: number): string {
  const s = Math.max(0, Math.floor(nowMs / 1000 - fromUnixSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Dot({ tone }: { tone: "off" | "busy" | "good" | "bad" }) {
  const colour = {
    off: "bg-zinc-300",
    busy: "bg-amber-400 animate-pulse",
    good: "bg-emerald-500",
    bad: "bg-red-500",
  }[tone];
  return <span aria-hidden className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${colour}`} />;
}

function Details({ label, lines }: { label: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <details className="text-xs text-zinc-500">
      <summary className="cursor-pointer select-none">{label}</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  );
}

export function LightroomCard({
  locale,
  view,
  pending,
  nowMs,
  onStart,
  onStop,
}: {
  locale: LightroomLocale;
  view: LightroomView;
  /** Welke knop net ingedrukt is en nog op kenny wacht. */
  pending: "start" | "stop" | null;
  /** Voor de verstreken tijd tijdens het opstarten; `null` tot de klok in de browser loopt. */
  nowMs: number | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const t = LIGHTROOM_COPY[locale];
  const [confirming, setConfirming] = useState(false);

  let tone: "off" | "busy" | "good" | "bad";
  let title: string;
  let body: ReactNode;
  let action: ReactNode = null;

  switch (view.kind) {
    case "off": {
      tone = view.canStart ? "off" : "bad";
      title = view.canStart ? t.offTitle : t.blockedTitle;
      const failed = view.message?.startsWith("start failed") ?? false;
      body = (
        <>
          {view.canStart ? (
            <p>{t.offBody}</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              {view.blockers.map((code) => (
                <li key={code}>{t.blockers[code]}</li>
              ))}
            </ul>
          )}
          {failed && <p className="text-amber-800">{t.lastStart}</p>}
          {view.canStart && view.since != null && !failed && (
            <p className="text-xs text-zinc-500">
              {t.offSince} {clock(view.since, locale)}
            </p>
          )}
          <Details label={t.details} lines={[...view.details, ...(failed && view.message ? [view.message] : [])]} />
        </>
      );
      action = (
        <Button type="button" size="lg" disabled={!view.canStart || pending !== null} onClick={onStart}>
          {pending === "start" ? t.starting : t.start}
        </Button>
      );
      break;
    }
    case "starting":
      tone = "busy";
      title = t.startingTitle;
      body = (
        <>
          <p>{t.startingBody}</p>
          <p className="text-xs text-zinc-500">
            {view.since != null && nowMs != null && (
              <span className="tabular-nums">
                {t.busyFor} {elapsed(view.since, nowMs)}
              </span>
            )}
            {view.since != null && nowMs != null && view.startedBy && " · "}
            {view.startedBy && (
              <span>
                {t.startedBy} {view.startedBy}
              </span>
            )}
          </p>
        </>
      );
      break;
    case "ready": {
      tone = "good";
      title = t.readyTitle;
      const names = view.users.join(", ");
      body = (
        <>
          <p className="font-medium text-vtk-ink">{t.readyBody}</p>
          <p>{view.users.length ? `${t.connected} ${names}` : t.nobody}</p>
          <p className="text-xs text-zinc-500">
            {t.sleepAfter(view.idleLimitMinutes, view.hibernateInMinutes)}
            {view.startedBy && ` ${t.startedBy} ${view.startedBy}.`}
          </p>
        </>
      );
      action = (
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button
            type="button"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => (view.users.length ? setConfirming(true) : onStop())}
          >
            {pending === "stop" ? t.stopping : t.stop}
          </Button>
          <span className="max-w-xs text-xs text-zinc-500 sm:text-right">{t.stopHint}</span>
          <ConfirmDialog
            open={confirming}
            title={t.confirmTitle}
            description={t.confirmBody(names)}
            confirmLabel={t.confirm}
            cancelLabel={t.cancel}
            destructive={false}
            pending={pending !== null}
            onConfirm={() => {
              setConfirming(false);
              onStop();
            }}
            onCancel={() => setConfirming(false)}
          />
        </div>
      );
      break;
    }
    case "stopping":
      tone = "busy";
      title = t.stoppingTitle;
      body = <p>{t.stoppingBody}</p>;
      break;
    case "maintenance":
      tone = "off";
      title = t.maintenanceTitle;
      body = <p>{t.maintenanceBody}</p>;
      break;
    case "error":
      tone = "bad";
      title = t.errorTitle;
      body = (
        <>
          <p>{t.errorBody}</p>
          <Details label={t.details} lines={view.message ? [view.message] : []} />
        </>
      );
      break;
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Dot tone={tone} />
          <div className="min-w-0 space-y-2 text-sm text-[#5c667f]">
            <h2 className="text-lg font-semibold text-vtk-ink" aria-live="polite">
              {title}
            </h2>
            {body}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </Card>
  );
}
