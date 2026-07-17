"use client";

import { StorageImageField } from "@/components/admin/StorageImageField";

/**
 * Optionele cover-afbeelding voor een evenement; zonder afbeelding valt de
 * eventpagina terug op de standaardfoto. Dunne schil rond het gedeelde
 * StorageImageField met de event-specifieke teksten.
 */
export function EventImageField({
  defaultKey,
  locale,
}: {
  defaultKey?: string | null;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  return (
    <StorageImageField
      defaultKey={defaultKey}
      locale={locale}
      fallbackUrl="/default-event.jpg"
      emptyHint={nl ? "Standaardfoto" : "Default photo"}
      helpText={
        nl
          ? "Optioneel. Zonder afbeelding toont de eventpagina de standaardfoto hiernaast."
          : "Optional. Without an image the event page shows the default photo shown here."
      }
    />
  );
}
