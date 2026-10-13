import type { Locale } from "@vtk/i18n";

/**
 * De foutcodes die het fotobeheer teruggeeft. Zeg wat er misging, niet enkel
 * dat er iets misging (zie CLAUDE.md). En noem Immich niet: wie foto's beheert,
 * hoeft niet te weten waar ze staan.
 */
export function albumErrorMessages(locale: Locale): Record<string, string> {
  return locale === "nl"
    ? {
        ALBUM_MISSING: "Niet gelukt: dit album bestaat niet meer. Herlaad de pagina.",
        PHOTO_MISSING: "Niet gelukt: die foto's staan niet meer bij de verborgen foto's.",
        IMMICH_UNREACHABLE: "Niet gelukt: de fotobibliotheek is niet bereikbaar. Probeer straks opnieuw.",
        TAB_NAME_REQUIRED: "Niet opgeslagen: geef de tab een naam.",
        TAB_EXISTS: "Niet opgeslagen: er is al een tab met die naam.",
        SAME_TAB: "Niet verplaatst: de foto's staan al in die tab.",
        MOVE_FAILED: "Niet verplaatst: geen enkele foto kwam in de andere tab terecht.",
        MOVE_PARTIAL: "Een deel van de foto's is verplaatst; de rest bleef in de oude tab staan.",
        MOVE_HALF_DONE:
          "Half gelukt: de foto's staan nu in de nieuwe tab, maar konden niet uit de oude gehaald worden. Probeer het verplaatsen opnieuw.",
        HIDE_FAILED: "Niet verborgen: geen enkele foto ging van de site.",
        HIDE_PARTIAL: "Een deel van de foto's is verborgen; de rest staat nog op de site.",
        SHOW_FAILED: "Niet gelukt: geen enkele foto kwam terug op de site.",
        COVER_OTHER_TAB: "Geen cover gezet: de cover moet een foto uit de eerste tab zijn.",
        TRASH_MISSING: "Niet teruggezet: dit staat niet meer in de prullenmand.",
        TRASH_EXPIRED: "Niet teruggezet: dit lag langer dan 30 dagen in de prullenmand en is definitief weg.",
        INVALID_INPUT: "Niet opgeslagen: kijk de ingevulde velden na.",
      }
    : {
        ALBUM_MISSING: "Failed: this album no longer exists. Reload the page.",
        PHOTO_MISSING: "Failed: those photos are no longer among the hidden photos.",
        IMMICH_UNREACHABLE: "Failed: the photo library is unreachable. Try again later.",
        TAB_NAME_REQUIRED: "Not saved: give the tab a name.",
        TAB_EXISTS: "Not saved: there is already a tab with that name.",
        SAME_TAB: "Not moved: those photos are already in that tab.",
        MOVE_FAILED: "Not moved: not a single photo ended up in the other tab.",
        MOVE_PARTIAL: "Some photos were moved; the rest stayed in the old tab.",
        MOVE_HALF_DONE:
          "Half done: the photos are in the new tab but could not be removed from the old one. Try moving them again.",
        HIDE_FAILED: "Not hidden: not a single photo left the site.",
        HIDE_PARTIAL: "Some photos were hidden; the rest is still on the site.",
        SHOW_FAILED: "Failed: not a single photo came back on the site.",
        COVER_OTHER_TAB: "No cover set: the cover has to be a photo from the first tab.",
        TRASH_MISSING: "Not restored: this is no longer in the trash.",
        TRASH_EXPIRED: "Not restored: this was in the trash for more than 30 days and is gone for good.",
        INVALID_INPUT: "Not saved: please check the fields you entered.",
      };
}
