/**
 * Hoe de status van een lid in een groepsadres heet, op het overzicht en op de
 * detailpagina. Eén plek, zodat "oud-lid, laatst 22-23" overal hetzelfde leest.
 *
 * Geen `server-only`: wordt in clientcomponenten gebruikt.
 */

import type { MemberStatus } from "./activity";

/** Wat de client van een status nodig heeft; serialiseerbaar. */
export type MemberStatusView = {
  kind: MemberStatus["kind"];
  lastYear: number | null;
  /** Bij een geneste groep: zit er (hoe diep ook) iemand actief in? Anders: is dit lid actief? */
  active: boolean;
  /** Een geneste groep die naar dit werkingsjaar heet (`sport_2627`). */
  thisYear: boolean;
};

export function toStatusView(status: MemberStatus): MemberStatusView {
  return {
    kind: status.kind,
    lastYear: status.kind === "former" || status.kind === "group" ? status.lastYear : null,
    thisYear: status.kind === "group" && status.thisYear,
    active:
      status.kind === "group" ? status.active : status.kind === "post" || status.kind === "student",
  };
}

/** "22-23", zoals `formatWorkingYear`, maar zonder de serverhelpers mee te slepen. */
export function shortYear(year: number): string {
  const a = String(year % 100).padStart(2, "0");
  const b = String((year + 1) % 100).padStart(2, "0");
  return `${a}-${b}`;
}

export type StatusTone = "ok" | "muted" | "warn";

export function statusLabel(s: MemberStatusView, nl: boolean): { text: string; tone: StatusTone } {
  switch (s.kind) {
    case "post":
      return { text: nl ? "post dit jaar" : "post this year", tone: "ok" };
    case "student":
      return { text: nl ? "student dit jaar" : "student this year", tone: "ok" };
    case "former":
      return {
        text: s.lastYear
          ? nl
            ? `oud-lid, laatst ${shortYear(s.lastYear)}`
            : `former member, last ${shortYear(s.lastYear)}`
          : nl
            ? "op de site, nooit actief"
            : "on the site, never active",
        tone: "muted",
      };
    case "group":
      if (s.thisYear) return { text: nl ? "groep van dit werkingsjaar" : "group of this working year", tone: "ok" };
      if (s.active) return { text: nl ? "groep met actieve leden" : "group with active members", tone: "ok" };
      return {
        text: s.lastYear
          ? nl
            ? `groep, laatst actief ${shortYear(s.lastYear)}`
            : `group, last active ${shortYear(s.lastYear)}`
          : nl
            ? "groep zonder actieve leden"
            : "group without active members",
        tone: "muted",
      };
    default:
      return { text: nl ? "onbekend adres" : "unknown address", tone: "warn" };
  }
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  ok: "bg-emerald-50 text-emerald-800",
  muted: "bg-vtk-blue-soft/60 text-zinc-600",
  warn: "bg-amber-50 text-amber-900",
};
