"use client";

import { useState, type ReactNode } from "react";

/**
 * Partnerlogo met tekst-fallback. `publicUrl()` kan niet weten of een object
 * echt in de bucket staat, dus een key die nergens naar wijst levert een geldige
 * URL op die 404't. Zonder onError-fallback rendert de browser dan een broken
 * image; hier valt de tegel terug op de partnernaam.
 */
export function PartnerLogo({
  src,
  name,
  className,
  fallback,
}: {
  src: string | null;
  name: string;
  className?: string;
  fallback?: ReactNode;
}) {
  // Bijhouden wélke src faalde, zodat een nieuwe upload opnieuw geprobeerd wordt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{fallback ?? name}</>;

  return (
    // Geen next/image: we kennen de echte afmetingen van een partnerlogo niet.
    // De upload schaalt ze enkel tot binnen 600x200 (`fit: inside`), dus elke
    // verhouding komt voor en elke width/height die we hier zouden invullen is
    // een gok. SVG-logo's laat next/image sowieso ongewijzigd door.
    //
    // `lazy`: de logo's staan onderaan de pagina. Zonder lazy vroeg de browser
    // ze meteen op, samen met wat de homepage voor haar eerste beeld nodig heeft.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}
