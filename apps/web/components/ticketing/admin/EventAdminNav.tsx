"use client";

import Link from "@/components/ui/Link";
import { useSelectedLayoutSegment } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  ExternalLink,
  LayoutDashboard,
  ScanLine,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import type { TicketCapability } from "@/lib/ticketing/authorization";
import { PrivateBadge, StatusBadge } from "./StatusBadge";
import { ticketBase, type AdminLocale } from "./format";

type EventSummary = {
  id: string;
  titleNl: string;
  titleEn: string | null;
  status: string;
  isPrivate: boolean;
};

export function EventAdminNav({
  event,
  shopLink,
  capabilities,
  locale,
}: {
  event: EventSummary;
  /** Zie `adminShopLink`: de echte pagina, via de privélink, of het voorbeeld. */
  shopLink: { path: string; live: boolean };
  capabilities: TicketCapability[];
  locale: AdminLocale;
}) {
  const selectedSegment = useSelectedLayoutSegment();
  const base = `${ticketBase(locale)}/admin/tickets/${event.id}`;
  const can = (capability: TicketCapability) => capabilities.includes(capability);
  const links = [
    {
      href: base,
      label: locale === "nl" ? "Overzicht" : "Overview",
      icon: LayoutDashboard,
      segment: null,
      visible: can("VIEW_EVENT"),
    },
    {
      href: `${base}/statistieken`,
      label: locale === "nl" ? "Statistieken" : "Statistics",
      icon: BarChart3,
      segment: "statistieken",
      visible: can("VIEW_REPORTS"),
    },
    {
      href: `${base}/instellingen`,
      label: locale === "nl" ? "Instellingen" : "Settings",
      icon: Settings2,
      segment: "instellingen",
      visible: can("MANAGE_EVENT") || can("MANAGE_INVENTORY"),
    },
    {
      href: `${base}/bestellingen`,
      label: locale === "nl" ? "Bestellingen" : "Orders",
      icon: ShoppingCart,
      segment: "bestellingen",
      visible: can("MANAGE_ORDERS") || can("VIEW_FINANCE"),
    },
    {
      href: `${base}/deelnemers`,
      label: locale === "nl" ? "Deelnemers" : "Attendees",
      icon: UsersRound,
      segment: "deelnemers",
      visible: can("VIEW_ATTENDEES"),
    },
    {
      href: `${base}/toegang`,
      label: locale === "nl" ? "Toegang" : "Access",
      icon: ShieldCheck,
      segment: "toegang",
      visible: can("MANAGE_ACCESS"),
    },
    {
      href: `/scan/${event.id}`,
      label: locale === "nl" ? "Scanner" : "Scanner",
      icon: ScanLine,
      segment: undefined,
      visible: can("SCAN"),
    },
  ].filter((link) => link.visible);

  return (
    <header className="ticket-admin-event-head">
      <div className="ticket-admin-event-title">
        <div>
          <Link className="ticket-admin-back" href={`${ticketBase(locale)}/admin/tickets`}>
            <ArrowLeft aria-hidden="true" size={14} />
            {locale === "nl" ? "Alle ticketevents" : "All ticket events"}
          </Link>
          <h1>{locale === "en" && event.titleEn ? event.titleEn : event.titleNl}</h1>
        </div>
        <div className="ticket-admin-event-actions">
          <span className="ticket-admin-badges">
            <StatusBadge status={event.status} locale={locale} />
            {event.isPrivate ? <PrivateBadge locale={locale} /> : null}
          </span>
          {/* Zolang het event niet live staat, bestaat de publieke pagina nog
              niet en gaf dit icoon een 404; dan opent het het voorbeeld. Een
              privé-event opent via de privélink (zie `adminShopLink`), een
              route die een cookie zet: vandaar een gewone link en geen
              client-navigatie. */}
          <a
            className="ticket-admin-icon-button"
            href={`${ticketBase(locale)}${shopLink.path}`}
            aria-label={
              shopLink.live
                ? locale === "nl" ? "Ticketshop openen" : "Open ticket shop"
                : locale === "nl" ? "Voorbeeld van de ticketpagina openen" : "Open the ticket page preview"
            }
            title={
              shopLink.live
                ? locale === "nl" ? "Ticketshop openen" : "Open ticket shop"
                : locale === "nl" ? "Voorbeeld van de ticketpagina" : "Ticket page preview"
            }
          >
            <ExternalLink aria-hidden="true" size={17} />
          </a>
        </div>
      </div>
      <nav className="ticket-admin-tabs" aria-label={locale === "nl" ? "Ticketevent" : "Ticket event"}>
        {links.map(({ icon: Icon, ...link }) => {
          const active =
            link.segment !== undefined && (selectedSegment ?? null) === link.segment;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "is-active" : undefined}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
