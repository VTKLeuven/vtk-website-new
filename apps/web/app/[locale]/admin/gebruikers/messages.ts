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
  };
}
