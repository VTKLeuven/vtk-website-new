import type { ReactNode, SVGProps } from 'react';

type IconName = 'material' | 'van' | 'reservation' | 'check';

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
    reservation: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M8 2.5v3M16 2.5v3M5 9h14M8.5 13h2M13.5 13h2M8.5 17h2" />
      </>
    ),
    check: <path d="m5 12 4.25 4.25L19 6.5" />,
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
