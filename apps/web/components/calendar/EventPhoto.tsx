import Image from "next/image";
import { photoCropStyle, type ImageCrop, type ImageFocus } from "@/lib/imageFocus";

/**
 * De affiche bovenaan een eventpagina (`.vtk-event-photo`), met haar uitsnede.
 *
 * Op een groot scherm draait de uitsnede rond `focus`; op een telefoon, waar
 * het kader 4/3 is, rond `mobile` wanneer de redactie daar een eigen punt en
 * zoom voor koos. Beide gaan als CSS-variabele mee (`photoCropStyle`), zodat de
 * server één foto rendert en de stylesheet per breedte kiest.
 *
 * Hoe de zoom werkt, staat bij `.vtk-event-photo-crop[data-mobile-crop]` in
 * vtk-event.css. Uitgezoomd past de foto niet meer van rand tot rand; dan ligt er een
 * vervaagde kopie van dezelfde foto onder. Dezelfde `src` en `sizes`, dus de
 * browser haalt ze maar één keer op.
 */
export function EventPhoto({
  src,
  sizes,
  focus,
  mobile,
  quality,
  className,
}: {
  src: string;
  sizes: string;
  /** `null` voor een standaardfoto: die draait gewoon rond het midden. */
  focus: ImageFocus | null;
  mobile?: ImageCrop | null;
  quality?: number;
  className?: string;
}) {
  return (
    <figure
      className={className ? `vtk-event-photo ${className}` : "vtk-event-photo"}
      style={photoCropStyle(focus, mobile)}
    >
      {mobile?.ratio && mobile.zoom < 1 ? (
        <Image
          src={src}
          alt=""
          aria-hidden="true"
          fill
          sizes={sizes}
          quality={quality}
          className="vtk-event-photo-fill"
        />
      ) : null}
      {/* Met een gekende verhouding rekent de stylesheet op een telefoon de
          maat van deze laag zelf uit, en kan de foto ook uitzoomen. Een laag
          rond de foto en niet de foto zelf: `next/image` met `fill` houdt zijn
          eigen breedte en plaats. */}
      <div className="vtk-event-photo-crop" data-mobile-crop={mobile?.ratio ? "" : undefined}>
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          quality={quality}
          className="vtk-event-photo-img"
          priority
        />
      </div>
    </figure>
  );
}
