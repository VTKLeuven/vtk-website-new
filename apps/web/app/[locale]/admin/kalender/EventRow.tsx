"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { IconButton } from "@/components/ui/IconButton";
import { EyeOffIcon, PinIcon } from "@/components/ui/icons";
import { SAVE_IDLE } from "@/lib/saveState";
import { setEventHeroWeekAction } from "@/app/actions/calendar";
import { EventRowActions } from "./EventRowActions";

export type HeroWeekPlacement = "AUTO" | "PINNED" | "HIDDEN";

export type EventRowData = {
  id: string;
  title: string;
  group: string;
  published: boolean;
  interested: number;
  /** Wanneer het doorgaat, al geschreven door de server. */
  when: { main: string; sub: string | null };
  heroWeek: HeroWeekPlacement;
};

/**
 * Eén evenement in de beheerlijst.
 *
 * De hele rij opent het evenement; de knop in de titelcel is wat een toetsenbord
 * vindt en wat een screenreader voorleest (zie CLAUDE.md). Het potloodje dat hier
 * stond is daarmee overbodig geworden: het deed hetzelfde als de rij eronder.
 *
 * De cellen met een eigen handeling (de teller, de twee homepageknoppen, het
 * verwijderen) stoppen de klik, anders opent elke knop ook nog het evenement.
 */
export function EventRow({
  locale,
  base,
  event,
  canHeroWeek,
}: {
  locale: Locale;
  base: string;
  event: EventRowData;
  /** Zonder de permissie `calendar.heroWeek` staan die twee knoppen er niet. */
  canHeroWeek: boolean;
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
      {canHeroWeek ? (
        <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
          <HeroWeekToggles locale={locale} id={event.id} title={event.title} value={event.heroWeek} />
        </td>
      ) : null}
      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <EventRowActions locale={locale} id={event.id} title={event.title} />
      </td>
    </tr>
  );
}

/**
 * Voorrang en niet-tonen als twee schakelaars naast elkaar: uit is de gewone,
 * automatische stand, en hoogstens één van de twee staat aan.
 *
 * Bewust geen keuzelijst per rij. Honderd keer "Automatisch" in een kolom is
 * honderd keer ruis voor een keuze die je zelden maakt, terwijl twee stille
 * icoonknoppen pas opvallen zodra er één aanstaat. Dat het geen gewone rij-actie
 * is maar een stand, staat in het icoon zelf (geel en ingedrukt) en in de
 * kolomkop erboven.
 */
function HeroWeekToggles({
  locale,
  id,
  title,
  value,
}: {
  locale: Locale;
  id: string;
  title: string;
  value: HeroWeekPlacement;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [placement, setPlacement] = useState<HeroWeekPlacement>(value);
  const [pending, startTransition] = useTransition();

  const labels: Record<HeroWeekPlacement, string> = {
    AUTO: nl ? "automatisch" : "automatic",
    PINNED: nl ? "voorrang op de homepage" : "priority on the home page",
    HIDDEN: nl ? "niet op de homepage" : "not on the home page",
  };

  function choose(next: HeroWeekPlacement) {
    const previous = placement;
    if (next === previous) return;
    // Meteen omzetten, en terugzetten wanneer de server het weigert: anders
    // staat de knop een halve seconde op de oude stand terwijl je al verder
    // klikt in de lijst.
    setPlacement(next);
    const form = new FormData();
    form.append("id", id);
    form.append("heroWeek", next);
    startTransition(async () => {
      const result = await setEventHeroWeekAction(SAVE_IDLE, form);
      if (result.status === "error") {
        setPlacement(previous);
        showToast({
          message: nl
            ? `"${title}" kon niet gewijzigd worden. Probeer het opnieuw.`
            : `"${title}" could not be changed. Try again.`,
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: nl
          ? `"${title}": ${labels[next]}`
          : `"${title}": ${labels[next]}`,
        variant: "success",
      });
    });
  }

  const pinLabel = nl ? "Voorrang op de homepage" : "Priority on the home page";
  const hideLabel = nl ? "Niet op de homepage" : "Not on the home page";
  const on = "border-vtk-yellow bg-vtk-yellow text-vtk-ink hover:border-vtk-yellow hover:bg-vtk-yellow";

  return (
    <div className="flex items-center gap-2">
      <IconButton
        label={pinLabel}
        srLabel={`${pinLabel}: ${title}`}
        aria-pressed={placement === "PINNED"}
        disabled={pending}
        className={placement === "PINNED" ? on : undefined}
        onClick={() => choose(placement === "PINNED" ? "AUTO" : "PINNED")}
      >
        <PinIcon />
      </IconButton>
      <IconButton
        label={hideLabel}
        srLabel={`${hideLabel}: ${title}`}
        aria-pressed={placement === "HIDDEN"}
        disabled={pending}
        className={placement === "HIDDEN" ? on : undefined}
        onClick={() => choose(placement === "HIDDEN" ? "AUTO" : "HIDDEN")}
      >
        <EyeOffIcon />
      </IconButton>
    </div>
  );
}
