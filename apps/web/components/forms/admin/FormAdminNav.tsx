"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { FormCapability } from "@/lib/forms/authorization";
import { FormStatusBadge } from "./FormStatusBadge";
import { formBase, type AdminLocale } from "./format";

type FormSummary = {
  id: string;
  titleNl: string;
  titleEn: string | null;
  status: string;
  slug: string;
};

export function FormAdminNav({
  form,
  capabilities,
  locale,
}: {
  form: FormSummary;
  capabilities: FormCapability[];
  locale: AdminLocale;
}) {
  const selectedSegment = useSelectedLayoutSegment();
  const base = `${formBase(locale)}/admin/formulieren/${form.id}`;
  const can = (capability: FormCapability) => capabilities.includes(capability);
  const links = [
    {
      href: base,
      label: locale === "nl" ? "Overzicht" : "Overview",
      icon: LayoutDashboard,
      segment: null,
      visible: can("VIEW_FORM"),
    },
    {
      href: `${base}/instellingen`,
      label: locale === "nl" ? "Instellingen" : "Settings",
      icon: Settings2,
      segment: "instellingen",
      visible: can("MANAGE_FORM"),
    },
    {
      href: `${base}/velden`,
      label: locale === "nl" ? "Velden" : "Fields",
      icon: ListChecks,
      segment: "velden",
      visible: can("MANAGE_FORM"),
    },
    {
      href: `${base}/inzendingen`,
      label: locale === "nl" ? "Inzendingen" : "Entries",
      icon: Inbox,
      segment: "inzendingen",
      visible: can("VIEW_ENTRIES"),
    },
    {
      href: `${base}/toegang`,
      label: locale === "nl" ? "Toegang" : "Access",
      icon: ShieldCheck,
      segment: "toegang",
      visible: can("MANAGE_ACCESS"),
    },
  ].filter((link) => link.visible);

  return (
    <header className="ticket-admin-event-head">
      <div className="ticket-admin-event-title">
        <div>
          <Link className="ticket-admin-back" href={`${formBase(locale)}/admin/formulieren`}>
            <ArrowLeft aria-hidden="true" size={14} />
            {locale === "nl" ? "Alle forms" : "All forms"}
          </Link>
          <h1>{locale === "en" && form.titleEn ? form.titleEn : form.titleNl}</h1>
        </div>
        <div className="ticket-admin-event-actions">
          <FormStatusBadge status={form.status} locale={locale} />
          <Link
            className="ticket-admin-icon-button"
            href={`${formBase(locale)}/formulieren/${form.slug}`}
            aria-label={locale === "nl" ? "Form openen" : "Open form"}
            title={locale === "nl" ? "Form openen" : "Open form"}
          >
            <ExternalLink aria-hidden="true" size={17} />
          </Link>
        </div>
      </div>
      <nav className="ticket-admin-tabs" aria-label="Form">
        {links.map(({ icon: Icon, ...link }) => {
          const active = (selectedSegment ?? null) === link.segment;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "is-active" : undefined}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
