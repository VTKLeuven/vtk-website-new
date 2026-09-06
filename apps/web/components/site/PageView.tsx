import Image from "next/image";
import Link from "next/link";
import {
  DOWNLOAD_EVENT,
  OUTBOUND_EVENT,
  PAGE_CTA_EVENT,
  outboundHost,
  umamiEvent,
} from "@/lib/analytics";
import { isExternalUrl, withLocaleBase } from "@/lib/href";
import { publicUrl } from "@/lib/storage";
import { revealWords } from "@/lib/revealWords";
import { renderTiptap } from "@/lib/tiptap-render";
import { Markdown } from "@/components/ui/Markdown";
import { PageOutline } from "@/components/site/PageOutline";
import { PageFormPanel } from "@/components/forms/public/PageFormPanel";
import { formRailMeta } from "@/components/forms/public/FormBody";
import { loadPublicForm } from "@/lib/forms/publicForm";
import { buildFormSurface } from "@/lib/forms/surface";
import { FORM_ANCHOR, splitOnFormMarker, stripFormMarker } from "@/lib/pageForm";
import { outlineFromMarkdown, outlineFromTiptap, type OutlineItem } from "@/lib/pageOutline";
import { pick, type Locale } from "@vtk/i18n";
import type { HeaderTab, Page, PageAsset } from "@prisma/client";

import "@/app/design/vtk-forms.css";
import "@/app/design/vtk-motion.css";

/**
 * De inhoud voor de gevraagde taal, als bron in plaats van als gerenderde boom.
 *
 * Markdown is de bron van waarheid: zodra een taal een markdown-waarde heeft
 * (ook een lege), telt het legacy tiptap-JSON niet meer. Een taal zonder eigen
 * versie valt terug op NL.
 */
type PageContent = { kind: "markdown"; markdown: string } | { kind: "tiptap"; doc: unknown };

function contentFor(page: Page, locale: Locale): PageContent {
  if (locale === "en") {
    if (page.contentMdEn !== null) return { kind: "markdown", markdown: page.contentMdEn };
    if (page.contentJsonEn) return { kind: "tiptap", doc: page.contentJsonEn };
    // Geen Engelse versie: val terug op NL.
  }
  if (page.contentMdNl !== null) return { kind: "markdown", markdown: page.contentMdNl };
  return { kind: "tiptap", doc: page.contentJsonNl };
}

export type PageViewPage = Page & {
  assets: PageAsset[];
  headerTab?: HeaderTab | null;
  /** Het formulier dat in deze pagina staat, als er een gekoppeld is. */
  form?: { slug: string } | null;
};

