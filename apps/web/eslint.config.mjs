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
      // `next/link` prefetcht elke link zodra ze in beeld komt, en elke
      // prefetch is op deze dynamische site een volledige server-render: op
      // productie 13 tot 42 per paginaweergave. `@/components/ui/Link`
      // prefetcht pas bij hover of aanraking. Zie docs/performance.md.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: "Gebruik `@/components/ui/Link`: die prefetcht pas bij hover. Zie docs/performance.md.",
            },
          ],
        },
      ],
    },
  },
  {
    // De wrapper zelf is de enige plek die `next/link` rechtstreeks mag laden.
    files: ["components/ui/Link.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // WCAG 2.2 AA regressiebewaking op publieke en leden-TSX-bestanden.
    // Gebruikt minimatch-veilige ignores (geen ongedescapte [locale] of (scanner)).
    files: ["**/*.tsx"],
    ignores: [
      "**/admin/**",
      "app/*scanner*/**",
      "components/ticketing/scanner/**",
    ],
    settings: {
      "jsx-a11y": {
        polymorphicPropName: "as",
        components: {
          Link: "a",
          IconLink: "a",
          Button: "button",
          IconButton: "button",
          DeleteButton: "button",
          DeleteIconButton: "button",
        },
      },
    },
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-ambiguous-text": [
        "error",
        {
          words: ["click here", "here", "klik hier", "meer info", "read more"],
        },
      ],
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-activedescendant-has-tabindex": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          assert: "either",
          depth: 4,
          labelComponents: ["Label"],
          controlComponents: ["Input", "Textarea", "Select", "ThemedSelect"],
        },
      ],
      "jsx-a11y/media-has-caption": "error",
      "jsx-a11y/mouse-events-have-key-events": "error",
      "jsx-a11y/no-access-key": "error",
      "jsx-a11y/no-aria-hidden-on-focusable": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/no-distracting-elements": "error",
      "jsx-a11y/no-interactive-element-to-noninteractive-role": [
        "error",
        { canvas: ["img", "application"] },
      ],
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { allowExpressionValues: true, roles: ["tabpanel", "region"] },
      ],
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/scope": "error",
      "jsx-a11y/tabindex-no-positive": "error",
    },
  },
]);

export default eslintConfig;
