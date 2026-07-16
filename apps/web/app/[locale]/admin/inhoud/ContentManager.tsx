"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import {
  importDefaultHeaderTabsAction,
  movePageToTabAction,
  reorderHeaderTabsAction,
  reorderPagesAction,
} from "@/app/actions/pages";
import { TabInspector } from "./TabInspector";
import { PageInspector } from "./PageInspector";

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
  published: boolean;
  needsYearlyEdit: boolean;
  /** Rollen die de inhoud mogen bewerken (PageEditorRole). */
  editorRoleIds: string[];
  order: number;
  assets: AssetNode[];
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
  introNl: string | null;
  introEn: string | null;
  ctaLabelNl: string | null;
  ctaLabelEn: string | null;
  ctaUrl: string | null;
  pages: PageNode[];
};

/** Wat de rechterkolom toont. `new-page`/`new-tab` zijn nog niet opgeslagen. */
type Selection =
  | { kind: "none" }
  | { kind: "tab"; id: string }
  | { kind: "page"; id: string }
  | { kind: "new-tab" }
  | { kind: "new-page"; headerTabId: string | null };

/** Sleepbron: een categorie of een pagina uit een bepaalde categorie. */
type Drag =
  | { kind: "tab"; id: string }
  | { kind: "page"; id: string; fromTabId: string | null };

export function ContentManager({
  locale,
  tabs,
  unlinked,
  roles,
  canDeletePages,
  usingDefaults,
}: {
  locale: Locale;
  tabs: TabNode[];
  unlinked: PageNode[];
  roles: RoleOption[];
  canDeletePages: boolean;
  usingDefaults: boolean;
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

  const allPages = useMemo(
    () => [...tabs.flatMap((t) => t.pages), ...unlinked],
    [tabs, unlinked],
  );

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
    }
  }

  function onDropOnPage(target: PageNode) {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!d || d.kind !== "page") return;
    if (d.id === target.id) return;

    if (d.fromTabId !== target.headerTabId) {
      startTransition(() => void movePageToTabAction(d.id, target.headerTabId));
      return;
    }

    const siblings =
      target.headerTabId === null
        ? unlinked
        : (tabs.find((t) => t.id === target.headerTabId)?.pages ?? []);
    const ids = siblings.map((p) => p.id);
    const from = ids.indexOf(d.id);
    const to = ids.indexOf(target.id);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    startTransition(() => void reorderPagesAction(next));
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
          "flex w-full items-center gap-2 rounded-xl border py-2 pl-8 pr-3 text-left text-sm transition-colors",
          active ? "border-vtk-ink bg-vtk-blue-soft/70" : "border-transparent hover:bg-vtk-blue-soft/40",
          dropTarget === page.id ? "ring-2 ring-vtk-yellow" : "",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1 truncate text-vtk-ink">{page.titleNl}</span>
        <span className="shrink-0 font-mono text-[11px] text-[#5c667f]">/{page.slug}</span>
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
          <span className="shrink-0 font-mono text-[11px] text-[#5c667f]">/{tab.slug}</span>
          <StatusDot
            on={tab.visible}
            title={tab.visible ? (nl ? "Zichtbaar" : "Visible") : nl ? "Verborgen" : "Hidden"}
          />
        </button>

        <ul className="mt-0.5 space-y-0.5">
          {tab.pages.map((p) => (
            <li key={p.id}>
              <PageRow page={p} />
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => select({ kind: "new-page", headerTabId: tab.id })}
          className="mb-1 ml-8 mt-0.5 text-xs font-medium text-[#5c667f] hover:text-vtk-ink"
        >
          + {nl ? "Pagina toevoegen" : "Add page"}
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{nl ? "Inhoud" : "Content"}</h1>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Sleep om de navigatie te herschikken of een pagina naar een andere categorie te verplaatsen. Klik om instellingen te bewerken; de inhoud zelf bewerk je onder Pagina's."
              : "Drag to reorder the navigation or move a page to another category. Click to edit settings; the content itself is edited under Pages."}
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

          <div
            className={[
              "mt-3 border-t border-vtk-blue/10 pt-3",
              dropTarget === "__unlinked__" ? "rounded-xl ring-2 ring-vtk-yellow" : "",
            ].join(" ")}
            onDragOver={(e) => {
              // Een categorie hoort niet in de losse-pagina's sectie thuis; enkel
              // pagina's kun je hier droppen.
              if (drag.current?.kind !== "page") return;
              e.preventDefault();
              if (dropTarget !== "__unlinked__") setDropTarget("__unlinked__");
            }}
            onDrop={(e) => {
              e.preventDefault();
              const d = drag.current;
              drag.current = null;
              setDropTarget(null);
              if (d?.kind === "page" && d.fromTabId !== null) {
                startTransition(() => void movePageToTabAction(d.id, null));
              }
            }}
          >
            <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
              {nl ? "Niet gekoppeld" : "Unlinked"}
            </div>
            <ul className="space-y-0.5">
              {unlinked.map((p) => (
                <li key={p.id}>
                  <PageRow page={p} />
                </li>
              ))}
            </ul>
            {unlinked.length === 0 && (
              <p className="px-3 py-2 text-xs text-[#5c667f]">
                {nl
                  ? "Sleep hier een pagina om ze uit de navigatie te halen."
                  : "Drag a page here to take it out of the navigation."}
              </p>
            )}
            <button
              type="button"
              onClick={() => select({ kind: "new-page", headerTabId: null })}
              className="ml-8 mt-1 text-xs font-medium text-[#5c667f] hover:text-vtk-ink"
            >
              + {nl ? "Losse pagina" : "Unlinked page"}
            </button>
          </div>
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
          {selection.kind === "new-page" && (
            <PageInspector
              key={`new-${selection.headerTabId ?? "none"}`}
              locale={locale}
              page={null}
              defaultTabId={selection.headerTabId}
              tabs={tabs}
              roles={roles}
              canDelete={false}
              onClose={close}
            />
          )}
        </div>
      </div>
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
