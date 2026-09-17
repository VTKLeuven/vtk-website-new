import type { Locale } from "@vtk/i18n";

/**
 * De foutcodes die het albumbeheer teruggeeft. Zeg wat er misging, niet enkel
 * dat er iets misging (zie CLAUDE.md).
 */
export function albumErrorMessages(locale: Locale): Record<string, string> {
  return locale === "nl"
    ? {
        ALBUM_MISSING: "Niet opgeslagen: dit album bestaat niet meer in Immich.",
        PHOTO_MISSING: "Niet gelukt: deze foto staat niet meer in de lijst van losgekoppelde foto's.",
        IMMICH_UNREACHABLE: "Niet opgeslagen: Immich is niet bereikbaar. Probeer straks opnieuw.",
        TAB_NAME_REQUIRED: "Niet opgeslagen: geef de tab een naam.",
        TAB_EXISTS: "Niet opgeslagen: er is al een tab met die naam.",
        SAME_TAB: "Niet verplaatst: de foto's staan al in die tab.",
        MOVE_FAILED: "Niet verplaatst: Immich nam geen enkele foto in de andere tab op.",
        MOVE_PARTIAL: "Een deel van de foto's is verplaatst; de rest bleef in de oude tab staan.",
        DETACH_FAILED: "Niet gelukt: Immich haalde geen enkele foto uit het album.",
        DETACH_PARTIAL: "Een deel van de foto's is uit het album gehaald; de rest staat er nog in.",
        RESTORE_FAILED: "Niet teruggezet: Immich nam de foto niet in het album op. De foto blijft in deze lijst staan.",
        MOVE_HALF_DONE:
          "Half gelukt: de foto's staan nu in de nieuwe tab, maar konden niet uit de oude gehaald worden. Probeer het verplaatsen opnieuw.",
        INVALID_INPUT: "Niet opgeslagen: kijk de ingevulde velden na.",
      }
    : {
        ALBUM_MISSING: "Not saved: this album no longer exists in Immich.",
        PHOTO_MISSING: "Failed: this photo is no longer in the list of detached photos.",
        IMMICH_UNREACHABLE: "Not saved: Immich is unreachable. Try again later.",
        TAB_NAME_REQUIRED: "Not saved: give the tab a name.",
        TAB_EXISTS: "Not saved: there is already a tab with that name.",
        SAME_TAB: "Not moved: those photos are already in that tab.",
        MOVE_FAILED: "Not moved: Immich did not accept a single photo into the other tab.",
        MOVE_PARTIAL: "Some photos were moved; the rest stayed in the old tab.",
        DETACH_FAILED: "Failed: Immich did not remove a single photo from the album.",
        DETACH_PARTIAL: "Some photos were taken out of the album; the rest are still in it.",
        RESTORE_FAILED: "Not restored: Immich did not accept the photo into the album. It stays in this list.",
        MOVE_HALF_DONE:
          "Half done: the photos are in the new tab but could not be removed from the old one. Try moving them again.",
        INVALID_INPUT: "Not saved: please check the fields you entered.",
      };
}
