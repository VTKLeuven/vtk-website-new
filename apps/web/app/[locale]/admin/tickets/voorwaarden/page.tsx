import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { getDictionary, type Locale } from "@vtk/i18n";
import { saveTicketTermsAction } from "@/app/actions/tickets";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { SaveForm } from "@/components/ui/SaveForm";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getTicketTerms, ticketTermsPath } from "@/lib/ticketing/terms";

export default async function TicketTermsAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const dict = getDictionary(locale);
  await requirePermission("tickets.manageAll");
  const terms = await getTicketTerms();

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <Link href={`${base}/admin/tickets`} className="ticket-admin-back">
            <ArrowLeft aria-hidden="true" size={15} />
            {nl ? "Terug naar tickets" : "Back to tickets"}
          </Link>
          <h1>{nl ? "Algemene ticketvoorwaarden" : "General ticket terms"}</h1>
          <p>
            {nl
              ? "Eén vaste publieke pagina voor alle ticketevents."
              : "One fixed public page for every ticket event."}
          </p>
        </div>
        <Link
          className="ticket-admin-button"
          href={ticketTermsPath(locale)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink aria-hidden="true" size={15} />
          {nl ? "Publieke pagina" : "Public page"}
        </Link>
      </div>

      <section className="ticket-admin-section">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <FileText aria-hidden="true" size={17} />
            </span>
            <div>
              <h2>{nl ? "Inhoud en versie" : "Content and version"}</h2>
              <p>
                {nl
                  ? "Verhoog de versie bij elke inhoudelijke wijziging. Nieuwe bestellingen bewaren deze versie."
                  : "Increase the version for every substantive change. New orders retain this version."}
              </p>
            </div>
          </div>
        </div>
        <SaveForm
          action={saveTicketTermsAction}
          className="ticket-admin-form"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Ticketvoorwaarden opgeslagen" : "Ticket terms saved"}
          errorMessages={{
            INVALID_VERSION: nl ? "Vul een korte versie in." : "Enter a short version.",
            INVALID_CONTENT: nl
              ? "Vul de Nederlandse en Engelse voorwaarden in."
              : "Enter both the Dutch and English terms.",
          }}
          fallbackErrorMessage={dict.common.saveError}
          resetOnSuccess={false}
        >
          <div className="ticket-admin-field">
            <label htmlFor="ticket-terms-version">{nl ? "Versie" : "Version"}</label>
            <input
              id="ticket-terms-version"
              name="version"
              defaultValue={terms.version}
              maxLength={80}
              required
            />
            <span className="ticket-admin-help">
              {nl ? "Bijvoorbeeld 2026-08-21 of 2.1." : "For example 2026-08-21 or 2.1."}
            </span>
          </div>
          <div className="ticket-admin-form-grid">
            <div className="ticket-admin-field">
              <label htmlFor="ticket-terms-nl">{nl ? "Voorwaarden (NL)" : "Terms (NL)"}</label>
              <MarkdownEditorField
                name="bodyNl"
                defaultValue={terms.bodyNl}
                locale={locale}
                rows={18}
                allowImages={false}
                textareaId="ticket-terms-nl"
                maxLength={100_000}
              />
            </div>
            <div className="ticket-admin-field">
              <label htmlFor="ticket-terms-en">{nl ? "Voorwaarden (EN)" : "Terms (EN)"}</label>
              <MarkdownEditorField
                name="bodyEn"
                defaultValue={terms.bodyEn}
                locale={locale}
                rows={18}
                allowImages={false}
                textareaId="ticket-terms-en"
                maxLength={100_000}
              />
            </div>
          </div>
        </SaveForm>
      </section>
    </div>
  );
}
