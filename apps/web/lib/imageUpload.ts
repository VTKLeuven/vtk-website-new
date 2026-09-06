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
