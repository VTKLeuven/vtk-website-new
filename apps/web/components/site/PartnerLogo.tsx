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
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} className={className} onError={() => setFailedSrc(src)} />
  );
}
