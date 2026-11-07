import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'material'
  | 'van'
  | 'car'
  | 'cargobike'
  | 'reservation'
  | 'dashboard'
  | 'event'
  | 'request'
  | 'driver'
  | 'check'
  | 'edit'
  | 'close'
  | 'hide'
  | 'show'
  | 'external'
  | 'expand'
  | 'collapse'
  | 'chevron'
  | 'template'
  | 'text'
  | 'settings'
  | 'planning'
  | 'basket'
  | 'bottle'
  | 'trash'
  | 'chart';

export function LogisticsIcon({ name, className, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths = {
    material: (
      <>
        <path d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5v-8Z" />
        <path d="m4.5 8.75 7.5 4.25 7.5-4.25M12 13v8" />
      </>
    ),
    van: (
      <>
        <path d="M3 7.5h11v9H3zM14 10h3.4L21 13.6v2.9h-7z" />
        <path d="M6.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      </>
    ),
    // Een auto in zijaanzicht (F6.8): dak, ruiten, haakse wielkasten. De vorige
    // was een bak met twee wielen en las niet als auto. Nagekeken op 12px, de
    // grootte in een ritblok.
    car: (
      <>
        <path d="M5 17H3.5a.5.5 0 0 1-.5-.5V13a1 1 0 0 1 .7-1l2.2-.7L8 8.5A1.5 1.5 0 0 1 9.1 8h5.3a1.5 1.5 0 0 1 1.1.5l2.4 2.9 1.9.5a1 1 0 0 1 .7 1v3.1a.5.5 0 0 1-.5.5H19" />
        <path d="M9 17h6" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
        <path d="M12 8.2v3.2M5.9 11.4h11.2" />
      </>
    ),
    // Een bakfiets (F6.8): de bak vooraan op een klein wiel, een frame naar een
    // groot achterwiel, zadel en stuur. De vorige was een fiets zonder bak.
    cargobike: (
      <>
        <rect x="2" y="9" width="8.5" height="5" rx="1.2" />
        <circle cx="5" cy="18" r="2.2" />
        <circle cx="19" cy="16.5" r="3" />
        <path d="M5 15.8V14M10.5 12.5h3.5l5 4M14 12.5l1.4-4.6h2.4M10.5 10.5l1-4.2h2.2" />
      </>
    ),
    reservation: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M8 2.5v3M16 2.5v3M5 9h14M8.5 13h2M13.5 13h2M8.5 17h2" />
      </>
    ),
    // Overzicht, Evenementen en Aanvragen deelden tot nu het kalendericoon met
    // Kalender. Vier identieke iconen naast elkaar in de zijbalk maken het
    // icoon betekenisloos: je leest dan enkel nog het woord ernaast.
    dashboard: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
    event: (
      <>
        <path d="M5.5 21.5V3" />
        <path d="M5.5 4h11.5l-2.3 3.6L17 11.2H5.5" />
      </>
    ),
    request: (
      <>
        <path d="M9.5 4.5H8A1.5 1.5 0 0 0 6.5 6v13.5A1.5 1.5 0 0 0 8 21h8a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 16 4.5h-1.5" />
        <rect x="9.5" y="2.5" width="5" height="4" rx="1.2" />
        <path d="M9.5 11.5h5M9.5 15.5h3" />
      </>
    ),
    driver: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M4 10h16M12 14.6v6.9" />
      </>
    ),
    check: <path d="m5 12 4.25 4.25L19 6.5" />,
    edit: (
      <>
        <path d="m14.7 5.3 4 4" />
        <path d="M4 20h4l10.7-10.7a2.83 2.83 0 0 0-4-4L4 16v4Z" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    hide: (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
        <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5.5 9 5.5a15.7 15.7 0 0 1-2.1 2.8M6.6 6.6C4.4 8 3 10.2 3 10.2s3.5 5.5 9 5.5c1.1 0 2.1-.2 3-.5" />
      </>
    ),
    show: (
      <>
        <path d="M3 12s3.5-5.5 9-5.5 9 5.5 9 5.5-3.5 5.5-9 5.5S3 12 3 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
    // Vier hoeken die naar buiten wijzen: volledig scherm openen.
    expand: (
      <>
        <path d="M9 4H4v5" />
        <path d="M4 4l6 6" />
        <path d="M15 20h5v-5" />
        <path d="M20 20l-6-6" />
      </>
    ),
    // Dezelfde vier hoeken, naar binnen: volledig scherm sluiten.
    collapse: (
      <>
        <path d="M4 9h5V4" />
        <path d="M3 3l6 6" />
        <path d="M20 15h-5v5" />
        <path d="M21 21l-6-6" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6" />
        <path d="M20 4 11 13" />
        <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
      </>
    ),
    /** Sjablonen: twee blaadjes over elkaar, want een sjabloon maak je na. */
    template: (
      <>
        <path d="M9 4h7l3 3v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
        <path d="M16 4v3.5H19" />
        <path d="M15.5 17v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2" />
      </>
    ),
    /** Teksten: regels tekst, zoals in een alinea. */
    text: (
      <>
        <path d="M4.5 6h15" />
        <path d="M4.5 10.5h15" />
        <path d="M4.5 15h11" />
        <path d="M4.5 19.5h7" />
      </>
    ),
    /** Instellingen: schuifregelaars. Bij 16 pixels leest een tandwiel als vlek. */
    settings: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <path d="M9 7v0M15 12v0M7.5 17v0" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="7.5" cy="17" r="2" />
      </>
    ),
    /** Transportplanning: een week als raster, het beeld van de planning zelf. */
    planning: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 9.5h17" />
        <path d="M9 9.5V20M15 9.5V20" />
        <path d="M8 3.5v3M16 3.5v3" />
      </>
    ),
    /** Collect&Go: een winkelmandje; het is een bestelling en geen rit. */
    basket: (
      <>
        <path d="M4 9.5h16l-1.4 8.1a2 2 0 0 1-2 1.65H7.4a2 2 0 0 1-2-1.65Z" />
        <path d="m8.5 9.5 2.2-5M15.5 9.5l-2.2-5" />
        <path d="M10 13v3M14 13v3" />
      </>
    ),
    /**
     * Verwijderen: een vuilbak. Bewust niet het kruisje van `close`, want dat
     * betekent hier al "dit paneel toedoen"; twee betekenissen op één vorm is
     * precies de knop waar iemand per ongeluk op drukt.
     */
    trash: (
      <>
        <path d="M4.5 7h15" />
        <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
        <path d="M6.5 7l.8 11.1A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.9L17.5 7" />
        <path d="M10.5 11v5M13.5 11v5" />
      </>
    ),
    /** Flesserke: een fles. Stond op hetzelfde doosje als de inventaris. */
    chart: (
      <>
        <path d="M4 20h16" />
        <path d="M7 20v-6M12 20V6M17 20v-9" />
      </>
    ),
    bottle: (
      <>
        <path d="M10 3h4v3.2c0 .6.2 1.1.6 1.6l1.2 1.4c.4.5.7 1.1.7 1.8v8a2 2 0 0 1-2 2H9.5a2 2 0 0 1-2-2v-8c0-.7.2-1.3.7-1.8l1.2-1.4c.4-.5.6-1 .6-1.6Z" />
        <path d="M7.5 13.5h9" />
      </>
    ),
  } satisfies Record<IconName, ReactNode>;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
