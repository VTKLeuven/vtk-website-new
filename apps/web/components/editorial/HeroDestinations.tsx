import type { ComponentProps, ReactNode } from "react";
import Link from "@/components/ui/Link";
import { isExternalUrl, withLocaleBase } from "@/lib/href";
import { HOME_LINK_EVENT, OUTBOUND_EVENT, outboundHost, umamiEvent } from "@/lib/analytics";
import { DEFAULT_HERO_SUBS, type HeroDestinationKey, type HeroSubs } from "@/lib/home/heroDesign";

export type HeroDestination = {
  key: HeroDestinationKey;
  side: "l" | "r";
  topPercent: string;
  delay: string;
  titleNl: string;
  titleEn: string;
  href: string;
};

export const DESTINATIONS: HeroDestination[] = [
  {
    key: "kalender",
    side: "l",
    topPercent: "26.92%",
    delay: "1.50s",
    titleNl: "Kalender",
    titleEn: "Calendar",
    href: "/kalender",
  },
  {
    key: "tickets",
    side: "l",
    topPercent: "47.81%",
    delay: "1.62s",
    titleNl: "Tickets",
    titleEn: "Tickets",
    href: "/tickets",
  },
  {
    key: "broodjes",
    side: "l",
    topPercent: "74.88%",
    delay: "1.74s",
    titleNl: "Broodjes",
    titleEn: "Sandwiches",
    href: "/theokot",
  },
  {
    key: "cursusdienst",
    side: "r",
    topPercent: "20.77%",
    delay: "1.86s",
    titleNl: "Cursusdienst",
    titleEn: "Course Shop",
    href: "https://cudi.vtk.be",
  },
  {
    key: "shiften",
    side: "r",
    topPercent: "42.31%",
    delay: "1.98s",
    titleNl: "Shiften",
    titleEn: "Shifts",
    href: "/shift",
  },
  {
    key: "career",
    side: "r",
    topPercent: "74.88%",
    delay: "2.10s",
    titleNl: "Career",
    titleEn: "Career",
    href: "https://career.vtk.be",
  },
];

/** Een leeg tekstje komt enkel voor in het voorbeeld terwijl iemand het veld leegmaakt. */
export function destinationText(destination: HeroDestination, nl: boolean, subs: HeroSubs) {
  const lang = nl ? "nl" : "en";
  return {
    title: nl ? destination.titleNl : destination.titleEn,
    sub: subs[destination.key][lang].trim() || DEFAULT_HERO_SUBS[destination.key][lang],
  };
}

/** De link naar een bestemming: een extern adres opent apart en telt als uitgaand. */
export function DestinationLink({
  destination,
  base,
  children,
  ...rest
}: {
  destination: HeroDestination;
  base: string;
  children: ReactNode;
} & Omit<ComponentProps<"a">, "href" | "children">) {
  if (isExternalUrl(destination.href)) {
    return (
      <a
        {...rest}
        href={destination.href}
        target="_blank"
        rel="noopener noreferrer"
        {...umamiEvent(OUTBOUND_EVENT, {
          bestemming: outboundHost(destination.href),
          vanaf: "hero",
        })}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      {...rest}
      href={withLocaleBase(destination.href, base)}
      {...umamiEvent(HOME_LINK_EVENT, { soort: "hero", naar: destination.href })}
    >
      {children}
    </Link>
  );
}
