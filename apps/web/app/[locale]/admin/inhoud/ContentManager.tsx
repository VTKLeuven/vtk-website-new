"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, ConfirmDialog } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import {
  deleteHeaderTabLinkAction,
  importDefaultHeaderTabsAction,
  moveHeaderTabLinkToTabAction,
  movePageToTabAction,
  reorderHeaderTabLinksAction,
  reorderHeaderTabsAction,
  reorderPagesAction,
} from "@/app/actions/pages";
import { isExternalUrl } from "@/lib/href";
import { ExternalLinkIcon, LinkIcon, TrashIcon } from "@/components/ui/icons";
import { TabInspector } from "./TabInspector";
import { PageInspector } from "./PageInspector";
import { AddPagePicker } from "./AddPagePicker";

export type AssetNode = {
  id: string;
  labelNl: string;
  kind: "EMBEDDED_PDF" | "DOWNLOAD";
  storageKey: string;
  url: string | null;
};

export type PageNode = {
  id: string;
  slug: string;
  headerTabId: string | null;
  visibleInHeader: boolean;
  titleNl: string;
  titleEn: string | null;
  excerptNl: string | null;
  excerptEn: string | null;
  ctaLabelNl: string | null;
  ctaLabelEn: string | null;
  ctaUrl: string | null;
  published: boolean;
  needsYearlyEdit: boolean;
  /** Rollen die de inhoud mogen bewerken (PageEditorRole). */
  editorRoleIds: string[];
  order: number;
};

export type TabLinkNode = {
  id: string;
  labelNl: string;
  labelEn: string;
  url: string;
};

/** Rol-optie voor de bewerkrollen-checkboxes, naam al in de juiste taal. */
export type RoleOption = { id: string; name: string };

export type TabNode = {
  id: string;
  code: string;
  slug: string;
  labelNl: string;
  labelEn: string;
  visible: boolean;
  visibleNl: boolean;
  visibleEn: boolean;
  /** Externe bestemming voor de headerknop (bv. career.vtk.be). */
  externalUrl: string | null;
  /** Extra menu-items naast de pagina's onder deze categorie. */
  links: TabLinkNode[];
  introNl: string | null;
  introEn: string | null;
  ctaLabelNl: string | null;
  ctaLabelEn: string | null;
  ctaUrl: string | null;
  pages: PageNode[];
};

/** Wat de rechterkolom toont. `new-tab` is nog niet opgeslagen. */
type Selection =
  | { kind: "none" }
  | { kind: "tab"; id: string }
  | { kind: "page"; id: string }
  | { kind: "new-tab" };

/** Sleepbron: een categorie, een pagina of een vaste link. */
type Drag =
  | { kind: "tab"; id: string }
  | { kind: "page"; id: string; fromTabId: string | null }
  | { kind: "link"; id: string; fromTabId: string };

