import type { ReactNode, SVGProps } from 'react';

type IconName =
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
  | 'chevron';

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
    car: (
      <>
        <path d="M4.5 16.5v-3l1.9-4.2A2 2 0 0 1 8.2 8h7.6a2 2 0 0 1 1.8 1.3l1.9 4.2v3" />
        <path d="M4.5 13.5h15" />
        <path d="M8.5 18a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM15.5 18a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
      </>
    ),
    cargobike: (
      <>
        <path d="M5.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="M3 15.5V11a1 1 0 0 1 1-1h5.5v5" />
        <path d="m9.5 10.5 6 6M13.5 9h3" />
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
    external: (
      <>
        <path d="M14 4h6v6" />
        <path d="M20 4 11 13" />
        <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
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
