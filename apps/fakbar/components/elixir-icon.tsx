import type { ReactNode, SVGProps } from 'react';

/**
 * Eén iconenset voor de hele fakbar-app, in de stijl van
 * `apps/logistiek/components/logistics-icon.tsx`: lijnpictogrammen op een
 * 24×24-raster die `currentColor` erven.
 *
 * Emoji zijn hier bewust weg. Ze zijn per platform een andere tekening, ze
 * negeren de tekstkleur, en een tabel met 🍺 in de kop leest als een chatbericht
 * en niet als een beheerscherm.
 */
type IconName =
  | 'beer'
  | 'bottle'
  | 'soda'
  | 'spirit'
  | 'menu'
  | 'photo'
  | 'venue'
  | 'dashboard'
  | 'calendar'
  | 'cash'
  | 'stock'
  | 'settings'
  | 'user'
  | 'clock'
  | 'mail'
  | 'arrow'
  | 'external'
  | 'check'
  | 'plus'
  | 'trash'
  | 'edit'
  | 'lock'
  | 'chevron'
  | 'bars';

export function ElixirIcon({ name, className, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    beer: (
      <>
        <path d="M7 8h9v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8Z" />
        <path d="M16 10.5h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 8a2.2 2.2 0 0 1 .6-3.2A2.4 2.4 0 0 1 11 4.4a2.3 2.3 0 0 1 3.6.5A2.2 2.2 0 0 1 16 8" />
      </>
    ),
    bottle: (
      <>
        <path d="M10 3h4v3.2l1.6 2.4a3 3 0 0 1 .4 1.6V19a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8.8a3 3 0 0 1 .4-1.6L10 6.2V3Z" />
        <path d="M8 13h8" />
      </>
    ),
    soda: (
      <>
        <path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z" />
        <path d="M6.4 11h11.2M12 3v4" />
      </>
    ),
    spirit: (
      <>
        <path d="M6.5 3h11l-1 6.4a4.6 4.6 0 0 1-4.5 3.8 4.6 4.6 0 0 1-4.5-3.8L6.5 3Z" />
        <path d="M12 13.2V20M8.5 20h7" />
      </>
    ),
    menu: (
      <>
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
        <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
      </>
    ),
    photo: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m3.6 16.5 4.2-4.2a2 2 0 0 1 2.8 0l3.1 3.1 1.6-1.6a2 2 0 0 1 2.8 0l2.3 2.3" />
        <circle cx="8.5" cy="9.5" r="1.3" />
      </>
    ),
    venue: (
      <>
        <path d="M3.5 10.5 12 4l8.5 6.5" />
        <path d="M5.5 12v8h13v-8" />
        <path d="M9.5 20v-5h5v5" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      </>
    ),
    cash: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M6 9.5v5M18 9.5v5" />
      </>
    ),
    stock: (
      <>
        <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4v-9Z" />
        <path d="m3.9 7.7 8.1 4 8.1-4M12 11.7v8.8" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M6.5 19.25v-.5c0-2.35 2.02-4.25 5.5-4.25s5.5 1.9 5.5 4.25v.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.2V12l3 1.8" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
        <path d="m3.6 7.5 7.3 5a2 2 0 0 0 2.2 0l7.3-5" />
      </>
    ),
    arrow: <path d="M4.5 12h14m-5.5-5.5L18.5 12 13 17.5" />,
    external: (
      <>
        <path d="M14 4.5h5.5V10" />
        <path d="M19.5 4.5 11 13" />
        <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
      </>
    ),
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    plus: <path d="M12 5.5v13M5.5 12h13" />,
    trash: (
      <>
        <path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
        <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
        <path d="M10.5 10v7M13.5 10v7" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8V20Z" />
        <path d="m14 6.5 3.5 3.5" />
      </>
    ),
    lock: (
      <>
        <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    bars: <path d="M4 7h16M4 12h16M4 17h16" />,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
