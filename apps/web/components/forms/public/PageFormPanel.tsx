import { pick } from "@vtk/i18n";
import { FormBody, formStatusLine } from "@/components/forms/public/FormBody";
import { FORM_ANCHOR } from "@/lib/pageForm";
import type { FormSurface } from "@/lib/forms/surface";

/**
 * Het formulier als paneel in een contentpagina.
 *
 * Uitgelicht met een gele accentrail op een witte kaart: hetzelfde materiaal dat
 * de huisstijl al voor een uitgelichte kaart gebruikt (zie de Styling
 * Guidelines). Het staat in de leesvolgorde van de pagina en tegelijk duidelijk
 * apart, zodat het niet als een alinea leest maar ook niet als een banner die
 * er los overheen ligt.
 *
 * De titel is een H2 op ankernaam `formulier`, want de rail springt ernaartoe.
 */
export function PageFormPanel({
  surface,
  pageHref,
  justSubmitted,
}: {
  surface: FormSurface;
  /** Het adres van de pagina zelf; de bezoeker blijft er na het versturen op. */
  pageHref: string;
  justSubmitted: { duplicate: boolean; waitlisted: boolean } | null;
}) {
  const { form, locale } = surface;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const title = pick(form.titleNl, form.titleEn, locale);
  const status = formStatusLine(surface);

  return (
    <section className="vtk-page-form" id={FORM_ANCHOR} aria-labelledby={`${FORM_ANCHOR}-titel`}>
      <div className="vtk-page-form-head">
        <h2 id={`${FORM_ANCHOR}-titel`}>{title}</h2>
        {status ? <p className="vtk-page-form-status">{status}</p> : null}
      </div>

      <div className="vtk-page-form-body">
        <FormBody
          surface={surface}
          showDeadline={false}
          successHref={`${pageHref}?formulier=verstuurd#${FORM_ANCHOR}`}
          privacyUrl={`${base}/privacy`}
          loginHref={`${base}/inloggen?next=${encodeURIComponent(`${pageHref}#${FORM_ANCHOR}`)}`}
          // De taalwissel gebeurt op de pagina zelf, niet op het formulier: het
          // formulier staat hier te gast.
          otherLocaleHref={otherLocale(pageHref, nl)}
          justSubmitted={justSubmitted}
        />
      </div>
    </section>
  );
}

/** Hetzelfde pad in de andere taal, met het anker van het paneel erachter. */
function otherLocale(pageHref: string, nl: boolean): string {
  const path = nl ? `/en${pageHref}` : pageHref.replace(/^\/en/, "");
  return `${path}#${FORM_ANCHOR}`;
}
