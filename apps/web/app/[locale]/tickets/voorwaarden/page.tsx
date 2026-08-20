import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/ui/Markdown";
import { hasLocale } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";
import { getTicketTerms } from "@/lib/ticketing/terms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return buildMetadata({
    title: locale === "nl" ? "Ticketvoorwaarden" : "Ticket terms",
    description:
      locale === "nl"
        ? "De algemene voorwaarden voor tickets die via VTK worden aangeboden."
        : "The general terms for tickets offered through VTK.",
    path: "/tickets/voorwaarden",
    locale,
  });
}

export default async function TicketTermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale = localeParam;
  const terms = await getTicketTerms();

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · Tickets</div>
          <h1 className="vtk-page-title">
            {locale === "nl" ? "Ticketvoorwaarden" : "Ticket terms"}
          </h1>
          <p className="vtk-page-subtitle">
            {locale === "nl"
              ? "Algemene afspraken voor bestellingen via de VTK-ticketshop."
              : "General arrangements for orders through the VTK ticket shop."}
          </p>
        </div>
      </header>
      <main className="vtk-page-shell vtk-page-narrow">
        <article className="vtk-card prose-vtk max-w-none p-6 sm:p-8">
          <Markdown>{locale === "nl" ? terms.bodyNl : terms.bodyEn}</Markdown>
          <p className="mt-8 border-t border-vtk-blue/10 pt-4 text-xs text-vtk-muted">
            {locale === "nl" ? "Versie" : "Version"}: {terms.version}
          </p>
        </article>
      </main>
    </div>
  );
}
