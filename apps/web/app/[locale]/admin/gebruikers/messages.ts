import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** De gedeelde meldingen, plus wat enkel bij gebruikers speelt. */
export function userErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    EMAIL_TAKEN: nl
      ? "Niet opgeslagen: dat e-mailadres hoort al bij een ander account."
      : "Not saved: that email address already belongs to another account.",
    RNUMBER_TAKEN: nl
      ? "Niet opgeslagen: dat r-nummer hoort al bij een ander lid."
      : "Not saved: that r-number already belongs to another member.",
    PASSWORD_REQUIRED: nl
      ? "Niet opgeslagen: een nieuwe gebruiker heeft een wachtwoord nodig."
      : "Not saved: a new user needs a password.",
    PASSWORD_TOO_SHORT: nl
      ? "Niet opgeslagen: een wachtwoord moet minstens 8 tekens bevatten."
      : "Not saved: a password must contain at least 8 characters.",
    STORAGE_UNAVAILABLE: nl
      ? "Niet verwijderd: de objectopslag antwoordt niet, dus de foto's en bestanden van dit account konden niet gewist worden. Kijk de S3-instellingen na bij Admin → IT en probeer opnieuw."
      : "Not deleted: object storage is not responding, so this account's photos and files could not be removed. Check the S3 settings under Admin → IT and try again.",
    FORBIDDEN: nl
      ? "Niet verwijderd: enkel een superadmin kan het account van een superadmin verwijderen."
      : "Not deleted: only a superadmin can delete a superadmin account.",
  };
}

/** Meldingen voor het wijzigen of verwijderen van een profielfoto in de admin. */
export function userAvatarErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    ACCOUNT_NOT_FOUND: nl
      ? "Niet opgeslagen: dit account bestaat niet meer."
      : "Not saved: this account no longer exists.",
    AVATAR_REQUIRED: nl
      ? "Niet opgeslagen: kies eerst een foto."
      : "Not saved: choose a photo first.",
    AVATAR_TOO_LARGE: nl
      ? "Niet opgeslagen: de foto is groter dan 8 MB."
      : "Not saved: the photo is larger than 8 MB.",
    AVATAR_FAILED: nl
      ? "Niet opgeslagen: de foto kon niet worden verwerkt. Probeer een ander bestand."
      : "Not saved: the photo could not be processed. Try a different file.",
    STORAGE_UNAVAILABLE: nl
      ? "Niet verwijderd: de objectopslag antwoordt niet, dus de foto kon niet worden verwijderd. Kijk de S3-instellingen na bij Admin → IT en probeer opnieuw."
      : "Not removed: object storage is not responding, so the photo could not be removed. Check the S3 settings under Admin → IT and try again.",
    FORBIDDEN: nl
      ? "Niet opgeslagen: enkel een superadmin kan de foto van een superadmin wijzigen."
      : "Not saved: only a superadmin can change a superadmin's photo.",
  };
}
