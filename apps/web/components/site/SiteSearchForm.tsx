import { Search } from "lucide-react";
import { getDictionary, type Locale } from "@vtk/i18n";
import { MAX_QUERY_LENGTH } from "@/lib/search";

/**
 * Het zoekveld: in het uitklapmenu van de sitekop en in de kop van /zoeken.
 *
 * Bewust een gewoon GET-formulier en geen client component: de browser zet de
 * zoekterm zelf in de URL en de resultatenpagina rendert op de server. Daardoor
 * is een zoekresultaat deelbaar, herlaadbaar en werkt de terugknop; een
 * zoekveld met eigen state zou dat alle drie kapotmaken en er JavaScript voor
 * nodig hebben.
 *
 * `maxLength` komt uit dezelfde constante als de server: afkappen gebeurt
 * sowieso in `normalizeQuery`, maar het is vriendelijker om de bezoeker niet
 * eerst honderden tekens te laten typen die toch wegvallen.
 */
export function SiteSearchForm({
  locale,
  defaultValue = "",
  autoFocus = false,
}: {
  locale: Locale;
  defaultValue?: string;
  /**
   * Enkel op /zoeken zonder zoekterm: wie daar aankomt, komt om te typen. Met
   * een zoekterm blijft de focus weg, anders springt het scherm naar het veld
   * in plaats van naar de resultaten die er net gerenderd zijn.
   */
  autoFocus?: boolean;
}) {
  const t = getDictionary(locale).search;
  const base = locale === "nl" ? "" : "/en";

  return (
    <form
      className="vtk-search-form"
      action={`${base}/zoeken`}
      method="get"
      role="search"
      aria-label={t.formLabel}
    >
      <Search className="vtk-search-icon" size={17} aria-hidden="true" />
      <input
        className="vtk-search-input"
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={t.placeholder}
        aria-label={t.inputLabel}
        maxLength={MAX_QUERY_LENGTH}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      <button type="submit" className="vtk-search-submit">
        {t.submit}
      </button>
    </form>
  );
}