export function ContentManager({
  locale,
  tabs,
  roles,
  usingDefaults,
  canDeletePages,
}: {
  locale: Locale;
  tabs: TabNode[];
  roles: RoleOption[];
  usingDefaults: boolean;
  /** `pages.delete`; bepaalt of de inspector een verwijderknop toont. */
  canDeletePages: boolean;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Deep link: /admin/inhoud?page=<id> opent die pagina meteen. Enkel bij het
  // laden; daarna stuurt de selectie de URL aan, niet omgekeerd.
  const [selection, setSelection] = useState<Selection>(() => {
    const id = searchParams.get("page");
    return id ? { kind: "page", id } : { kind: "none" };
  });
  const drag = useRef<Drag | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Categorie waarvoor de "pagina toevoegen"-picker openstaat. */
  const [addingTo, setAddingTo] = useState<TabNode | null>(null);

  const allPages = useMemo(() => tabs.flatMap((t) => t.pages), [tabs]);

  const select = useCallback(
    (next: Selection) => {
      setSelection(next);
      // Enkel bestaande pagina's zijn deep-linkbaar.
      const url = next.kind === "page" ? `?page=${next.id}` : "?";
      router.replace(url, { scroll: false });
    },
    [router],
  );

  const close = useCallback(() => select({ kind: "none" }), [select]);

  const selectedTab = selection.kind === "tab" ? tabs.find((t) => t.id === selection.id) : undefined;
  const selectedPage =
    selection.kind === "page" ? allPages.find((p) => p.id === selection.id) : undefined;

  // ---- Slepen ---------------------------------------------------------------

  function onDropOnTab(tabId: string) {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!d) return;

    if (d.kind === "tab") {
      const ids = tabs.map((t) => t.id);
      const from = ids.indexOf(d.id);
      const to = ids.indexOf(tabId);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...ids];
      next.splice(to, 0, next.splice(from, 1)[0]);
      startTransition(() => void reorderHeaderTabsAction(next));
      return;
    }

    if (d.kind === "page" && d.fromTabId !== tabId) {
      startTransition(() => void movePageToTabAction(d.id, tabId));
      return;
    }

    if (d.kind === "link" && d.fromTabId !== tabId) {
      startTransition(() => void moveHeaderTabLinkToTabAction(d.id, tabId));
      return;
    }
  }

  function onDropOnPage(target: PageNode) {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!d) return;

    if (d.kind === "page") {
      if (d.id === target.id) return;

      if (d.fromTabId !== target.headerTabId) {
        startTransition(() => void movePageToTabAction(d.id, target.headerTabId));
        return;
      }

      const siblings = tabs.find((t) => t.id === target.headerTabId)?.pages ?? [];
      const ids = siblings.map((p) => p.id);
      const from = ids.indexOf(d.id);
      const to = ids.indexOf(target.id);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...ids];
      next.splice(to, 0, next.splice(from, 1)[0]);
      startTransition(() => void reorderPagesAction(next));
      return;
    }

    if (d.kind === "link" && target.headerTabId && d.fromTabId !== target.headerTabId) {
      const tabId = target.headerTabId;
      startTransition(() => void moveHeaderTabLinkToTabAction(d.id, tabId));
      return;
    }
  }

  function onDropOnLink(target: TabLinkNode, targetTabId: string) {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!d) return;

    if (d.kind === "link") {
      if (d.id === target.id) return;

      if (d.fromTabId !== targetTabId) {
        startTransition(() => void moveHeaderTabLinkToTabAction(d.id, targetTabId));
        return;
      }

      const siblings = tabs.find((t) => t.id === targetTabId)?.links ?? [];
      const ids = siblings.map((l) => l.id);
      const from = ids.indexOf(d.id);
      const to = ids.indexOf(target.id);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...ids];
      next.splice(to, 0, next.splice(from, 1)[0]);
      startTransition(() => void reorderHeaderTabLinksAction(next));
      return;
    }

    if (d.kind === "page" && d.fromTabId !== targetTabId) {
      startTransition(() => void movePageToTabAction(d.id, targetTabId));
      return;
    }
  }

  // ---- Rijen ----------------------------------------------------------------

  function PageRow({ page }: { page: PageNode }) {
    const active = selection.kind === "page" && selection.id === page.id;
    return (
      <button
        type="button"
        draggable
        onDragStart={() => {
          drag.current = { kind: "page", id: page.id, fromTabId: page.headerTabId };
        }}
        onDragEnd={() => {
          drag.current = null;
          setDropTarget(null);
        }}
        onDragOver={(e) => {
          // Sleep je een categorie, dan is de hele groep het doelwit: laat het
          // event doorbubbelen naar de <li> zodat de categorie oplicht in
          // plaats van één losse pagina.
          if (drag.current?.kind === "tab") return;
          e.preventDefault();
          e.stopPropagation();
          if (dropTarget !== page.id) setDropTarget(page.id);
        }}
        onDrop={(e) => {
          if (drag.current?.kind === "tab") return;
          e.preventDefault();
          e.stopPropagation();
          onDropOnPage(page);
        }}
        onClick={() => select({ kind: "page", id: page.id })}
        className={[
          "flex w-full items-center gap-2 rounded-xl border py-2 pl-8 pr-3 text-left text-sm transition-colors cursor-grab active:cursor-grabbing",
          active ? "border-vtk-ink bg-vtk-blue-soft/70" : "border-transparent hover:bg-vtk-blue-soft/40",
          dropTarget === page.id ? "ring-2 ring-vtk-yellow" : "",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1 truncate text-vtk-ink">{page.titleNl}</span>
        {/* Smal wint de titel het van de slug: anders blijft er "Reservatie..." over
            naast een volledig uitgeschreven pad. */}
        <span className="min-w-0 max-w-[45%] truncate font-mono text-[11px] text-[#5c667f] sm:max-w-none sm:shrink-0">
          /{page.slug}
        </span>
        <StatusDot
          on={page.published}
          title={
            page.published
              ? nl
                ? "Gepubliceerd"
                : "Published"
              : nl
                ? "Concept"
                : "Draft"
          }
        />
      </button>
    );
  }

  function LinkRow({ link, tabId }: { link: TabLinkNode; tabId: string }) {
    const isExt = isExternalUrl(link.url);
    const [confirming, setConfirming] = useState(false);
    const label = nl ? link.labelNl : link.labelEn;
    return (
      <div
        draggable
        onDragStart={() => {
          drag.current = { kind: "link", id: link.id, fromTabId: tabId };
        }}
        onDragEnd={() => {
          drag.current = null;
          setDropTarget(null);
        }}
        onDragOver={(e) => {
          if (drag.current?.kind === "tab") return;
          e.preventDefault();
          e.stopPropagation();
          if (dropTarget !== link.id) setDropTarget(link.id);
        }}
        onDrop={(e) => {
          if (drag.current?.kind === "tab") return;
          e.preventDefault();
          e.stopPropagation();
          onDropOnLink(link, tabId);
        }}
        className={[
          "group flex w-full items-center gap-2 rounded-xl border border-transparent py-1.5 pl-8 pr-3 text-left text-sm transition-colors hover:bg-vtk-blue-soft/30 cursor-grab active:cursor-grabbing",
          dropTarget === link.id ? "ring-2 ring-vtk-yellow" : "",
        ].join(" ")}
      >
        <span
          className="shrink-0 text-[#5c667f]"
          title={isExt ? (nl ? "Externe link" : "External link") : (nl ? "Vaste route" : "Built-in route")}
        >
          {isExt ? <ExternalLinkIcon /> : <LinkIcon />}
        </span>
        <button
          type="button"
          onClick={() => select({ kind: "tab", id: tabId })}
          className="min-w-0 flex-1 truncate text-left text-vtk-ink hover:underline"
        >
          {label}
        </button>
        <span className="min-w-0 max-w-[45%] truncate font-mono text-[11px] text-[#5c667f] sm:max-w-none sm:shrink-0">
          {link.url}
        </span>
        <button
          type="button"
          title={nl ? "Link verwijderen" : "Remove link"}
          onClick={() => setConfirming(true)}
          className="ml-1 text-zinc-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
        <ConfirmDialog
          open={confirming}
          title={nl ? "Link verwijderen?" : "Remove link?"}
          description={
            nl
              ? `Weet je zeker dat je "${link.labelNl}" (${link.url}) wil verwijderen uit deze categorie?`
              : `Are you sure you want to remove "${link.labelEn}" (${link.url}) from this category?`
          }
          confirmLabel={nl ? "Verwijderen" : "Remove"}
          cancelLabel={nl ? "Annuleren" : "Cancel"}
          onConfirm={() => {
            startTransition(async () => {
              await deleteHeaderTabLinkAction(link.id);
              setConfirming(false);
            });
          }}
          onCancel={() => setConfirming(false)}
        />
      </div>
    );
  }

  function TabGroup({ tab }: { tab: TabNode }) {
    const active = selection.kind === "tab" && selection.id === tab.id;
    return (
      <li
        onDragOver={(e) => {
          e.preventDefault();
          if (dropTarget !== tab.id) setDropTarget(tab.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropOnTab(tab.id);
        }}
        className={dropTarget === tab.id ? "rounded-xl ring-2 ring-vtk-yellow" : undefined}
      >
        <button
          type="button"
          draggable
          onDragStart={() => {
            drag.current = { kind: "tab", id: tab.id };
          }}
          onDragEnd={() => {
            drag.current = null;
            setDropTarget(null);
          }}
          onClick={() => select({ kind: "tab", id: tab.id })}
          className={[
            "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
            active ? "border-vtk-ink bg-vtk-blue-soft/70" : "border-transparent hover:bg-vtk-blue-soft/40",
            tab.visible ? "" : "opacity-50",
          ].join(" ")}
        >
          <span className="min-w-0 flex-1 truncate font-semibold text-vtk-ink">{tab.labelNl}</span>
          <span className="min-w-0 max-w-[45%] truncate font-mono text-[11px] text-[#5c667f] sm:max-w-none sm:shrink-0">
            /{tab.slug}
          </span>
          {!tab.visible || (!tab.visibleNl && !tab.visibleEn) ? (
            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
              {nl ? "Verborgen" : "Hidden"}
            </span>
          ) : tab.visibleNl && !tab.visibleEn ? (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
              NL
            </span>
          ) : !tab.visibleNl && tab.visibleEn ? (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
              EN
            </span>
          ) : (
            <StatusDot
              on={true}
              title={nl ? "Zichtbaar (NL + EN)" : "Visible (NL + EN)"}
            />
          )}
        </button>

        <ul className="mt-0.5 space-y-0.5">
          {tab.pages.map((p) => (
            <li key={p.id}>
              <PageRow page={p} />
            </li>
          ))}
          {tab.links.map((link) => (
            <li key={link.id}>
              <LinkRow link={link} tabId={tab.id} />
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setAddingTo(tab)}
          className="mb-1 ml-8 mt-0.5 text-xs font-medium text-[#5c667f] hover:text-vtk-ink"
        >
          + {nl ? "Pagina of link toevoegen" : "Add page or link"}
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-2xl font-semibold">{nl ? "Header" : "Header"}</h1>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Beheer de categorieën en menu-items in de navigatiebalk. Sleep om de volgorde te wijzigen of een pagina naar een andere categorie te verplaatsen. De inhoud zelf bewerk je onder Pagina's."
              : "Manage the categories and menu items in the main navigation. Drag to reorder or move a page to another category. The content itself is edited under Pages."}
          </p>
        </div>
        {!usingDefaults && (
          <Button onClick={() => select({ kind: "new-tab" })}>
            {nl ? "Nieuwe categorie" : "New category"}
          </Button>
        )}
      </div>

      {usingDefaults && <DefaultsNotice locale={locale} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Card className="p-3">
          <ul className="space-y-1">
            {tabs.map((t) => (
              <TabGroup key={t.id} tab={t} />
            ))}
          </ul>

          {tabs.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[#5c667f]">
              {nl ? "Nog geen categorieën." : "No categories yet."}
            </p>
          )}
        </Card>

        <div className="min-w-0">
          {selection.kind === "none" && (
            <Card className="grid min-h-[320px] place-items-center p-8 text-center text-sm text-[#5c667f]">
              {nl
                ? "Kies links een categorie of pagina om ze te bewerken."
                : "Pick a category or page on the left to edit it."}
            </Card>
          )}

          {selectedTab && (
            <TabInspector key={selectedTab.id} locale={locale} tab={selectedTab} onClose={close} />
          )}
          {selection.kind === "new-tab" && (
            <TabInspector key="new-tab" locale={locale} tab={null} onClose={close} />
          )}

          {selectedPage && (
            <PageInspector
              key={selectedPage.id}
              locale={locale}
              page={selectedPage}
              tabs={tabs}
              roles={roles}
              canDelete={canDeletePages}
              onClose={close}
            />
          )}
        </div>
      </div>

      {addingTo && (
        <AddPagePicker
          locale={locale}
          tabId={addingTo.id}
          tabLabel={nl ? addingTo.labelNl : addingTo.labelEn}
          onClose={() => setAddingTo(null)}
        />
      )}
    </div>
  );
}

function StatusDot({ on, title }: { on: boolean; title: string }) {
  return (
    <span
      title={title}
      className={[
        "size-2 shrink-0 rounded-full",
        on ? "bg-vtk-yellow" : "border border-vtk-blue/25 bg-transparent",
      ].join(" ")}
    />
  );
}

/** De nav valt terug op HEADER_TABS zolang de tabel leeg is; importeer om te beheren. */
function DefaultsNotice({ locale }: { locale: Locale }) {
  const nl = locale === "nl";
  const [pending, startTransition] = useTransition();
  return (
    <Card className="border border-vtk-yellow-dark/30 bg-vtk-yellow/10 p-5">
      <h2 className="font-semibold text-vtk-ink">
        {nl ? "De header gebruikt de standaardcategorieën" : "The header is using default categories"}
      </h2>
      <p className="mt-2 text-sm text-[#34405e]">
        {nl
          ? "Er staan nog geen categorieën in de database, dus de navigatie valt terug op de ingebouwde standaard. Importeer ze om ze hier te kunnen beheren."
          : "There are no categories in the database yet, so the navigation falls back to the built-in defaults. Import them to manage them here."}
      </p>
      <Button
        className="mt-4"
        disabled={pending}
        onClick={() => startTransition(() => void importDefaultHeaderTabsAction())}
      >
        {nl ? "Standaardcategorieën importeren" : "Import default categories"}
      </Button>
    </Card>
  );
}
