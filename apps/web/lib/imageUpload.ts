/** Limits mirror /api/admin/upload; checked before sending the file. */
export const IMAGE_UPLOAD_MAX_MB = { image: 45, logo: 10, feedback: 12 } as const;
type ImageKind = keyof typeof IMAGE_UPLOAD_MAX_MB;

export function imageUploadError(locale: "nl" | "en", status?: number, kind: ImageKind = "image") {
  if (status === 413) {
    return locale === "nl"
      ? `De afbeelding is te groot voor de upload. Maximaal ${IMAGE_UPLOAD_MAX_MB[kind]} MB. Kies een kleiner bestand.`
      : `The image is too large to upload. Maximum ${IMAGE_UPLOAD_MAX_MB[kind]} MB. Choose a smaller file.`;
  }
  if (status === 415) {
    return locale === "nl"
      ? "Deze afbeelding kan niet worden verwerkt. Kies een andere afbeelding of exporteer ze als JPG of PNG."
      : "This image could not be processed. Choose another image or export it as JPG or PNG.";
  }
  return locale === "nl"
    ? "Upload mislukt; de afbeelding is niet bewaard. Probeer het opnieuw."
    : "Upload failed; the image was not saved. Please try again.";
}

export function imageUploadSizeError(file: { size: number }, locale: "nl" | "en", kind: ImageKind = "image") {
  return file.size > IMAGE_UPLOAD_MAX_MB[kind] * 1024 * 1024
    ? imageUploadError(locale, 413, kind)
    : null;
}

/**
 * Een foto die smaller is dan de plek waar ze terechtkomt, wordt door de browser
 * uitvergroot en ziet er wazig uit. Dat gebeurde in de praktijk voortdurend:
 * de coverfoto's van de events op de homepagina waren 596 tot 600 px breed, het
 * formaat van een Facebook-linkvoorbeeld, terwijl de eventpagina ze op een
 * scherm met dubbele pixeldichtheid tot ongeveer 1300 px opblaast. Niets zei dat
 * tegen de redacteur, en `next/image` vergroot nooit boven de bron, dus de
 * uitvergroting gebeurt pas in de browser van de bezoeker.
 *
 * Dit is een waarschuwing en geen weigering: soms bestaat er van een affiche
 * niets beters dan wat iemand doorgestuurd kreeg, en een wazige foto is nog
 * altijd beter dan het gestreepte patroon.
 */
export function imageTooSmallWarning(
  width: number | null | undefined,
  minWidth: number,
  locale: "nl" | "en",
): string | null {
  if (!width || width >= minWidth) return null;
  return locale === "nl"
    ? `Deze foto is maar ${width} px breed. Ze wordt op de site uitvergroot en zal wazig zijn; gebruik de originele affiche of foto van minstens ${minWidth} px breed.`
    : `This photo is only ${width} px wide. It gets enlarged on the site and will look blurry; use the original poster or photo, at least ${minWidth} px wide.`;
}
