"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import Link from "@/components/ui/Link";

export type ModuleTab = {
  href: string;
  label: string;
  /** Een icoon dat de server al rendert (`<CalendarDays size={15} />`): een functie kan niet naar de client. */
  icon: ReactNode;
  /** De segmenten direct onder de layout waarvoor dit tabblad actief is; `null` is de indexpagina. */
  segments: Array<string | null>;
};

/**
 * De tabbladen van een beheermodule, als pillen met een icoon: dezelfde huid als
 * die van een ticketevent en van Media (`.ticket-admin-tabs`). Echte links per
 * tabblad, actief volgens het segment onder de layout. Gebruik dit via
 * `ModuleAdminShell`, niet los.
 */
export function ModuleTabNav({ label, tabs }: { label: string; tabs: ModuleTab[] }) {
  const segment = useSelectedLayoutSegment() ?? null;
  return (
    <nav className="ticket-admin-tabs" aria-label={label}>
      {tabs.map((tab) => {
        const active = tab.segments.includes(segment);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
