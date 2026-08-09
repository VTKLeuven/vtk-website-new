import Link from "next/link";
import { getDictionary, type Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";

/**
 * De 404 in de huisstijl: dezelfde donkere paginakop als elke andere pagina, en
 * daaronder de wegen terug.
 *
 * Gedeeld door `app/[locale]/not-found.tsx` (het gros van de gevallen: een
 * `notFound()` in een segment onder de taal) en `app/not-found.tsx` (een adres
 * dat op geen enkele route valt). Twee bestanden, één scherm; een 404 die er per
 * inslagpunt anders uitziet is een 404 die niemand onderhoudt.
 */
export function NotFoundView({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).notFound;
  const base = locale === "nl" ? "" : "/en";

  // Wegen terug. Bewust drie en niet meer: de homepage voor wie gewoon verdwaald
  // is, /info voor wie een oude infopagina zocht, en de kalender voor wie op een
  // afgelopen evenement landde. Dat zijn de drie dingen waar oud verkeer op
  // uitkomt.
  const ways = [
    { href: base || "/", title: t.homeTitle, lead: t.homeLead },
    { href: `${base}/info`, title: t.infoTitle, lead: t.infoLead },
    { href: `${base}/kalender`, title: t.calendarTitle, lead: t.calendarLead },
  ];

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">{t.kicker}</div>
          <h1 className="vtk-page-title">{t.title}</h1>
          <p className="vtk-page-subtitle">{t.lead}</p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <p className="mb-8 max-w-[70ch] text-sm leading-6 text-[#34405e]">
          {t.body}{" "}
          <a className="vtk-link" href="mailto:info@vtk.be">
            info@vtk.be
          </a>
          .
        </p>

        <ul className="vtk-card-grid">
          {ways.map((way) => (
            <li key={way.href}>
              <Link href={way.href}>
                <Card className="vtk-card h-full">
                  <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
                    {way.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#34405e]">{way.lead}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
