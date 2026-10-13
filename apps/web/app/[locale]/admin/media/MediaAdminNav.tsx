"use client";

import Link from "@/components/ui/Link";
import { useSelectedLayoutSegment } from "next/navigation";
import { BookOpen, Clapperboard, Flag, Images } from "lucide-react";

/**
 * De tabbladen van het mediabeheer, op dezelfde manier gebouwd als die van een
 * ticketevent (`EventAdminNav`): echte links per tabblad, actief volgens het
 * segment onder deze layout.
 *
 * Foto's hangt in de route-groep `(fotos)`, zodat de albumlijst links blijft
 * staan wanneer je rechts een ander album opent; dat segment is dus "(fotos)",
 * voor het overzicht, een album en de prullenmand.
 */
export function MediaAdminNav({
  locale,
  canManageMedia,
  openTakedowns,
}: {
  locale: string;
  canManageMedia: boolean;
  openTakedowns: number;
}) {
  const segment = useSelectedLayoutSegment();
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/media`;

  const links: Array<{
    href: string;
    label: string;
    icon: typeof Images;
    segments: Array<string | null>;
    visible: boolean;
    count?: number;
  }> = [
    { href: base, label: nl ? "Foto's" : "Photos", icon: Images, segments: ["(fotos)", null], visible: true },
    {
      href: `${base}/magazines`,
      label: "Magazines",
      icon: BookOpen,
      segments: ["magazines"],
      visible: canManageMedia,
    },
    {
      href: `${base}/aftermovies`,
      label: "Aftermovies",
      icon: Clapperboard,
      segments: ["aftermovies"],
      visible: canManageMedia,
    },
    {
      href: `${base}/verwijderverzoeken`,
      label: nl ? "Verwijderverzoeken" : "Takedown requests",
      icon: Flag,
      segments: ["verwijderverzoeken"],
      visible: canManageMedia,
      count: openTakedowns,
    },
  ].filter((link) => link.visible);

  return (
    <nav className="ticket-admin-tabs" aria-label="Media">
      {links.map(({ icon: Icon, ...link }) => {
        const active = link.segments.includes(segment ?? null);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
            {link.label}
            {link.count ? (
              <span
                className="media-admin-tab-count"
                aria-label={nl ? `${link.count} te behandelen` : `${link.count} to handle`}
              >
                {link.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
