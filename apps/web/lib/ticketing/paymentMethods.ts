import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import { enabledPaymentMethods, type PaymentProviderName } from "./config";

export type PaymentMethodOption = {
  provider: PaymentProviderName;
  /**
   * Pad naar het officiële logo, of null zolang dat bestand er niet staat. Dan
   * toont de knop een pictogram.
   */
  logo: string | null;
};

/**
 * Of het merkbestand van een betaalwijze bestaat.
 *
 * Dit wordt hier op de server bekeken en niet in de browser opgevangen met een
 * `onError`: een `<img>` naar een onbestaand logo laat eerst een gebroken
 * afbeelding zien, en de knop hoort er meteen goed uit te zien. Het antwoord
 * wordt onthouden, want de map verandert niet tijdens het draaien; zet je er een
 * logo bij, dan pikt de server dat op na een herstart.
 */
const logoCache = new Map<string, string | null>();

function methodLogo(provider: PaymentProviderName): string | null {
  const cached = logoCache.get(provider);
  if (cached !== undefined) return cached;
  // SVG eerst: dat is wat een merkpakket levert en wat op elk scherm scherp
  // blijft. Een PNG is de terugval voor een merk dat er geen aanbiedt.
  let found: string | null = null;
  for (const extension of ["svg", "png"]) {
    const file = `${provider}.${extension}`;
    if (existsSync(path.join(process.cwd(), "public", "betaalmethodes", file))) {
      found = `/betaalmethodes/${file}`;
      break;
    }
  }
  logoCache.set(provider, found);
  return found;
}

export type PaymentMethodChoice = {
  /**
   * - `single`: geen keuze tonen, meteen doorsturen. Dat is de situatie zolang
   *   er maar één betaalwijze geconfigureerd is.
   * - `collapsed`: enkel de eerste betaalwijze staat er; de rest komt pas na een
   *   klik op "meer betaalmethodes".
   * - `equal`: alle betaalwijzen staan er tegelijk, even zwaar.
   *
   * Alle zichtbare knoppen zien er hetzelfde uit. Wat de voorkeur draagt is de
   * volgorde en of iets meteen zichtbaar is, niet een afwijkende kleur.
   */
  variant: "single" | "collapsed" | "equal";
  options: PaymentMethodOption[];
};

/**
 * De volgorde van de betaalwijzen op het betaalscherm, per taal.
 *
 * Nederlands toont enkel **Bancontact**; Mollie staat achter "meer
 * betaalmethodes". Engels toont **Mollie** en Bancontact tegelijk, even zwaar.
 * De reden staat in `docs/design-decisions.md`: de rechtstreekse
 * Bancontact-betaling is voor ons goedkoper, dus die willen we zoveel mogelijk
 * gebruikt zien, maar een internationale student kan er niet mee betalen. De
 * taal is de enige aanwijzing die we op dat moment hebben, en ze is niet meer
 * dan een aanwijzing: een Belgische student die de site in het Engels leest,
 * moet Mollie én Bancontact meteen zien staan.
 */
export function paymentMethodChoice(locale: "nl" | "en"): PaymentMethodChoice {
  const available = enabledPaymentMethods();
  if (available.length <= 1) {
    return {
      variant: "single",
      options: available.map((provider) => ({ provider, logo: methodLogo(provider) })),
    };
  }

  const bancontact = available.filter((provider) => provider === "bancontact");
  const others = available.filter((provider) => provider !== "bancontact");

  if (locale === "nl" && bancontact.length > 0) {
    return {
      variant: "collapsed",
      options: [...bancontact, ...others].map((provider) => ({
        provider,
        logo: methodLogo(provider),
      })),
    };
  }

  return {
    variant: "equal",
    options: [...others, ...bancontact].map((provider) => ({
      provider,
      logo: methodLogo(provider),
    })),
  };
}
