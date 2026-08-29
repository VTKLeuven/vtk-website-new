import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";

import "@/app/design/vtk-basic.css";

export const metadata: Metadata = {
  title: "Fakbar 't ElixIr huren | VTK Leuven",
  description:
    "Tarieven en voorwaarden om 't ElixIr, de fakbar van VTK, af te huren voor een cantus, een TD of een receptie.",
};

/**
 * De verhuurpagina van de fakbar op de hoofdsite.
 *
 * Twee dingen die hier eerder misgingen:
 *
 *  - **Het tarief stond hardgecodeerd**, hier én op /verhuur in de fakbar-app,
 *    allebei met "€250,00" en het academiejaar erin. Dat loopt binnen een jaar
 *    uiteen. Het komt nu uit `Setting["fakbar.rental"]`, dezelfde rij die de
 *    fakbar zelf beheert.
 *  - **De opmaak volgde het ontwerp niet**: `text-blue-600`, `bg-white`,
 *    `text-gray-900` en een eigen paginakop, terwijl elke andere pagina de
 *    donkere `.vtk-page-head` gebruikt (zie CLAUDE.md > Styling Guidelines).
 */

type Condition = { title: string; body: string };

const FALLBACK_FEE_CENTS = 25000;

function readRental(value: unknown): { feeCents: number; period: string; contactEmail: string; conditions: Condition[] } {
  const source = typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const text = (raw: unknown, fallback = "") =>
    typeof raw === "string" && raw.trim() !== "" ? raw.trim() : fallback;
  const fee = Number(source.feeCents);
  const conditions = Array.isArray(source.conditions)
    ? source.conditions.flatMap((row): Condition[] => {
        if (typeof row !== "object" || row === null) return [];
        const entry = row as Record<string, unknown>;
        const title = text(entry.title);
        const body = text(entry.body);
        return title || body ? [{ title, body }] : [];
      })
    : [];

  return {
    feeCents: Number.isInteger(fee) && fee >= 0 ? fee : FALLBACK_FEE_CENTS,
    period: text(source.period),
    contactEmail: text(source.contactEmail, "fakbar@vtk.be"),
    conditions,
  };
}

const DEFAULT_CONDITIONS: Record<"nl" | "en", Condition[]> = {
  nl: [
    {
      title: "Hoofdtapper",
      body: "Er staat altijd minstens één hoofdtapper van 't ElixIr mee achter de toog. Die kent het gebouw en de installatie en stelt de toog aan.",
    },
    { title: "Drank", body: "Alle drank loopt via het vaste assortiment van de fakbar. Eigen drank meebrengen kan niet." },
    {
      title: "Afrekening",
      body: "De effectieve omzet, de kratten en eventuele schade worden achteraf op de eindfactuur verrekend.",
    },
  ],
  en: [
    {
      title: "Head bartender",
      body: "At least one head bartender of 't ElixIr is always behind the bar. They know the building and the installation and set up the taps.",
    },
    { title: "Drinks", body: "All drinks come from the bar's own range. Bringing your own is not possible." },
    {
      title: "Settlement",
      body: "The actual turnover, the crates and any damage are settled afterwards on the final invoice.",
    },
  ],
};

export default async function FakbarHurenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";

  const row = await prisma.setting.findUnique({ where: { key: "fakbar.rental" } });
  const rental = readRental(row?.value);
  // De voorwaarden zijn door de fakbar in het Nederlands ingetikt; staat er
  // niets, dan vallen we terug op de vaste tekst in de taal van de bezoeker.
  const conditions = rental.conditions.length > 0 ? rental.conditions : DEFAULT_CONDITIONS[nl ? "nl" : "en"];
  const fee = new Intl.NumberFormat(nl ? "nl-BE" : "en-GB", { style: "currency", currency: "EUR" }).format(
    rental.feeCents / 100,
  );
  const subject = encodeURIComponent(nl ? "Aanvraag verhuur 't ElixIr" : "Rental request 't ElixIr");

  return (
    <div className="vtk-page vtk-basic">
      <header className="vtk-page-head">
        <div>
          <p className="vtk-page-kicker">VTK Leuven</p>
          <h1 className="vtk-page-title">{nl ? "Fakbar 't ElixIr huren" : "Renting fakbar 't ElixIr"}</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Kringen, werkgroepen en verenigingen kunnen 't ElixIr afhuren voor een cantus, een TD of een receptie."
              : "Student groups and associations can rent 't ElixIr for a cantus, a party or a reception."}
          </p>
        </div>
      </header>

      <div className="vtk-page-shell vtk-page-narrow">
        <div className="vtk-basic-section">
          <div className="vtk-basic-grid">
            <section className="vtk-basic-panel">
              <p className="vtk-basic-kicker">{nl ? "Huurprijs" : "Rate"}</p>
              <p className="vtk-basic-title">{fee}</p>
              {rental.period ? <p className="vtk-basic-copy">{rental.period}</p> : null}
            </section>

            <section className="vtk-basic-panel vtk-basic-panel-dark">
              <p className="vtk-basic-kicker">{nl ? "Een datum vastleggen" : "Booking a date"}</p>
              <p className="vtk-basic-copy">
                {nl
                  ? "Mail ons met je vereniging, de gewenste datum en het soort activiteit. We laten weten of die datum nog vrij is."
                  : "Email us with your association, the date you want and the kind of event. We will let you know whether that date is still free."}
              </p>
              <p className="vtk-basic-row" style={{ marginTop: 16 }}>
                <a
                  className="vtk-basic-button vtk-basic-button-accent"
                  href={`mailto:${rental.contactEmail}?subject=${subject}`}
                >
                  {nl ? "Aanvraag sturen" : "Send a request"}
                </a>
              </p>
            </section>
          </div>

          <section className="vtk-basic-panel">
            <p className="vtk-basic-kicker">{nl ? "Voorwaarden" : "Conditions"}</p>
            <dl className="vtk-basic-stack" style={{ marginTop: 12 }}>
              {conditions.map((condition) => (
                <div key={condition.title}>
                  <dt style={{ fontWeight: 600 }}>{condition.title}</dt>
                  <dd className="vtk-basic-copy" style={{ margin: "4px 0 0" }}>
                    {condition.body}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