export async function PageView({
  page,
  locale,
  downloadsLabel,
  onThisPageLabel,
  searchParams,
  /** Het adres van deze pagina, waar het formulier na het versturen op terugkomt. */
  pagePath,
}: {
  page: PageViewPage;
  locale: Locale;
  downloadsLabel: string;
  onThisPageLabel: string;
  /**
   * De queryparameters van de route. Enkel uitgelezen wanneer er een formulier
   * op de pagina staat: `?veld=waarde` vult dat veld voor, en
   * `?formulier=verstuurd` toont de bedanking. Zonder formulier blijft de
   * promise ongeopend, zodat de pagina niet nodeloos dynamisch wordt.
   */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  pagePath: string;
}) {
  const base = locale === "nl" ? "" : "/en";
  const downloads = page.assets.filter((a) => a.kind === "DOWNLOAD");
  const title = pick(page.titleNl, page.titleEn, locale);
  const excerpt = pick(page.excerptNl ?? "", page.excerptEn ?? "", locale);
  const tab = page.headerTab ?? null;
  // Dezelfde foto als op de kaart van de categoriepagina. De donkere band blijft
  // de kop van de site; ze krijgt hier enkel een beeld achter het scrim, zodat
  // een pagina herkenbaar is zonder een tweede soort paginakop te worden.
  const headPhoto = publicUrl(page.imageKey);
  // Knop naast de titel, net als op de categoriepagina. Zonder label of zonder
  // adres is er geen knop: een knop zonder bestemming is een dode klik.
  const ctaLabel = pick(page.ctaLabelNl ?? "", page.ctaLabelEn ?? "", locale);
  const showCta = Boolean(ctaLabel && page.ctaUrl);
  // Wijst de knop naar deze site, dan moet ze in dezelfde taal blijven.
  const ctaHref = page.ctaUrl ? withLocaleBase(page.ctaUrl, base) : "";

  // Een concept of een gearchiveerd formulier laat het paneel weg in plaats van
  // de hele pagina te weigeren: de tekst eromheen hoort er gewoon te staan. Wie
  // het formulier beheert, ziet het concept wel, met de voorbeeldmelding erbij.
  const linked = page.form ? await loadPublicForm(page.form.slug) : null;
  const query = linked && searchParams ? await searchParams : {};
  const surface = linked ? await buildFormSurface(linked, locale, query) : null;
  const formPanel =
    surface && linked && linked.status !== "ARCHIVED" && (linked.status !== "DRAFT" || surface.canPreview)
      ? surface
      : null;

  const content = contentFor(page, locale);
  // De markering bepaalt waar het paneel komt; staat ze er niet, dan komt het
  // onderaan. Zonder gekoppeld formulier verdwijnt ze gewoon uit de tekst.
  const split =
    content.kind === "markdown"
      ? formPanel
        ? splitOnFormMarker(content.markdown)
        : { before: stripFormMarker(content.markdown), after: null }
      : { before: "", after: null };

  const headings: OutlineItem[] =
    content.kind === "markdown"
      ? [
          ...outlineFromMarkdown(split.before),
          ...(split.after !== null ? outlineFromMarkdown(split.after) : []),
        ]
      : outlineFromTiptap(content.doc);
  // Het formulier staat in de rail op de plaats waar het in de tekst staat.
  const formIndex =
    content.kind === "markdown" && split.after !== null
      ? outlineFromMarkdown(split.before).length
      : headings.length;

  // Eén kopje is geen inhoudsopgave maar een herhaling van de titel; vanaf twee
  // wordt de rail nuttig. Een formulier zet ze altijd aan: dat er iets in te
  // vullen valt, is het eerste wat de bezoeker mag weten.
  const showOutline = headings.length >= 2;
  const showRail = showOutline || downloads.length > 0 || formPanel !== null;

  const railForm = formPanel
    ? {
        id: FORM_ANCHOR,
        label: pick(formPanel.form.titleNl, formPanel.form.titleEn, locale),
        meta: formRailMeta(formPanel),
        closed: formPanel.blocked,
      }
    : null;

  const panel = formPanel ? (
    <PageFormPanel
      surface={formPanel}
      pageHref={pagePath}
      justSubmitted={
        query.formulier === "verstuurd"
          ? { duplicate: query.dubbel === "1", waitlisted: query.wachtlijst === "1" }
          : null
      }
    />
  ) : null;

  return (
    <div className="vtk-page">
      {/* Leesvoortgang in de accentkleur, strak onder de sitekop. Decoratief:
          de scrollbalk zegt hetzelfde, dus een screenreader hoeft dit niet. */}
      <div className="vtk-read-progress" aria-hidden="true" />
      <header className={`vtk-page-head${headPhoto ? " has-photo" : ""}`}>
        {headPhoto ? (
          // Decoratief: de titel ernaast zegt al waar je bent, dus een alt-tekst
          // zou de kop enkel twee keer voorlezen.
          <div className="vtk-page-head-photo" aria-hidden="true">
            <Image src={headPhoto} alt="" fill priority sizes="100vw" />
          </div>
        ) : null}
        <div>
          {tab ? (
            <div className="vtk-page-kicker">
              <Link href={`${base}/${tab.slug}`} className="vtk-crumb">
                {pick(tab.labelNl, tab.labelEn, locale)}
              </Link>
              <span aria-hidden="true"> › </span>
              <span>{title}</span>
            </div>
          ) : null}
          <h1 className="vtk-page-title">{revealWords(title)}</h1>
          {excerpt ? <p className="vtk-page-subtitle">{excerpt}</p> : null}
        </div>
        {showCta ? (
          <div>
            <a
              href={ctaHref}
              className="vtk-button vtk-button-primary arrow"
              {...(isExternalUrl(ctaHref)
                ? umamiEvent(OUTBOUND_EVENT, {
                    bestemming: outboundHost(ctaHref),
                    vanaf: `pagina:${page.slug}`,
                  })
                : umamiEvent(PAGE_CTA_EVENT, { pagina: page.slug, naar: ctaHref }))}
            >
              {ctaLabel}
            </a>
          </div>
        ) : null}
      </header>

      <div className={`vtk-page-shell vtk-page-body${showRail ? " has-rail" : ""}`}>
        {/* `vtk-motion` zet de scroll-animaties aan. Bewust op deze container en
            niet op elke `.prose-vtk`: in het voorbeeldvenster van de editor zit
            de tekst in een eigen scrollcontainer, waar een `view()`-tijdlijn een
            kopje halverwege zijn animatie kan laten staan. */}
        <div className="vtk-page-content vtk-motion">
          {content.kind === "markdown" ? (
            <>
              <article className="prose-vtk">
                <Markdown revealHeadings>{split.before}</Markdown>
              </article>
              {split.after !== null ? panel : null}
              {split.after ? (
                <article className="prose-vtk">
                  <Markdown revealHeadings>{split.after}</Markdown>
                </article>
              ) : null}
            </>
          ) : (
            <article className="prose-vtk">{renderTiptap(content.doc)}</article>
          )}
          {split.after === null ? panel : null}
        </div>

        {showRail ? (
          <aside className="vtk-page-rail">
            {showOutline || railForm ? (
              <PageOutline
                items={headings}
                label={onThisPageLabel}
                form={railForm}
                formIndex={formIndex}
              />
            ) : null}

            {downloads.length > 0 ? (
              <section className="vtk-rail-box vtk-rail-downloads">
                <h2>{downloadsLabel}</h2>
                <ul>
                  {downloads.map((a) => {
                    const href = publicUrl(a.storageKey);
                    if (!href) return null;
                    return (
                      <li key={a.id}>
                        <a
                          href={href}
                          download
                          {...umamiEvent(DOWNLOAD_EVENT, {
                            pagina: page.slug,
                            bestand: pick(a.labelNl, a.labelEn, locale),
                          })}
                        >
                          {pick(a.labelNl, a.labelEn, locale)}
                          {a.sizeBytes ? (
                            <span className="vtk-rail-meta">
                              {" "}
                              ({(a.sizeBytes / 1024 / 1024).toFixed(1)} MB)
                            </span>
                          ) : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
