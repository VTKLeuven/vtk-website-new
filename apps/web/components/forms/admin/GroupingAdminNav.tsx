"use client";

import Link from "@/components/ui/Link";
import { useSelectedLayoutSegment } from "next/navigation";
import { ArrowLeft, ExternalLink, ListChecks, Settings2, UsersRound } from "lucide-react";
import { FormStatusBadge } from "./FormStatusBadge";
import { formBase, type AdminLocale } from "./format";

/**
 * De kop van één groepjesmaker: de terugweg naar de lijst, de form waar hij aan
 * hangt, en de drie tabbladen. Bewust dezelfde opbouw als de formuliereneditor
 * (`FormAdminNav`): dat zijn twee schermen naast elkaar in dezelfde admin.
 */
export function GroupingAdminNav({
  locale,
  form,
  canManage,
  canManageForm,
  showTabs,
}: {
  locale: AdminLocale;
  form: { id: string; title: string; slug: string; status: string };
  canManage: boolean;
  /** Mag deze gebruiker de vragen van de form zelf bewerken? */
  canManageForm: boolean;
  /** Zonder groepjesmaker valt er niets te tabben. */
  showTabs: boolean;
}) {
  const nl = locale === "nl";
  const segment = useSelectedLayoutSegment();
  const base = formBase(locale);
  const root = `${base}/admin/apps/groepjesmaker/${form.id}`;

  const tabs = [
    {
      href: root,
      label: nl ? "Groepjes" : "Groups",
      icon: UsersRound,
      segment: null,
      visible: true,
    },
    {
      href: `${root}/vragen`,
      label: nl ? "Vragen" : "Questions",
      icon: ListChecks,
      segment: "vragen",
      visible: canManage,
    },
    {
      href: `${root}/instellingen`,
      label: nl ? "Instellingen" : "Settings",
      icon: Settings2,
      segment: "instellingen",
      visible: canManage,
    },
  ].filter((tab) => tab.visible);

  return (
    <header className="ticket-admin-event-head">
      <div className="ticket-admin-event-title">
        <div>
          <Link className="ticket-admin-back" href={`${base}/admin/apps/groepjesmaker`}>
            <ArrowLeft aria-hidden="true" size={14} />
            {nl ? "Alle groepjesmakers" : "All group makers"}
          </Link>
          <h1>{form.title}</h1>
        </div>
        <div className="ticket-admin-event-actions">
          <FormStatusBadge status={form.status} locale={locale} />
          {canManageForm ? (
            <Link
              className="ticket-admin-icon-button"
              href={`${base}/admin/formulieren/${form.id}/velden`}
              aria-label={nl ? "Vragen bewerken in Forms" : "Edit the questions in Forms"}
              title={nl ? "Vragen bewerken in Forms" : "Edit the questions in Forms"}
            >
              <ListChecks aria-hidden="true" size={17} />
            </Link>
          ) : null}
          <Link
            className="ticket-admin-icon-button"
            href={`${base}/formulieren/${form.slug}`}
            aria-label={nl ? "Form openen" : "Open form"}
            title={nl ? "Form openen" : "Open form"}
          >
            <ExternalLink aria-hidden="true" size={17} />
          </Link>
        </div>
      </div>
      {showTabs && tabs.length > 1 ? (
        <nav className="ticket-admin-tabs" aria-label={nl ? "Groepjesmaker" : "Group maker"}>
          {tabs.map(({ icon: Icon, ...tab }) => {
            const active = (segment ?? null) === tab.segment;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
