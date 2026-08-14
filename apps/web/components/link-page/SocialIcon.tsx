import type { SocialPlatform } from "@/lib/link-page";

type IconProps = {
  platform: SocialPlatform;
  className?: string;
};

/** Compacte, dependencyvrije merktekens voor de vaste kanalen op de linkpagina. */
export function SocialIcon({ platform, className }: IconProps) {
  if (platform === "instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (platform === "facebook") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M13.8 22v-8.6h2.9l.43-3.35H13.8V7.91c0-.97.27-1.63 1.66-1.63h1.77v-3a24 24 0 0 0-2.58-.13c-2.56 0-4.31 1.56-4.31 4.43v2.47H7.45v3.35h2.89V22h3.46Z" />
      </svg>
    );
  }

  if (platform === "youtube") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M21.2 7.1a2.8 2.8 0 0 0-2-2C17.45 4.6 12 4.6 12 4.6s-5.45 0-7.2.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2.3 12a29 29 0 0 0 .5 4.9 2.8 2.8 0 0 0 2 2c1.75.5 7.2.5 7.2.5s5.45 0 7.2-.5a2.8 2.8 0 0 0 2-2 29 29 0 0 0 .5-4.9 29 29 0 0 0-.5-4.9Z" fill="currentColor" />
        <path d="m10 15.2 5-3.2-5-3.2v6.4Z" fill="white" />
      </svg>
    );
  }

  if (platform === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M5.36 7.73A2.12 2.12 0 1 0 5.36 3.5a2.12 2.12 0 0 0 0 4.23ZM3.53 20.5h3.66V9.26H3.53V20.5ZM9.37 9.26h3.5v1.54h.05c.49-.92 1.68-1.9 3.46-1.9 3.7 0 4.39 2.44 4.39 5.61v5.99h-3.65v-5.31c0-1.27-.03-2.9-1.77-2.9-1.77 0-2.04 1.38-2.04 2.8v5.41H9.66V9.26h-.29Z" />
      </svg>
    );
  }

  if (platform === "email") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M15 4v11.2a4 4 0 1 1-3-3.87V7.1c2.8 2.04 5 2.45 7 2.45V6.1C17.3 6.1 15.9 5.25 15 4Z" />
    </svg>
  );
}
