"use client";

import { lightroomView, parseLightroomStatus } from "@/lib/lightroom-view";
import { LightroomCard, type LightroomLocale } from "./LightroomCard";

/** Een vast moment, zodat "bezig sinds" op de server en in de browser hetzelfde zegt. */
const SAMPLE_NOW_MS = Date.UTC(2026, 9, 23, 18, 0, 0);
const SAMPLE_NOW = SAMPLE_NOW_MS / 1000;

/**
 * Antwoorden zoals kenny ze geeft (`lightroom-vm status --json`), door dezelfde
 * parser als de echte pagina. Enkel de toestanden die je zelden te zien krijgt:
 * een geweigerde start, het opstarten, klaar met iemand verbonden, en vast.
 */
const SAMPLES: { label: { nl: string; en: string }; raw: unknown }[] = [
  {
    label: { nl: "Geweigerd: er loopt een berekening", en: "Refused: a computation is running" },
    raw: {
      state: "off",
      since: SAMPLE_NOW - 3_600,
      can_start: false,
      blocker_codes: ["job"],
      blockers: ["a GPU job is running (/home/it/seg/job.pid); it uses both GPUs"],
      idle_limit_minutes: 30,
    },
  },
  {
    label: { nl: "Bezig met opstarten", en: "Starting" },
    raw: { state: "running", ready: false, since: SAMPLE_NOW - 95, started_by: "Lid van Communicatie" },
  },
  {
    label: { nl: "Klaar, met iemand verbonden", en: "Ready, with someone connected" },
    raw: {
      state: "running",
      ready: true,
      since: SAMPLE_NOW - 1_800,
      started_by: "Lid van Communicatie",
      parsec_users: ["commu_lid#12345678"],
      idle_minutes: 7.5,
      hibernate_in_minutes: 22.5,
      idle_limit_minutes: 30,
    },
  },
  {
    label: { nl: "Vast: wil niet in slaapstand", en: "Stuck: will not go to sleep" },
    raw: { state: "error", message: "the VM would not hibernate or shut down; GPU 0 stays with it" },
  },
];

export function LightroomPreview({ locale }: { locale: LightroomLocale }) {
  return (
    <div className="space-y-5">
      {SAMPLES.map(({ label, raw }) => {
        const status = parseLightroomStatus(raw);
        if (!status) return null;
        return (
          <div key={label.en} className="space-y-2">
            <p className="text-xs font-medium text-zinc-500">{label[locale]}</p>
            <LightroomCard
              locale={locale}
              view={lightroomView(status)}
              pending={null}
              nowMs={SAMPLE_NOW_MS}
              onStart={() => {}}
              onStop={() => {}}
            />
          </div>
        );
      })}
    </div>
  );
}
