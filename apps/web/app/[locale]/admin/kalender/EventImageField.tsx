"use client";

import { useState } from "react";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { ImageFocusField } from "@/components/admin/ImageFocusField";
import { storageKeyPath } from "@/lib/storageKeyPath";
import { CENTER_FOCUS, focusPosition, type ImageCrop, type ImageFocus } from "@/lib/imageFocus";

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
 *
 * Daaronder kan de telefoon een eigen uitsnede krijgen: een eigen punt en een
 * zoom (`imageFocusMobileX/Y`, `imageZoomMobile`). De eventpagina toont de foto
 * daar in 4/3, en een liggende affiche verliest dan links en rechts net de
 * logo's; een punt verleggen haalt er hoogstens één terug, uitzoomen beide.
 * Standaard uit: dan volgt de telefoon de gewone uitsnede, zoals voordien.
 *
 * En de app krijgt er een derde (`imageFocusAppX/Y`, `imageZoomApp`): Home en de
 * eventpagina in de app tonen de foto bovenaan over de volle breedte in ongeveer
 * 6/5, hoger dan elk kader op de site. Ook standaard uit: dan volgt de app de
 * telefoonuitsnede, en anders het gewone punt (`lib/app-api/imageCrop.ts`).
 *
 * `fallbackUrl` is de foto die dit evenement zónder upload krijgt: de
 * standaardbanner van zijn thema, en anders de sitebrede. Ze verandert dus mee
 * met de aangevinkte thema's; de preview toont dan wat er echt komt te staan in
 * plaats van altijd dezelfde meegeleverde foto.
 */
