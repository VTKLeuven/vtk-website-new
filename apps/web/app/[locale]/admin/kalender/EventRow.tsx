"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { EventRowActions } from "./EventRowActions";

export type EventRowData = {
  id: string;
  title: string;
  group: string;
  published: boolean;
  interested: number;
  /** Wanneer het doorgaat, al geschreven door de server. */
  when: { main: string; sub: string | null };
  /**
   * Communicatie aanvragen voor dit evenement: naar het formulier, of (al
   * aangevraagd) naar het overzicht. Weggelaten bij voorbije evenementen en
   * zolang het aanvraagformulier niet online staat.
   */
  commu?: { href: string; requested: boolean } | null;
  /** Staat dit in de hero? Weggelaten = geen ster in deze rij. */
  heroFeatured?: boolean | null;
};

/**
 * Eén evenement in de beheerlijst.
 *
 * De hele rij opent het evenement; de knop in de titelcel is wat een toetsenbord
 * vindt en wat een screenreader voorleest (zie CLAUDE.md). Het potloodje dat hier
 * stond is daarmee overbodig geworden: het deed hetzelfde als de rij eronder.
 *
 * De cellen met een eigen handeling (de teller, het verwijderen) stoppen de
 * klik, anders opent elke knop ook nog het evenement.
 */
export function EventRow({
  locale,
  base,
  event,
}: {
  locale: Locale;
  base: string;
  event: EventRowData;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const href = `${base}/admin/kalender/${event.id}`;

  return (
    <tr
      onClick={() => router.push(href)}
      className="cursor-pointer border-t border-zinc-200 transition-colors hover:bg-vtk-blue-soft/40"
    >
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            router.push(href);
          }}
          className="text-left font-medium text-vtk-ink hover:underline"
        >
          {event.title}
        </button>
        <span className="block text-xs font-normal text-zinc-500">{event.group}</span>
      </td>
      <td className="px-4 py-2 tabular-nums text-zinc-600">
        {event.when.main}
        {event.when.sub ? (
          <span className="block text-xs text-zinc-500">{event.when.sub}</span>
        ) : null}
      </td>
      <td className="px-4 py-2">
        <span
          className={[
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
            event.published
              ? "bg-vtk-yellow/20 text-vtk-ink"
              : "border border-vtk-blue/15 text-vtk-blue-muted",
          ].join(" ")}
        >
          {event.published ? (nl ? "Gepubliceerd" : "Published") : nl ? "Concept" : "Draft"}
        </span>
      </td>
      <td
        className="px-4 py-2 text-right tabular-nums text-zinc-600"
        onClick={(e) => e.stopPropagation()}
      >
        {event.interested > 0 ? (
          <button
            type="button"
            onClick={() => router.push(`${href}#geinteresseerden`)}
            className="font-medium text-vtk-ink underline hover:text-vtk-blue"
            title={nl ? "Bekijk geïnteresseerden" : "View interested attendees"}
          >
            {event.interested}
          </button>
        ) : (
          0
        )}
      </td>
      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <EventRowActions
          locale={locale}
          id={event.id}
          title={event.title}
          commu={event.commu ?? null}
          heroFeatured={event.heroFeatured ?? null}
        />
      </td>
    </tr>
  );
}
