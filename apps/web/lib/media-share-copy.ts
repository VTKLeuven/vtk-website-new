import type { Locale } from "@vtk/i18n";

/** Waarom de pagina achter een privélink geen foto's toont. */
export type SharedGateKind = "login" | "forbidden" | "gone" | "unavailable";

type Audience = "LINK" | "PRAESIDIUM" | "GROUP";

/**
 * De teksten van de pagina achter een privélink. Apart van de pagina, omdat
 * /admin/it/flows dezelfde schermen toont met dezelfde tekst.
 *
 * Geen enkel scherm noemt de titel van het album of de naam van de groep: wie de
 * link niet hoort te hebben, leert er niets uit.
 */
export function sharedAlbumCopy(locale: Locale) {
  const nl = locale === "nl";
  return {
    pageTitle: nl ? "Gedeeld album" : "Shared album",
    kicker: nl ? "Gedeeld album, niet openbaar" : "Shared album, not public",
    noticeTitle: nl ? "Gedeeld album." : "Shared album.",
    notice(audience: Audience, until: string): string {
      const via =
        audience === "PRAESIDIUM"
          ? nl
            ? "een link voor het praesidium"
            : "a link for the praesidium"
          : audience === "GROUP"
            ? nl
              ? "een link voor je werkgroep"
              : "a link for your working group"
            : nl
              ? "een link"
              : "a link";
      return nl
        ? `Het staat niet op de mediapagina; je ziet het via ${via}, die werkt tot ${until}.`
        : `It is not on the media page; you see it through ${via}, which works until ${until}.`;
    },
    downloadAll: nl ? "Alles downloaden (zip)" : "Download everything (zip)",
    gate: {
      kicker: nl ? "Gedeeld album" : "Shared album",
      toPhotos: nl ? "Naar de foto's op vtk.be" : "To the photos on vtk.be",
      login: {
        title: nl ? "Log in om dit album te zien" : "Log in to see this album",
        body: nl
          ? "Dit album is gedeeld met een groep binnen VTK. Log in; hoor je erbij, dan kom je meteen bij de foto's."
          : "This album is shared with a group within VTK. Log in; if you belong to it, you go straight to the photos.",
        button: nl ? "Inloggen" : "Log in",
      },
      forbidden: {
        title: nl ? "Dit album is niet met jou gedeeld" : "This album is not shared with you",
        body: nl
          ? "Je bent ingelogd, maar de link is voor een groep waar je dit werkingsjaar niet bij hoort. Klopt dat niet, vraag het dan aan wie je de link stuurde."
          : "You are logged in, but the link is for a group you are not part of this working year. If that is wrong, ask whoever sent you the link.",
      },
      gone: {
        title: nl ? "Deze link werkt niet meer" : "This link no longer works",
        body: nl
          ? "Hij is verlopen of ingetrokken. Vraag een nieuwe link aan wie hem je stuurde."
          : "It has expired or was revoked. Ask whoever sent it to you for a new link.",
      },
      unavailable: {
        title: nl ? "Dit album kan nu niet geladen worden" : "This album cannot be loaded right now",
        body: nl
          ? "De fotobibliotheek is even niet bereikbaar. Probeer het straks opnieuw met dezelfde link."
          : "The photo library is unreachable for a moment. Try again later with the same link.",
      },
    },
  };
}