export function EventImageField({
  defaultKey,
  defaultFocus,
  defaultMobileCrop,
  defaultAppCrop,
  locale,
  fallbackUrl,
  fallbackHint,
}: {
  defaultKey?: string | null;
  defaultFocus?: ImageFocus | null;
  /** De telefoonuitsnede, of `null` wanneer de telefoon de gewone volgt. */
  defaultMobileCrop?: ImageCrop | null;
  /** De uitsnede in de app, of `null` wanneer de app de telefoon volgt. */
  defaultAppCrop?: ImageCrop | null;
  locale: "nl" | "en";
  fallbackUrl: string;
  /** Waar die foto vandaan komt ("Standaardfoto Cantus"), als label op de preview. */
  fallbackHint: string;
}) {
  const nl = locale === "nl";
  const [key, setKey] = useState(defaultKey ?? "");
  // De duimnagel van de upload toont dezelfde uitsnede als de voorbeelden
  // eronder; anders staan er twee kadertjes van dezelfde foto die elkaar
  // tegenspreken.
  const [focus, setFocus] = useState<ImageFocus>(defaultFocus ?? CENTER_FOCUS);
  const [ownMobileCrop, setOwnMobileCrop] = useState(Boolean(defaultMobileCrop));
  const [ownAppCrop, setOwnAppCrop] = useState(Boolean(defaultAppCrop));
  const imageUrl = key ? `/api/media/${storageKeyPath(key)}` : null;
  const phonePreview = { label: nl ? "Telefoon" : "Phone", ratio: "4 / 3" };
  const appPreview = { label: "App", ratio: "6 / 5" };

  return (
    <div className="space-y-4">
      <StorageImageField
        defaultKey={defaultKey}
        locale={locale}
        fallbackUrl={fallbackUrl}
        emptyHint={fallbackHint}
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
        imageUrl={imageUrl}
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
          // Met een eigen telefoonuitsnede staat de telefoon hieronder, bij
          // die uitsnede; hier zou ze tonen wat er niet meer komt te staan.
          ...(ownMobileCrop ? [] : [phonePreview]),
          // Zo ook de app, die zonder eigen uitsnede die van de telefoon volgt.
          ...(ownMobileCrop || ownAppCrop ? [] : [appPreview]),
        ]}
        onChange={setFocus}
      />

      {/* Zonder foto valt er niets bij te snijden; uit wist de telefoonuitsnede. */}
      <input
        type="hidden"
        name="imageFocusMobileOn"
        value={imageUrl && ownMobileCrop ? "true" : "false"}
      />
      {imageUrl ? (
        <label className="vtk-ef-check">
          <input
            type="checkbox"
            checked={ownMobileCrop}
            onChange={(changed) => setOwnMobileCrop(changed.target.checked)}
          />
          <span>
            <b>{nl ? "Andere uitsnede op een telefoon" : "Different crop on a phone"}</b>
            <small>
              {nl
                ? "Op een telefoon toont de eventpagina de foto in 4/3, en valt er links en rechts meer weg. Kies er een eigen middelpunt en zoom voor, bijvoorbeeld om de logo's aan de rand van een affiche in beeld te houden."
                : "On a phone the event page shows the photo in 4/3, and more falls off on the left and right. Pick its own centre and zoom, for instance to keep the logos at the edge of a poster in view."}
            </small>
          </span>
        </label>
      ) : null}
      {imageUrl && ownMobileCrop ? (
        <ImageFocusField
          name="imageFocusMobile"
          withZoom
          imageUrl={imageUrl}
          // Wie het aanzet, begint van de uitsnede die er nu staat.
          defaultFocus={defaultMobileCrop?.focus ?? focus}
          defaultZoom={defaultMobileCrop?.zoom ?? 1}
          locale={locale}
          label={nl ? "Uitsnede op een telefoon" : "Crop on a phone"}
          helpText={
            nl
              ? "Het kader op de foto is wat een telefoon toont. Zoom uit om meer van de randen te tonen; wat de foto dan niet vult, vult de site met een vervaagde kopie."
              : "The frame on the photo is what a phone shows. Zoom out to show more of the edges; whatever the photo then leaves empty, the site fills with a blurred copy."
          }
          previews={ownAppCrop ? [phonePreview] : [phonePreview, appPreview]}
        />
      ) : null}

      {/* Uit wist de app-uitsnede; dan volgt de app de telefoon. */}
      <input type="hidden" name="imageFocusAppOn" value={imageUrl && ownAppCrop ? "true" : "false"} />
      {imageUrl ? (
        <label className="vtk-ef-check">
          <input
            type="checkbox"
            checked={ownAppCrop}
            onChange={(changed) => setOwnAppCrop(changed.target.checked)}
          />
          <span>
            <b>{nl ? "Andere uitsnede in de app" : "Different crop in the app"}</b>
            <small>
              {nl
                ? "Home en de eventpagina in de app tonen de foto bovenaan over de volle breedte, in een kader dat hoger is dan op de site (ongeveer 6/5). Kies er een eigen middelpunt en zoom voor. Uit: de app volgt de uitsnede op een telefoon."
                : "Home and the event page in the app show the photo full width at the top, in a frame taller than anywhere on the site (about 6/5). Pick its own centre and zoom. Off: the app follows the crop on a phone."}
            </small>
          </span>
        </label>
      ) : null}
      {imageUrl && ownAppCrop ? (
        <ImageFocusField
          name="imageFocusApp"
          withZoom
          imageUrl={imageUrl}
          // Wie het aanzet, begint van wat de app nu toont.
          defaultFocus={defaultAppCrop?.focus ?? defaultMobileCrop?.focus ?? focus}
          defaultZoom={defaultAppCrop?.zoom ?? defaultMobileCrop?.zoom ?? 1}
          locale={locale}
          label={nl ? "Uitsnede in de app" : "Crop in the app"}
          helpText={
            nl
              ? "Het kader op de foto is wat de app toont. Bovenaan staan de groet en de knoppen, en onderaan schuift de titel er een stukje over: houd de tekst van een affiche iets van de randen. Zoom uit om meer te tonen; de rest vult de app met een vervaagde kopie."
              : "The frame on the photo is what the app shows. The greeting and buttons sit at the top and the title slides over the bottom a little: keep a poster's text away from the edges. Zoom out to show more; the app fills the rest with a blurred copy."
          }
          previews={[appPreview]}
        />
      ) : null}
    </div>
  );
}
