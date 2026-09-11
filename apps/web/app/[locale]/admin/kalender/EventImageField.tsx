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
 * De streefbreedte van 1600 px komt van de plek waar de foto terechtkomt: het
 * kader op de eventpagina is ongeveer 650 px breed, en op een telefoon of een
 * retina-scherm zijn dat ruim 1300 echte pixels. Een affiche die van een
 * Facebook-linkvoorbeeld geplukt is, is 600 px breed en wordt daar dus meer dan
 * verdubbeld; `next/image` vergroot niet, dus dat doet de browser van de
 * bezoeker, met een wazige affiche tot gevolg.
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
            ? "Optioneel, maar neem de originele affiche van minstens 1600 px breed: een kleine foto wordt op de eventpagina uitvergroot en oogt wazig. Zonder afbeelding toont de eventpagina de standaardfoto uit de preview."
            : "Optional, but use the original poster, at least 1600 px wide: a small photo gets enlarged on the event page and looks blurry. Without an image the event page shows the default photo shown here."
        }
        minWidth={1600}
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
