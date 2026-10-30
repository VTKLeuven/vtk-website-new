"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { IconButton, IconLink, RowActions } from "@/components/ui/IconButton";
import { MegaphoneIcon, StarIcon, TrashIcon } from "@/components/ui/icons";
import { deleteEventAction, setEventHomeFeaturedAction } from "@/app/actions/calendar";

function heroErrorMessage(code: string, nl: boolean): string {
  switch (code) {
    case "HERO_FULL":
      return nl
        ? "Er staan al vier evenementen uitgelicht. Haal er eerst één uit de hero."
        : "Four events are already featured. Remove one from the hero first.";
    case "NOT_PUBLISHED":
      return nl
        ? "Publiceer dit evenement eerst: een concept kan niet in de hero staan."
        : "Publish this event first: a draft cannot be in the hero.";
    case "ALREADY_STARTED":
      return nl
        ? "Dit evenement is al begonnen, dus het kan niet meer in de hero staan."
        : "This event has already started, so it can no longer be in the hero.";
    default:
      return nl ? "Niet opgeslagen. Probeer het opnieuw." : "Not saved. Please try again.";
  }
}

/**
 * Wat er per rij overblijft: uitlichten in de hero, communicatie aanvragen en
 * verwijderen.
 *
 * Het potloodje stond hier tot de rij zelf het evenement opende; twee wegen naar
 * hetzelfde scherm, waarvan er één een icoon kostte in elke rij. Verwijderen
 * blijft wel een knop, want het is de enige handeling die je niet ook door de
 * rij te openen kan doen. De megafoon opent het aanvraagformulier voor commu
 * met dit evenement al ingevuld; met een vinkje erin is er al een aanvraag.
 */
export function EventRowActions({
  locale,
  id,
  title,
  commu,
  heroFeatured,
}: {
  locale: Locale;
  id: string;
  title: string;
  commu: { href: string; requested: boolean } | null;
  /** Staat dit in de hero? `null` = geen ster: enkel `calendar.manageAll`, enkel bij wat nog komt. */
  heroFeatured: boolean | null;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [heroPending, startHeroTransition] = useTransition();

  const deleteLabel = nl ? "Verwijderen" : "Delete";
  const heroLabel = heroFeatured
    ? nl
      ? "Uit de hero halen"
      : "Remove from the hero"
    : nl
      ? "Uitlichten in de hero"
      : "Feature in the hero";

  function toggleHero() {
    startHeroTransition(async () => {
      const result = await setEventHomeFeaturedAction(id, !heroFeatured);
      if (result.status === "error") {
        showToast({
          message: heroErrorMessage(result.code, nl),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: heroFeatured
          ? nl
            ? "Uit de hero gehaald"
            : "Removed from the hero"
          : nl
            ? "Uitgelicht in de hero"
            : "Featured in the hero",
        variant: "success",
      });
    });
  }

  function onConfirm() {
    const form = new FormData();
    form.append("id", id);
    startTransition(async () => {
      await deleteEventAction(form);
      setConfirming(false);
      showToast({
        message: nl ? "Evenement verwijderd" : "Event deleted",
        variant: "success",
      });
    });
  }

  return (
    <RowActions>
      {heroFeatured !== null ? (
        <IconButton
          label={heroLabel}
          srLabel={`${heroLabel}: ${title}`}
          aria-pressed={heroFeatured}
          disabled={heroPending}
          onClick={toggleHero}
        >
          <StarIcon filled={heroFeatured} />
        </IconButton>
      ) : null}
      {commu ? (
        <IconLink
          href={commu.href}
          label={
            commu.requested
              ? nl
                ? "Commu aangevraagd"
                : "Comms requested"
              : nl
                ? "Commu aanvragen"
                : "Request comms"
          }
          srLabel={`${
            commu.requested
              ? nl
                ? "Commu aangevraagd"
                : "Comms requested"
              : nl
                ? "Commu aanvragen"
                : "Request comms"
          }: ${title}`}
        >
          <MegaphoneIcon done={commu.requested} />
        </IconLink>
      ) : null}
      <IconButton
        label={deleteLabel}
        srLabel={`${deleteLabel}: ${title}`}
        tone="danger"
        onClick={() => setConfirming(true)}
      >
        <TrashIcon />
      </IconButton>

      <ConfirmDialog
        open={confirming}
        title={nl ? "Evenement verwijderen?" : "Delete event?"}
        description={
          nl
            ? `"${title}" wordt permanent verwijderd en verdwijnt meteen uit de publieke kalender. Dit kan niet ongedaan gemaakt worden.`
            : `"${title}" will be permanently deleted and disappears from the public calendar right away. This cannot be undone.`
        }
        confirmLabel={deleteLabel}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </RowActions>
  );
}
