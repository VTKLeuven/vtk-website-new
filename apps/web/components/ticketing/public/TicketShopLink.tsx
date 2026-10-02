"use client";

import type { ComponentProps } from "react";
import Link from "@/components/ui/Link";
import { sourceQuery } from "@/lib/ticketing/source";
import { useLandingSource } from "./useLandingSource";

/**
 * De knop naar de ticketpagina op een eventpagina, die de herkomst van het
 * bezoek aan de eventpagina doorgeeft. Wie vanuit de agenda op de homepage op
 * een event klikt en daar tickets koopt, telt zo voor de homepage en niet voor
 * "eventpagina".
 *
 * Zonder bekende herkomst (rechtstreeks geopend) krijgt de link niets mee; de
 * ticketpagina ziet dan de eventpagina als referrer en telt het als
 * `kalender-event`.
 */
export function TicketShopLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const source = useLandingSource();
  return <Link href={`${href}${sourceQuery(source)}`} {...props} />;
}
