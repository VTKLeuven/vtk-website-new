import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // `next/image` is de standaard; een kale `<img>` haalt het origineel binnen en
    // schaalt het pas in de browser. Deze regel staat op "error" en niet op de
    // standaard "warn", want een waarschuwing tussen honderd andere is precies hoe
    // de vorige lading `<img>`-tags erin geslopen is.
    //
    // Er zijn wél geldige uitzonderingen; die dragen elk een
    // `eslint-disable-next-line` met de reden erbij, zodat de afweging in het
    // bestand zelf staat en niet hier in een lijst die niemand leest. De reden
    // valt altijd in een van deze drie categorieën:
    //
    //  1. De bron is een blob- of data-URL uit een lopende bewerking of iets dat
    //     de browser zelf tekent (AvatarCropField, FaceSearchPanel, TicketPass).
    //     Er is geen bestand op de server om te optimaliseren.
    //  2. De host valt niet op te sommen in `images.remotePatterns`: logo's van
    //     OAuth-clients, aftermovie-posters die een beheerder intypt, en de
    //     fotogalerij achter Immich Public Proxy (zie next.config.ts).
    //  3. De echte afmetingen zijn onbekend en per item verschillend, terwijl de
    //     upload het bestand al klein maakte: partner- en tegellogo's, en de
    //     legacy tiptap-inhoud.
    //
    // Komt een nieuwe `<img>` niet in een van die drie thuis, dan hoort er een
    // `next/image` te staan.
    rules: {
      "@next/next/no-img-element": "error",
    },
  },
]);

export default eslintConfig;
