import type { MetadataRoute } from "next";

/**
 * Manifest van de ticketscanner, zodat die op het beginscherm van een telefoon
 * kan. Zonder browserbalk is er meer beeld voor de camera en start de deurploeg
 * met één tik in plaats van een link op te zoeken.
 *
 * `start_url` is `/scan`, het keuzescherm met de evenementen die je mag scannen.
 * Bewust niet een scanner-URL van één event: die is volgende maand nutteloos.
 *
 * `scope` op `/scan` doet meer dan het lijkt: buiten die scope is de pagina niet
 * installeerbaar, dus de browser biedt dit nooit aan op de publieke site. Eén
 * manifest volstaat daardoor; een tweede op een geneste route zou trouwens niet
 * werken, want de bestandsconventie hier wint van `metadata.manifest`.
 *
 * Let op: een manifest alleen is niet genoeg. Chrome vuurt `beforeinstallprompt`
 * enkel wanneer er ook een service worker met fetch-handler geregistreerd is;
 * zie `public/sw.js`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/scan",
    name: "VTK Scanner",
    short_name: "Scanner",
    description: "Tickets scannen aan de deur.",
    start_url: "/scan",
    scope: "/scan",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0f1f",
    theme_color: "#0a0f1f",
    lang: "nl-BE",
    icons: [
      {
        src: "/vtk-shield-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/vtk-shield-favicon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
