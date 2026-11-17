import type { getDictionary } from "@vtk/i18n";

type Dictionary = ReturnType<typeof getDictionary>;

/**
 * De labels van `AlbumViewer` en `AlbumTabViewer`, met die van het meldvenster.
 * Gedeeld door de albumpagina op /media en de pagina van een privélink, zodat
 * die twee niet elk hun eigen lijst bijhouden.
 */
export function albumViewerLabels(dict: Dictionary) {
  return {
    reportPhoto: dict.photos.reportPhoto,
    takedownTitle: dict.photos.takedownTitle,
    takedownIntro: dict.photos.takedownIntro,
    takedownName: dict.photos.takedownName,
    takedownEmail: dict.photos.takedownEmail,
    takedownReason: dict.photos.takedownReason,
    takedownReasonOnPhoto: dict.photos.takedownReasonOnPhoto,
    takedownReasonCopyright: dict.photos.takedownReasonCopyright,
    takedownReasonOther: dict.photos.takedownReasonOther,
    takedownMessage: dict.photos.takedownMessage,
    takedownSubmit: dict.photos.takedownSubmit,
    takedownSending: dict.photos.takedownSending,
    takedownSent: dict.photos.takedownSent,
    takedownDone: dict.photos.takedownDone,
    takedownPrivacy: dict.photos.takedownPrivacy,
    takedownFailed: dict.photos.takedownFailed,
    takedownNameRequired: dict.photos.takedownNameRequired,
    takedownNameTooLong: dict.photos.takedownNameTooLong,
    takedownEmailRequired: dict.photos.takedownEmailRequired,
    takedownEmailInvalid: dict.photos.takedownEmailInvalid,
    takedownEmailTooLong: dict.photos.takedownEmailTooLong,
    takedownReasonInvalid: dict.photos.takedownReasonInvalid,
    takedownMessageTooLong: dict.photos.takedownMessageTooLong,
    takedownPhotoUnknown: dict.photos.takedownPhotoUnknown,
    takedownRateLimited: dict.photos.takedownRateLimited,
    takedownSaveFailed: dict.photos.takedownSaveFailed,
    openPhoto: dict.photos.openPhoto,
    close: dict.photos.close,
    previous: dict.photos.previousPhoto,
    next: dict.photos.nextPhoto,
    previousPhoto: dict.photos.previousPhoto,
    nextPhoto: dict.photos.nextPhoto,
    downloadPhoto: dict.photos.downloadPhoto,
    photoCounter: dict.photos.photoCounter,
  };
}
