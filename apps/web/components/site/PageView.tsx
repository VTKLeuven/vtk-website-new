import type { CSSProperties } from "react";
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
import { focusPosition } from "@/lib/imageFocus";
import { renderTiptap } from "@/lib/tiptap-render";
import { Markdown } from "@/components/ui/Markdown";
import { PageOutline } from "@/components/site/PageOutline";
import { PageFormPanel } from "@/components/forms/public/PageFormPanel";
import { formRailMeta } from "@/components/forms/public/FormBody";
import { loadPublicForm } from "@/lib/forms/publicForm";
import { buildFormSurface } from "@/lib/forms/surface";
import { loadDefaultEventImage } from "@/lib/pageQueries";
import {
  loadSiblingPages,
  loadWerkingEvents,
  loadWerkingGroup,
  type WerkingEvent,
} from "@/lib/pageWerking";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { FORM_ANCHOR, splitOnFormMarker, stripFormMarker } from "@/lib/pageForm";
import { outlineFromMarkdown, outlineFromTiptap, type OutlineItem } from "@/lib/pageOutline";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import type { HeaderTab, Page, PageAsset } from "@prisma/client";

import "@/app/design/vtk-forms.css";
import "@/app/design/vtk-page.css";

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
  const dict = getDictionary(locale);
  const t = dict.pages;
  const readMore = dict.home.readMore;
  const downloads = page.assets.filter((a) => a.kind === "DOWNLOAD");
  const title = pick(page.titleNl, page.titleEn, locale);
  const excerpt = pick(page.excerptNl ?? "", page.excerptEn ?? "", locale);
  const tab = page.headerTab ?? null;
  // Knop naast de titel, net als op de categoriepagina. Zonder label of zonder
  // adres is er geen knop: een knop zonder bestemming is een dode klik.
  const ctaLabel = pick(page.ctaLabelNl ?? "", page.ctaLabelEn ?? "", locale);
  const showCta = Boolean(ctaLabel && page.ctaUrl);
  // Wijst de knop naar deze site, dan moet ze in dezelfde taal blijven.
  const ctaHref = page.ctaUrl ? withLocaleBase(page.ctaUrl, base) : "";

  // De werking achter deze pagina, de andere pagina's uit haar categorie en de
  // standaardfoto voor evenementen zonder eigen cover. Alle drie optioneel: een
  // pagina zonder post en zonder categorie haalt niets extra op en blijft de
  // pagina die ze vandaag is.
  const [group, events, siblings, defaultEventImage] = await Promise.all([
    page.groupId ? loadWerkingGroup(page.groupId) : null,
    page.groupId ? loadWerkingEvents(page.groupId) : [],
    page.headerTabId ? loadSiblingPages(page.headerTabId, page.id) : [],
    page.groupId ? loadDefaultEventImage() : null,
  ]);
  const groupName = group ? pick(group.nameNl, group.nameEn, locale) : "";
  const tabLabel = tab ? pick(tab.labelNl, tab.labelEn, locale) : "";

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
  const editedAt = page.contentEditedAt;
  // Hangt de pagina aan een post, dan draagt de kolom naast de tekst meer dan
  // een register en krijgt ze de volle breedte tot aan de rand. Zonder post
  // blijft ze de smalle rail die ze altijd was.
  const hasWerkingRail = group !== null;
  // De datum zet de kolom niet zelf aan: een rail met enkel "laatst bijgewerkt"
  // erin is een kolom om niets. Ze rijdt mee zodra er al iets anders staat.
  const showRail = showOutline || downloads.length > 0 || formPanel !== null || hasWerkingRail;

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

  // De foto van de pagina draagt de kop; zonder foto blijft het technische
  // patroon uit de huisstijl staan. `encodeURI` omdat de sleutel uit de admin
  // komt en hier in een `url()` belandt.
  const headPhoto = publicUrl(page.imageKey);
  const headStyle = headPhoto
    ? ({ "--page-head-photo": `url("${encodeURI(headPhoto)}")` } as CSSProperties)
    : undefined;

  // Staat er onder de tekst nog iets, dan mag de staartpadding van de tekstkolom
  // krimpen: de band sluit de pagina af in plaats van de lege ruimte.
  const hasBands =
    events.length > 0 || (group !== null && group.members.length > 0) || siblings.length > 0;

  const upcomingLabel =
    events.length === 1
      ? t.upcomingCountOne
      : t.upcomingCount.replace("{count}", String(events.length));

  return (
    <div className="vtk-page">
      <header className={`vtk-page-head${headPhoto ? " has-photo" : ""}`} style={headStyle}>
        <div>
          {tab ? (
            <div className="vtk-page-kicker">
              <Link href={`${base}/${tab.slug}`} className="vtk-crumb">
                {tabLabel}
              </Link>
              <span aria-hidden="true"> › </span>
              <span>{title}</span>
            </div>
          ) : null}
          <h1 className="vtk-page-title">{title}</h1>
          {excerpt ? <p className="vtk-page-subtitle">{excerpt}</p> : null}
          {group ? (
            <div className="vtk-page-headline">
              <span>
                <Link href={`${base}/praesidium#post-${group.slug}`}>{groupName}</Link>
              </span>
              {events.length > 0 ? <span>{upcomingLabel}</span> : null}
            </div>
          ) : null}
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

      <div
        className={`vtk-page-shell vtk-page-body${
          showRail ? (hasWerkingRail ? " has-rail has-side" : " has-rail") : ""
        }${hasBands ? " has-bands" : ""}`}
      >
        <div className="vtk-page-content">
          {content.kind === "markdown" ? (
            <>
              <article className="prose-vtk">
                <Markdown>{split.before}</Markdown>
              </article>
              {split.after !== null ? panel : null}
              {split.after ? (
                <article className="prose-vtk">
                  <Markdown>{split.after}</Markdown>
                </article>
              ) : null}
            </>
          ) : (
            <article className="prose-vtk">{renderTiptap(content.doc)}</article>
          )}
          {split.after === null ? panel : null}
        </div>

        {showRail ? (
          <aside className={hasWerkingRail ? "vtk-page-side" : "vtk-page-rail"}>
            {showOutline || railForm ? (
              <PageOutline
                items={headings}
                label={onThisPageLabel}
                form={railForm}
                formIndex={formIndex}
              />
            ) : null}

            {group ? (
              <section className="vtk-page-side-box">
                <h2>{t.werking}</h2>
                <ul>
                  <li>
                    <Link href={`${base}/praesidium#post-${group.slug}`}>
                      {t.werkingMembers.replace("{group}", groupName)}
                    </Link>
                  </li>
                  <li>
                    <Link href={`${base}/kalender`}>{t.upcomingAll}</Link>
                  </li>
                  {group.website ? (
                    <li>
                      <a
                        href={group.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        {...umamiEvent(OUTBOUND_EVENT, {
                          bestemming: outboundHost(group.website),
                          vanaf: `pagina:${page.slug}`,
                        })}
                      >
                        {t.werkingWebsite}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            {downloads.length > 0 ? (
              <section
                className={
                  hasWerkingRail
                    ? "vtk-page-side-box vtk-rail-downloads"
                    : "vtk-rail-box vtk-rail-downloads"
                }
              >
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

            {/* Wanneer de inhoud voor het laatst is nagekeken. Zegt op een pagina
                met jaarcijfers of namen meer dan welke tekst ook, en het is het
                enige dat elke pagina over zichzelf weet. */}
            {editedAt ? (
              <section className={hasWerkingRail ? "vtk-page-side-box" : "vtk-rail-box"}>
                <p className="vtk-page-side-stamp">
                  {t.updated}
                  <b>
                    {editedAt.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </b>
                </p>
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>

      {/* Banden onder de tekst, in het ritme van de homepage: eerst wat de
          werking binnenkort doet, dan wie ze is, dan waar je verder kan kijken.
          Elke band verschijnt enkel wanneer ze iets te tonen heeft. */}
      {events.length > 0 && group ? (
        <section className="vtk-page-band vtk-page-band-dark">
          <div className="vtk-page-band-inner">
            <div className="vtk-page-band-head">
              <h2>{t.upcomingTitle.replace("{group}", groupName)}</h2>
              <Link href={`${base}/kalender`}>{t.upcomingAll} →</Link>
            </div>
            <ul className="vtk-page-evgrid">
              {events.map((event) => (
                <li key={event.id}>
                  <EventCard
                    event={event}
                    locale={locale}
                    base={base}
                    allDayLabel={t.allDay}
                    defaultImage={defaultEventImage ?? ""}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {group && group.members.length > 0 ? (
        <section className="vtk-page-band vtk-page-band-tint">
          <div className="vtk-page-band-inner">
            <div className="vtk-page-band-head">
              <h2>{t.teamTitle.replace("{group}", groupName)}</h2>
              <span className="vtk-page-side-stamp">
                {t.teamYear.replace("{year}", formatWorkingYear(currentWorkingYear()))}
              </span>
            </div>
            <ul
              className="vtk-page-faces"
              style={{ "--face-cols": Math.min(group.members.length, 6) } as CSSProperties}
            >
              {group.members.map((member) => {
                const src = publicUrl(member.avatarKey);
                const memberTitle = pick(member.titleNl ?? "", member.titleEn ?? "", locale);
                return (
                  <li key={member.id} className="vtk-roster-cell">
                    <div className={"vtk-roster-photo" + (src ? "" : " is-blank")}>
                      {src ? (
                        <Image src={src} alt={member.name} width={192} height={192} />
                      ) : (
                        <div className="vtk-roster-initial" aria-hidden>
                          {member.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="vtk-roster-name">{member.name}</div>
                    {memberTitle ? <div className="vtk-roster-title">{memberTitle}</div> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {siblings.length > 0 && tab ? (
        <section className="vtk-page-band vtk-page-band-plain">
          <div className="vtk-page-band-inner">
            <div className="vtk-page-band-head">
              <h2>{t.moreIn.replace("{category}", tabLabel)}</h2>
              <Link href={`${base}/${tab.slug}`}>
                {t.allIn.replace("{category}", tabLabel)} →
              </Link>
            </div>
            <ul className="vtk-tile-grid">
              {siblings.map((sibling) => {
                const photo = publicUrl(sibling.imageKey);
                const siblingExcerpt = pick(
                  sibling.excerptNl ?? "",
                  sibling.excerptEn ?? "",
                  locale,
                );
                return (
                  <li key={sibling.id}>
                    <Link href={`${base}/${tab.slug}/${sibling.slug}`}>
                      <article className="vtk-tile">
                        {/* Decoratief: de titel ernaast zegt al waar de kaart heen
                            gaat. Zelfde tegel als op de categoriepagina zelf. */}
                        <span
                          className={`vtk-tile-media${photo ? " has-photo" : ""}`}
                          aria-hidden="true"
                        >
                          {photo && (
                            <Image src={photo} alt="" fill sizes="(max-width: 520px) 104px, 120px" />
                          )}
                        </span>
                        <div className="vtk-tile-body">
                          <h2>{pick(sibling.titleNl, sibling.titleEn, locale)}</h2>
                          {siblingExcerpt ? <p className="line-clamp-3">{siblingExcerpt}</p> : null}
                          <span className="vtk-tile-cta">{readMore} →</span>
                        </div>
                      </article>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Eén evenement op de navy band. Bewust een eigen, kleine kaart en niet de
 * `.evcard` van de homepage: die is wit, draagt de ster en de agendaknop, en
 * hoort bij `.vtk-design`. Hier telt enkel wanneer, wat en waar.
 */
function EventCard({
  event,
  locale,
  base,
  allDayLabel,
  defaultImage,
}: {
  event: WerkingEvent;
  locale: Locale;
  base: string;
  allDayLabel: string;
  defaultImage: string;
}) {
  const tag = locale === "nl" ? "nl-BE" : "en-GB";
  const photo = publicUrl(event.imageKey) ?? defaultImage;
  const when = event.start.toLocaleDateString(tag, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = event.allDay
    ? allDayLabel
    : event.start.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });

  return (
    <Link href={`${base}/kalender/${event.slug}`} className="vtk-page-ev">
      {photo ? (
        <div className="vtk-page-ev-media" aria-hidden="true">
          <Image
            src={photo}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw"
            style={
              event.imageKey
                ? { objectPosition: focusPosition({ x: event.imageFocusX, y: event.imageFocusY }) }
                : undefined
            }
          />
        </div>
      ) : null}
      <div className="vtk-page-ev-body">
        <span className="vtk-page-ev-when">
          {when} · {time}
        </span>
        <h3>{pick(event.titleNl, event.titleEn, locale)}</h3>
        {event.location ? <p>{event.location}</p> : null}
      </div>
    </Link>
  );
}
