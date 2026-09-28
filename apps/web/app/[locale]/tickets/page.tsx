import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { ArrowRight, TicketCheck } from "lucide-react";
import { listPublishedTicketEvents } from "@/lib/ticketing/queries";
import { hasLocale } from "@/lib/locale";
import { TicketEventCard, ticketEventState } from "@/components/ticketing/public/TicketEventCard";
import type { PublicTicketEvent } from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";
import "@/app/design/vtk-ticket-catalog.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("tickets", "/tickets", locale);
}

type Filter = "open" | "soon" | "all";

/** De filter uit de URL; alles wat we niet kennen, is "nu te koop". */
function filterFrom(raw: string | string[] | undefined): Filter {
  if (raw === "binnenkort") return "soon";
  if (raw === "alles") return "all";
  return "open";
}

const FILTER_PARAM: Record<Filter, string | null> = { open: null, soon: "binnenkort", all: "alles" };

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const filter = filterFrom((await searchParams).filter);
  const events = (await listPublishedTicketEvents(locale, { overview: true })) as PublicTicketEvent[];
  const inFilter = (event: PublicTicketEvent, which: Filter) =>
    which === "all" || ticketEventState(event) === which;
  const shown = events.filter((event) => inFilter(event, filter));
  const hint = events.find((event) => event.memberPriceHint)?.memberPriceHint ?? null;
  const loginHref = `${base}/inloggen?next=${encodeURIComponent(`${base}/tickets`)}`;
  const filters: Array<{ key: Filter; label: string }> = [
    { key: "open", label: nl ? "Nu te koop" : "On sale now" },
    { key: "soon", label: nl ? "Binnenkort" : "Coming soon" },
    { key: "all", label: nl ? "Alles" : "All" },
  ];

  return (
    <div className="vtk-page vtk-tickets-page">
      {/* Dezelfde paginakop als de categorie- en contentpagina's (vtk-base.css),
          zodat /tickets geen eigen aanhef meer heeft. */}
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">Tickets</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Tickets voor cantussen, galabals en andere VTK-events."
              : "Tickets for cantuses, galas and other VTK events."}
          </p>
        </div>
        <Link href={`${base}/account#mijn-vtk-tickets`} className="tcat-mine">
          <TicketCheck size={18} aria-hidden="true" />
          {nl ? "Mijn tickets" : "My tickets"}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>

      <main className="tcat-shell">
        {/* Links en geen knoppen: een filter hoort in de URL, zodat je "wat
            binnenkort komt" kan doorsturen en de pagina zonder JavaScript werkt. */}
        <nav className="tcat-filters" aria-label={nl ? "Filter de events" : "Filter the events"}>
          {filters.map((option) => {
            const param = FILTER_PARAM[option.key];
            return (
              <Link
                key={option.key}
                href={param ? `${base}/tickets?filter=${param}` : `${base}/tickets`}
                aria-current={filter === option.key ? "page" : undefined}
                scroll={false}
              >
                {option.label}
                <span>{events.filter((event) => inFilter(event, option.key)).length}</span>
              </Link>
            );
          })}
        </nav>

        {shown.length > 0 ? (
          <>
            <ul className="tcat-list">
              {shown.map((event) => (
                <TicketEventCard key={event.id} event={event} locale={locale} />
              ))}
            </ul>
            {hint ? (
              <p className="tcat-hint">
                {hint === "login" ? (
                  <>
                    {nl ? "Lid van VTK? " : "VTK member? "}
                    <Link href={loginHref}>{nl ? "Log in voor de ledenprijzen." : "Sign in for member prices."}</Link>
                  </>
                ) : (
                  <>
                    {nl ? "Leden betalen minder. " : "Members pay less. "}
                    <Link href={`${base}/lidmaatschap`}>{nl ? "Word lid." : "Become a member."}</Link>
                  </>
                )}
              </p>
            ) : null}
          </>
        ) : (
          <section className="tcat-empty">
            <TicketCheck size={28} aria-hidden="true" />
            <h2>
              {filter === "soon"
                ? nl ? "Er komt voorlopig niets aan" : "Nothing coming up yet"
                : nl ? "Momenteel geen ticketverkoop" : "No tickets on sale right now"}
            </h2>
            <p>
              {filter === "open" && events.length > 0
                ? nl
                  ? "De verkoop van de volgende events opent binnenkort."
                  : "Sales for the next events open soon."
                : nl
                  ? "Nieuwe events verschijnen hier zodra ze gepubliceerd zijn."
                  : "New events appear here once they are published."}
            </p>
            {filter === "open" && events.length > 0 ? (
              <Link href={`${base}/tickets?filter=binnenkort`} className="ticket-secondary-button">
                {nl ? "Bekijk wat binnenkort komt" : "See what is coming"} <ArrowRight size={17} aria-hidden="true" />
              </Link>
            ) : (
              <Link href={`${base}/kalender`} className="ticket-secondary-button">
                {nl ? "Bekijk de kalender" : "View calendar"} <ArrowRight size={17} aria-hidden="true" />
              </Link>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
