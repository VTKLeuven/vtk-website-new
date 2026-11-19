import Image from "next/image";

/**
 * De foto onder de hero van de homepage, onder de navy scrim van
 * `.home-dark-zone::before` (vtk-home.css).
 *
 * Een `next/image` en geen CSS-achtergrond. Als achtergrond ontdekte de browser
 * de foto pas nadat de CSS geladen was, en kreeg hij het origineel: de
 * ingebouwde foto is een JPEG van 1,5 MB, een upload uit /admin/home vaak nog
 * groter. Op een telefoon over 4G was dat een LCP van twaalf seconden. Nu staat
 * er een preload in de `<head>` en komt er een WebP van de juiste breedte.
 *
 * `sizes` is gewoon de schermbreedte, ook op een telefoon. Daar is de zone smal
 * en heel hoog (390 bij 1900 pixels), dus `cover` vergroot de foto sowieso op
 * hoogte uit; een variant van 1200 pixels zag er naast het origineel achter de
 * scrim identiek uit, voor 287 KB in plaats van 1,5 MB.
 */
export function HomeHeroPhoto({ src }: { src: string }) {
  return (
    <Image
      className="home-hero-photo"
      src={src}
      alt=""
      fill
      preload
      sizes="100vw"
    />
  );
}
