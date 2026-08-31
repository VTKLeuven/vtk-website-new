import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@vtk/db";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";
import { ContactForm } from "./ContactForm";

import "@/app/design/vtk-contact.css";

/**
 * `/contact`: het contactformulier.
 *
 * Waarom een eigen route en geen speciaal geval in `[headerSlug]`? Contact is in
 * de database een gewone categorie (`HeaderTab` met code `CONTACT`, slug
 * `contact`) met pagina's eronder, dus zonder deze map zou `/contact` het
 * generieke categorie-overzicht renderen. Het formulier daarin proppen zou
 * betekenen dat het overzicht van élke categorie een `if (slug === "contact")`
 * meedraagt, of dat de contactpagina in het CMS een stuk vaste HTML wordt dat de
 * redactie niet kan bewerken maar wel kan stukmaken.
 *
 * Een statisch segment wint in Next van het dynamische `[headerSlug]`, dus deze
 * map neemt enkel `/contact` over. De pagina's eronder blijven op
 * `/contact/<pagina>` bij de generieke weergave, en dit scherm herhaalt hun
 * lijst onderaan zodat er niets onbereikbaar wordt. De titel en de intro komen
 * nog steeds uit de categorie in `/admin/inhoud`; enkel het formulier is code.
 */

/** De categorie zelf: op code en niet op slug, want de slug is in admin bewerkbaar. */
const loadContactTab = cache(async () =>
  prisma.headerTab.findUnique({
    where: { code: "CONTACT" },
    include: {
      pages: {
        where: { visibleOnCategoryPage: true, publishedAt: { not: null } },
        orderBy: [{ order: "asc" }, { titleNl: "asc" }],
      },
    },
  }),
);

/** Waar een bezoeker rechtstreeks naartoe mag mailen; hetzelfde adres als het formulier. */
const CONTACT_ADDRESS = "info@vtk.be";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  const t = getDictionary(locale).contact;
  return buildMetadata({
    title: t.title,
    description: t.description,
    path: "/contact",
    locale,
  });
}

export default async function ContactPage({ params }: { params: Params }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const t = getDictionary(locale).contact;
  const base = locale === "nl" ? "" : "/en";

  const tab = await loadContactTab();
  // De intro uit `/admin/inhoud` als de redactie er een schreef; anders de vaste
  // ondertitel uit de dictionaries.
  const intro = pick(tab?.introNl ?? "", tab?.introEn ?? "", locale) || t.subtitle;
  const pages = tab?.pages ?? [];

  return (
    <div className="vtk-page vtk-contact-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{tab ? pick(tab.labelNl, tab.labelEn, locale) : t.title}</h1>
          <p className="vtk-page-subtitle">{intro}</p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="vtk-contact-grid">
          <section className="vtk-panel vtk-contact-main" aria-labelledby="contact-form-title">
            <h2 id="contact-form-title">{t.formTitle}</h2>
            <p className="vtk-contact-lead">{t.formIntro}</p>
            <ContactForm
              copy={{
                nameLabel: t.nameLabel,
                namePlaceholder: t.namePlaceholder,
                emailLabel: t.emailLabel,
                emailPlaceholder: t.emailPlaceholder,
                emailHelp: t.emailHelp,
                subjectLabel: t.subjectLabel,
                subjectPlaceholder: t.subjectPlaceholder,
                messageLabel: t.messageLabel,
                messagePlaceholder: t.messagePlaceholder,
                messageHelp: t.messageHelp,
                honeypotLabel: t.honeypotLabel,
                submit: t.submit,
                submitting: t.submitting,
                sent: t.sent,
                errors: t.errors,
              }}
            />
          </section>

          <aside className="vtk-contact-aside">
            <div className="vtk-panel vtk-contact-side">
              <h2>{t.directTitle}</h2>
              <p>
                {t.directBody}{" "}
                <a className="vtk-link" href={`mailto:${CONTACT_ADDRESS}`}>
                  {CONTACT_ADDRESS}
                </a>
              </p>
            </div>
            <div className="vtk-panel vtk-contact-side">
              <h2>{t.privacyTitle}</h2>
              <p>{t.privacyBody}</p>
              <Link className="vtk-link" href={`${base}/privacy`}>
                {t.privacyLink}
              </Link>
            </div>
          </aside>
        </div>

        {pages.length > 0 && (
          <section className="vtk-contact-pages" aria-labelledby="contact-pages-title">
            <h2 id="contact-pages-title">{t.pagesTitle}</h2>
            <ul className="vtk-card-grid">
              {pages.map((page) => (
                <li key={page.id}>
                  <Link href={`${base}/${tab!.slug}/${page.slug}`}>
                    <Card className="vtk-card h-full">
                      <h3 className="text-lg font-semibold tracking-tight text-vtk-ink">
                        {pick(page.titleNl, page.titleEn, locale)}
                      </h3>
                      {(page.excerptNl || page.excerptEn) && (
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#34405e]">
                          {pick(page.excerptNl ?? "", page.excerptEn ?? "", locale)}
                        </p>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
