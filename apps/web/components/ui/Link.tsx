"use client";

import NextLink from "next/link";
import { useState, type ComponentProps, type FocusEvent, type MouseEvent, type TouchEvent } from "react";

/**
 * `next/link`, maar prefetcht pas wanneer iemand de link aanwijst, aanraakt of
 * er met het toetsenbord op komt, en niet zodra ze in beeld verschijnt.
 *
 * Elke pagina van deze site is dynamisch (de root layout leest cookies), en
 * voor een dynamische route zonder `loading.js` levert een prefetch in Next 16
 * weinig op: de data zelf wordt niet gecachet, dus de klik rendert de pagina
 * toch opnieuw. De server betaalde wel: op productie stuurde één paginaweergave
 * 13 tot 42 prefetches, van elk 150 à 200 ms render, voor de header, de footer
 * en elke kaart in beeld. Op de homepage was dat twee seconden servertijd per
 * bezoeker. Zo blijft er enkel een prefetch over voor de link die iemand
 * waarschijnlijk gaat volgen; zie "Hover prefetch" in de Next-docs.
 *
 * Een expliciete `prefetch` gaat voor: wie `prefetch={true}` zet, kiest daar
 * bewust voor.
 */
export default function Link({ prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof NextLink>) {
  const [intent, setIntent] = useState(false);

  if (prefetch !== undefined) {
    return (
      <NextLink
        prefetch={prefetch}
        onMouseEnter={onMouseEnter}
        onTouchStart={onTouchStart}
        onFocus={onFocus}
        {...props}
      />
    );
  }

  return (
    <NextLink
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onTouchStart={(event: TouchEvent<HTMLAnchorElement>) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        setIntent(true);
        onFocus?.(event);
      }}
    />
  );
}
