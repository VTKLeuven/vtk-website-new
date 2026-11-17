"use client";

import type { ReactNode } from "react";
import { useSearchParams, useSelectedLayoutSegments } from "next/navigation";
import Link from "@/components/ui/Link";

export type ModuleTab = {
  href: string;
  label: string;
  /** Een icoon dat de server al rendert (`<CalendarDays size={15} />`): een functie kan niet naar de client. */
  icon: ReactNode;
  /**
   * Waarvoor dit tabblad actief is: een segment direct onder de layout
   * (`"mijn"`), of een pad van meerdere (`"sjablonen/beheer"`) wanneer twee
   * tabbladen hetzelfde eerste segment delen. `null` is de indexpagina. Het
   * volledige pad gaat voor het eerste segment.
   */
  segments: Array<string | null>;
  /**
   * Actief wanneer geen ander tabblad past: voor een detailroute als `[id]`,
   * waarvan het segment de id zelf is en niet op voorhand te kennen.
   */
  fallback?: boolean;
};

/**
 * De tabbladen van een beheermodule, als pillen met een icoon: dezelfde huid als
 * die van een ticketevent en van Media (`.ticket-admin-tabs`). Echte links per
 * tabblad, actief volgens het segment onder de layout. Gebruik dit via
 * `ModuleAdminShell`, niet los.
 */
export function ModuleTabNav({
  label,
  tabs,
  preserveParams = [],
  variant = "tabs",
}: {
  label: string;
  tabs: ModuleTab[];
  /**
   * `tabs`: de rij onder de titel van een module. `sub`: een tweede, kleinere
   * rij binnen een tabblad (`.ticket-admin-subnav`), zoals Schermen en Mails
   * onder IT › Mails & schermen. Die zet je in de layout van dat tabblad.
   */
  variant?: "tabs" | "sub";
  /**
   * Queryparameters die meereizen naar elk tabblad, zoals `jaar`: wie in 25-26
   * van tabblad wisselt, hoort niet terug in het lopende jaar te belanden.
   */
  preserveParams?: string[];
}) {
  const below = useSelectedLayoutSegments();
  const full = below.length > 0 ? below.join("/") : null;
  const first = below[0] ?? null;
  const searchParams = useSearchParams();
  const carried = new URLSearchParams();
  for (const name of preserveParams) {
    const value = searchParams.get(name);
    if (value) carried.set(name, value);
  }
  const query = carried.size > 0 ? `?${carried.toString()}` : "";
  const current =
    tabs.find((tab) => tab.segments.includes(full)) ??
    tabs.find((tab) => tab.segments.includes(first)) ??
    tabs.find((tab) => tab.fallback);
  return (
    <nav className={variant === "sub" ? "ticket-admin-subnav" : "ticket-admin-tabs"} aria-label={label}>
      {tabs.map((tab) => {
        const active = tab === current;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${query}`}
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
