"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { openDoorRemoteAction } from "@/app/actions/door";

/**
 * Dashboardknop die de deur op afstand opent (server -> Pi over Tailscale). Enkel
 * gerenderd voor houders van `door.remoteOpen`; het openen zelf en de logging
 * gebeuren in {@link openDoorRemoteAction}. Elke klik meldt zijn uitkomst als toast.
 */

const T = {
  nl: {
    title: "Deur",
    hint: "Open de voordeur op afstand.",
    open: "Deur openen",
    opening: "Openen...",
    success: "Deur geopend.",
    not_configured: "De deurscanner is nog niet geconfigureerd (Admin -> IT).",
    unreachable: "Kan de deurscanner niet bereiken. Staat de Pi aan en op het tailnet?",
    pi_error: "De deurscanner gaf een fout terug.",
    generic: "Deur openen mislukt.",
  },
  en: {
    title: "Door",
    hint: "Open the front door remotely.",
    open: "Open door",
    opening: "Opening...",
    success: "Door opened.",
    not_configured: "The door scanner is not configured yet (Admin -> IT).",
    unreachable: "Could not reach the door scanner. Is the Pi on and on the tailnet?",
    pi_error: "The door scanner returned an error.",
    generic: "Failed to open the door.",
  },
} as const;

export function DoorOpenButton({ locale }: { locale: "nl" | "en" }) {
  const t = T[locale];
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function onClick() {
    startTransition(async () => {
      try {
        const res = await openDoorRemoteAction();
        if (res.ok) {
          showToast({ message: t.success, variant: "success" });
        } else {
          const msg = (t as Record<string, string>)[res.error] ?? t.generic;
          showToast({ message: msg, variant: "error", duration: 0 });
        }
      } catch {
        showToast({ message: t.generic, variant: "error", duration: 0 });
      }
    });
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-vtk-blue/12 bg-white p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-vtk-blue-soft/60 text-vtk-ink">
        <LockIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-vtk-ink">{t.title}</div>
        <div className="text-xs text-[#5c667f]">{t.hint}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="vtk-tile-btn vtk-tile-btn-primary shrink-0"
      >
        {pending ? t.opening : t.open}
      </button>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
