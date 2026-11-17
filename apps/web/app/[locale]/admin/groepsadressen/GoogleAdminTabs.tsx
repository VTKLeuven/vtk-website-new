"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { Download, FolderTree, Link2, Mail, UserPlus, Users } from "lucide-react";
import Link from "@/components/ui/Link";

/**
 * De tabbladen van Google Admin: echte links, actief volgens het segment onder
 * de layout (zoals `MediaAdminNav`). Een groepsadres, de nakijkmodus en een
 * nieuw adres horen bij het tabblad Groepsadressen.
 */
export function GoogleAdminTabs({
  nl,
  manageAll,
  approveAccounts,
  canRequestAccounts,
  pendingRequests,
}: {
  nl: boolean;
  manageAll: boolean;
  approveAccounts: boolean;
  canRequestAccounts: boolean;
  pendingRequests: number;
}) {
  const segment = useSelectedLayoutSegment();
  const base = `${nl ? "" : "/en"}/admin/groepsadressen`;

  const tabs = [
    { segment: null, label: nl ? "Groepsadressen" : "Group addresses", icon: Mail, visible: true },
    {
      segment: "aanvragen",
      label: approveAccounts ? (nl ? "Aanvragen" : "Requests") : nl ? "Accounts aanvragen" : "Request accounts",
      icon: UserPlus,
      visible: approveAccounts || canRequestAccounts,
      count: approveAccounts ? pendingRequests : 0,
    },
    { segment: "accounts", label: nl ? "Accounts aanmaken" : "Create accounts", icon: Users, visible: approveAccounts },
    {
      segment: "organisatie-eenheden",
      label: nl ? "Organisatie-eenheden" : "Organisational units",
      icon: FolderTree,
      visible: approveAccounts,
    },
    { segment: "koppelingen", label: nl ? "Koppelingen" : "Links", icon: Link2, visible: manageAll },
    { segment: "overnemen", label: nl ? "Overnemen" : "Take over", icon: Download, visible: manageAll },
  ].filter((tab) => tab.visible);

  const own = new Set(tabs.map((t) => t.segment).filter(Boolean));
  // Alles wat geen eigen tabblad is (een adres, nakijken, nieuw), valt onder Groepsadressen.
  const activeSegment = segment && own.has(segment) ? segment : null;

  return (
    <nav className="flex flex-wrap gap-1 pb-2.5" aria-label="Google Admin">
      {tabs.map(({ icon: Icon, ...tab }) => {
        const active = tab.segment === activeSegment;
        return (
          <Link
            key={tab.segment ?? "root"}
            href={tab.segment ? `${base}/${tab.segment}` : base}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] no-underline",
              active
                ? "bg-[var(--paper-2)] font-semibold text-vtk-ink"
                : "font-medium text-vtk-ink/70 hover:bg-[var(--paper-2)] hover:text-vtk-ink",
            ].join(" ")}
          >
            <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
            {tab.label}
            {tab.count ? (
              <span
                className="inline-grid h-[19px] min-w-[19px] place-items-center rounded-full bg-vtk-yellow px-1.5 text-[11px] font-bold text-vtk-ink"
                aria-label={nl ? `${tab.count} open` : `${tab.count} open`}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
