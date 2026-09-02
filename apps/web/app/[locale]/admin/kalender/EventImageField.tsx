"use client";

import { useState } from "react";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { ImageFocusField } from "@/components/admin/ImageFocusField";
import { storageKeyPath } from "@/lib/storageKeyPath";
import { CENTER_FOCUS, focusPosition, type ImageFocus } from "@/lib/imageFocus";

/**
 * Optionele cover-afbeelding voor een evenement; zonder afbeelding valt de
 * eventpagina terug op de standaardfoto.
 *
 * Onder de upload staat het uitsnedeveld. Dat hangt aan de key in deze state en
 * niet aan de opgeslagen waarde, zodat het meteen de zopas gekozen foto toont;
 * bij een evenement dat al een foto heeft, staat het er van bij het openen en is
 * de uitsnede dus achteraf nog recht te zetten zonder opnieuw te uploaden.
 */
export function EventImageField({
  defaultKey,
  defaultFocus,
  locale,
}: {
  defaultKey?: string | null;
  defaultFocus?: ImageFocus | null;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const [key, setKey] = useState(defaultKey ?? "");
  // De duimnagel van de upload toont dezelfde uitsnede als de voorbeelden
  // eronder; anders staan er twee kadertjes van dezelfde foto die elkaar
  // tegenspreken.
  const [focus, setFocus] = useState<ImageFocus>(defaultFocus ?? CENTER_FOCUS);

  return (
    <div className="space-y-4">
      <StorageImageField
        defaultKey={defaultKey}
        locale={locale}
        fallbackUrl="/default-event.jpg"
        emptyHint={nl ? "Standaardfoto" : "Default photo"}
        helpText={
          nl
            ? "Optioneel. Zonder afbeelding toont de eventpagina de standaardfoto uit de preview."
            : "Optional. Without an image the event page shows the default photo shown here."
        }
        onChange={setKey}
        previewPosition={focusPosition(focus)}
      />
      <ImageFocusField
        imageUrl={key ? `/api/media/${storageKeyPath(key)}` : null}
        defaultFocus={defaultFocus}
        locale={locale}
        label={nl ? "Deel van de foto dat in beeld blijft" : "Part of the photo that stays in view"}
        helpText={
          nl
            ? "Sleep het bolletje naar wat zeker zichtbaar moet blijven, bijvoorbeeld de tekst op een affiche."
            : "Drag the dot to whatever has to stay visible, for instance the text on a poster."
        }
        previews={[
          { label: nl ? "Homepagekaart" : "Home page card", ratio: "16 / 9" },
          { label: nl ? "Eventpagina" : "Event page", ratio: "16 / 10" },
          { label: nl ? "Telefoon" : "Phone", ratio: "4 / 3" },
        ]}
        onChange={setFocus}
      />
    </div>
  );
}
