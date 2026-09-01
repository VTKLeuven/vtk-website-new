"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setEventInterestAction } from "@/app/actions/eventInterest";
import { StarIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";

/**
 * "Ik kom", rechtstreeks vanuit het weekoverzicht in de hero.
 *
 * Schrijft in dezelfde tabel als de knop op de eventpagina en de ster in de app
 * (`app/actions/eventInterest.ts`), zodat een lid overal hetzelfde antwoord
 * krijgt. Hier staat bewust de kale ster: de hero heeft geen plaats voor de
 * alumnivelden, en die zijn ook nergens verplicht om te kunnen aanduiden dat je
 * komt.
 *
 * De ster wisselt meteen en corrigeert zichzelf wanneer de server weigert. Een
 * knop die pas na een ronde naar de server reageert, voelt in een lijst van tien
 * kapot; een knop die stil de verkeerde toestand toont, is erger.
 *
 * Zonder aanmelding is het een link naar het aanmeldscherm en geen knop: dat is
 * eerlijker dan een ster die pas na het klikken vertelt dat het niet gaat.
 */

export type HeroWeekStarLabels = {
  /** "Ik kom naar dit evenement" */
  mark: string;
  /** "Je komt naar dit evenement" */
  marked: string;
  /** "Meld je aan om aan te duiden dat je komt" */
  signIn: string;
  /** Melding wanneer de server het niet aanvaardde. */
  failed: string;
};

export function HeroWeekStar({
  eventId,
  title,
  interested: initialInterested,
  signedIn,
  loginHref,
  labels,
}: {
  eventId: string;
  /** De naam van het evenement, enkel voor de schermlezer. */
  title: string;
  interested: boolean;
  signedIn: boolean;
  loginHref: string;
  labels: HeroWeekStarLabels;
}) {
  const [interested, setInterested] = useState(initialInterested);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  if (!signedIn) {
    return (
      <Link
        href={loginHref}
        className="hero-week-star"
        title={labels.signIn}
        aria-label={`${labels.signIn}: ${title}`}
      >
        <StarIcon />
      </Link>
    );
  }

  const label = interested ? labels.marked : labels.mark;

  return (
    <button
      type="button"
      className="hero-week-star"
      aria-pressed={interested}
      aria-label={`${label}: ${title}`}
      title={label}
      data-pending={pending ? "" : undefined}
      onClick={() => {
        const next = !interested;
        setInterested(next);
        startTransition(async () => {
          const data = new FormData();
          data.set("eventId", eventId);
          // De action leest "off" als uitzetten; al de rest is aanzetten.
          if (!next) data.set("interested", "off");
          const result = await setEventInterestAction(SAVE_IDLE, data);
          if (result.status === "error") {
            setInterested(!next);
            showToast({ message: labels.failed, variant: "error", duration: 0 });
          }
        });
      }}
    >
      <StarIcon filled={interested} />
    </button>
  );
}
