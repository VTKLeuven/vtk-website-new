"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import {
  TILE_COLORS,
  TILE_ICONS,
  TileIcon,
  tileColor,
  type EffectiveTile,
} from "@/lib/dashboard-tiles";
import {
  addPersonalTileAction,
  deletePersonalTileAction,
  overrideSharedTileAction,
  resetLayoutAction,
  resetSharedTileAction,
  saveDashboardLayoutAction,
  updatePersonalTileAction,
  type LayoutItem,
} from "@/app/actions/dashboard";

type Loc = "nl" | "en";

const T = {
  nl: {
    customize: "Aanpassen",
    done: "Klaar",
    addTile: "Tegel toevoegen",
    resetLayout: "Standaard herstellen",
    hide: "Verbergen",
    show: "Tonen",
    edit: "Bewerken",
    remove: "Verwijderen",
    reset: "Herstellen",
    label: "Naam",
    url: "URL",
    icon: "Pictogram",
    color: "Kleur",
    save: "Opslaan",
    cancel: "Annuleren",
    empty: "Nog geen tegels. Voeg er een toe of vraag een beheerder om standaardtegels.",
    hidden: "verborgen",
    resetConfirm: "Jouw persoonlijke indeling herstellen naar de standaard?",
    overrideNote: "Dit overschrijft de standaardtegel alleen voor jou.",
    newTile: "Nieuwe tegel",
    editTile: "Tegel bewerken",
    dragHint: "Sleep om te herschikken",
  },
  en: {
    customize: "Customize",
    done: "Done",
    addTile: "Add tile",
    resetLayout: "Reset layout",
    hide: "Hide",
    show: "Show",
    edit: "Edit",
    remove: "Remove",
    reset: "Reset",
    label: "Name",
    url: "URL",
    icon: "Icon",
    color: "Color",
    save: "Save",
    cancel: "Cancel",
    empty: "No tiles yet. Add one, or ask an admin to set up default tiles.",
    hidden: "hidden",
    resetConfirm: "Reset your personal layout back to the defaults?",
    overrideNote: "This overrides the default tile for you only.",
    newTile: "New tile",
    editTile: "Edit tile",
    dragHint: "Drag to rearrange",
  },
} as const;

type EditorState =
  | { mode: "add" }
  | { mode: "edit"; tile: EffectiveTile }
  | null;

function buildLayout(list: EffectiveTile[]): LayoutItem[] {
  return list.map((t, i) => ({
    tileId: t.tileId,
    kind: t.source === "personal" ? "personal" : "shared",
    order: i,
    hidden: t.hidden,
  }));
}

export function DashboardTiles({
  tiles,
  locale,
  manageHref,
}: {
  tiles: EffectiveTile[];
  locale: Loc;
  manageHref?: string;
}) {
  const t = T[locale];
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [list, setList] = useState<EffectiveTile[]>(tiles);
  const [editor, setEditor] = useState<EditorState>(null);
  const [pending, startTransition] = useTransition();

  // Re-sync from the server whenever the props change (after a revalidation),
  // unless the user is mid-drag.
  const dragging = useRef<string | null>(null);
  const signature = tiles.map((x) => `${x.key}:${x.order}:${x.hidden}:${x.label}:${x.icon}:${x.color}:${x.url}`).join("|");
  useEffect(() => {
    if (!dragging.current) setList(tiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const listRef = useRef(list);
  useEffect(() => {
    listRef.current = list;
  }, [list]);

  function persistLayout(next: EffectiveTile[]) {
    startTransition(() => saveDashboardLayoutAction(buildLayout(next)));
  }

  // --- drag & drop reordering (edit mode only) ---
  function onDragStart(key: string) {
    dragging.current = key;
  }
  function onDragEnter(targetKey: string) {
    const fromKey = dragging.current;
    if (!fromKey || fromKey === targetKey) return;
    setList((cur) => {
      const from = cur.findIndex((x) => x.key === fromKey);
      const to = cur.findIndex((x) => x.key === targetKey);
      if (from < 0 || to < 0 || from === to) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function onDragEnd() {
    dragging.current = null;
    persistLayout(listRef.current);
  }

  function toggleHidden(tile: EffectiveTile) {
    const next = list.map((x) => (x.key === tile.key ? { ...x, hidden: !x.hidden } : x));
    setList(next);
    persistLayout(next);
  }

  function removeTile(tile: EffectiveTile) {
    startTransition(() => deletePersonalTileAction(tile.tileId));
  }

  function resetTile(tile: EffectiveTile) {
    startTransition(() => resetSharedTileAction(tile.tileId));
  }

  function resetLayout() {
    startTransition(async () => {
      await resetLayoutAction();
      setResetting(false);
    });
  }

  const visible = editing ? list : list.filter((x) => !x.hidden);

  return (
    <div className="vtk-tiles">
      <div className="vtk-tiles-bar">
        <div className="vtk-tiles-actions">
          {editing && (
            <>
              <button type="button" className="vtk-tile-btn" onClick={() => setEditor({ mode: "add" })}>
                + {t.addTile}
              </button>
              <button type="button" className="vtk-tile-btn" onClick={() => setResetting(true)}>
                {t.resetLayout}
              </button>
              {manageHref && (
                <Link href={manageHref} className="vtk-tile-btn">
                  {locale === "nl" ? "Standaardtegels beheren" : "Manage default tiles"}
                </Link>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          className={"vtk-tile-btn vtk-tile-btn-primary" + (pending ? " is-pending" : "")}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? t.done : t.customize}
        </button>
      </div>

      {editing && <p className="vtk-tiles-hint">{t.dragHint}</p>}

      {visible.length === 0 ? (
        <p className="vtk-tiles-empty">{t.empty}</p>
      ) : (
        <div className="vtk-tile-grid">
          {visible.map((tile) => {
            const c = tileColor(tile.color);
            const inner = (
              <>
                <span className="vtk-tile-chip" style={{ background: c.chipBg, color: c.chipFg }}>
                  <TileIcon name={tile.icon} />
                </span>
                <span className="vtk-tile-label">{tile.label}</span>
                <span className="vtk-tile-host">{hostOf(tile.url)}</span>
              </>
            );
            if (!editing) {
              return (
                <a
                  key={tile.key}
                  href={tile.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="vtk-tile"
                >
                  {inner}
                </a>
              );
            }
            return (
              <div
                key={tile.key}
                className={"vtk-tile vtk-tile-editing" + (tile.hidden ? " is-hidden" : "")}
                draggable
                onDragStart={() => onDragStart(tile.key)}
                onDragEnter={() => onDragEnter(tile.key)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={onDragEnd}
              >
                <span className="vtk-tile-handle" title={t.dragHint}>⠿</span>
                {inner}
                {tile.source !== "personal" && (
                  <span className="vtk-tile-source">
                    {tile.source === "group" ? tile.groupLabel : locale === "nl" ? "globaal" : "global"}
                    {tile.overridden ? " ·✎" : ""}
                  </span>
                )}
                <div className="vtk-tile-controls">
                  <button type="button" title={t.edit} onClick={() => setEditor({ mode: "edit", tile })}>
                    ✎
                  </button>
                  {tile.source === "personal" ? (
                    <button type="button" title={t.remove} onClick={() => removeTile(tile)}>
                      🗑
                    </button>
                  ) : (
                    <>
                      <button type="button" title={tile.hidden ? t.show : t.hide} onClick={() => toggleHidden(tile)}>
                        {tile.hidden ? "🙈" : "👁"}
                      </button>
                      {(tile.overridden || tile.hidden) && (
                        <button type="button" title={t.reset} onClick={() => resetTile(tile)}>
                          ↺
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <TileEditor
          locale={locale}
          state={editor}
          pending={pending}
          onClose={() => setEditor(null)}
          onSubmit={(data) => {
            startTransition(() => {
              if (editor.mode === "add") {
                addPersonalTileAction(data);
              } else if (editor.tile.source === "personal") {
                updatePersonalTileAction({ ...data, id: editor.tile.tileId });
              } else {
                overrideSharedTileAction({ ...data, tileId: editor.tile.tileId });
              }
            });
            setEditor(null);
          }}
        />
      )}

      <ConfirmDialog
        open={resetting}
        title={t.resetLayout}
        description={t.resetConfirm}
        confirmLabel={t.resetLayout}
        cancelLabel={t.cancel}
        pending={pending}
        onConfirm={resetLayout}
        onCancel={() => setResetting(false)}
      />
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function TileEditor({
  locale,
  state,
  pending,
  onClose,
  onSubmit,
}: {
  locale: Loc;
  state: { mode: "add" } | { mode: "edit"; tile: EffectiveTile };
  pending: boolean;
  onClose: () => void;
  onSubmit: (data: { label: string; url: string; icon: string; color: string }) => void;
}) {
  const t = T[locale];
  const initial = state.mode === "edit" ? state.tile : null;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "link");
  const [color, setColor] = useState(initial?.color ?? "navy");
  const c = tileColor(color);
  const isSharedEdit = state.mode === "edit" && state.tile.source !== "personal";

  return (
    <div className="vtk-tile-modal-backdrop" onClick={onClose}>
      <div className="vtk-tile-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{state.mode === "add" ? t.newTile : t.editTile}</h3>

        <div className="vtk-tile-preview">
          <span className="vtk-tile-chip" style={{ background: c.chipBg, color: c.chipFg }}>
            <TileIcon name={icon} />
          </span>
          <span className="vtk-tile-label">{label || "—"}</span>
        </div>

        <label className="vtk-tile-field">
          <span>{t.label}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </label>
        <label className="vtk-tile-field">
          <span>{t.url}</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>

        <div className="vtk-tile-field">
          <span>{t.icon}</span>
          <div className="vtk-icon-grid">
            {TILE_ICONS.map((i) => (
              <button
                key={i.key}
                type="button"
                className={"vtk-icon-opt" + (icon === i.key ? " is-active" : "")}
                title={locale === "nl" ? i.labelNl : i.labelEn}
                onClick={() => setIcon(i.key)}
              >
                <TileIcon name={i.key} size={20} />
              </button>
            ))}
          </div>
        </div>

        <div className="vtk-tile-field">
          <span>{t.color}</span>
          <div className="vtk-color-grid">
            {TILE_COLORS.map((col) => (
              <button
                key={col.key}
                type="button"
                className={"vtk-color-opt" + (color === col.key ? " is-active" : "")}
                title={locale === "nl" ? col.labelNl : col.labelEn}
                style={{ background: col.chipBg, color: col.chipFg }}
                onClick={() => setColor(col.key)}
              >
                A
              </button>
            ))}
          </div>
        </div>

        {isSharedEdit && <p className="vtk-tiles-hint">{t.overrideNote}</p>}

        <div className="vtk-tile-modal-actions">
          <button type="button" className="vtk-tile-btn" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="vtk-tile-btn vtk-tile-btn-primary"
            disabled={pending || !label.trim() || !url.trim()}
            onClick={() => onSubmit({ label, url, icon, color })}
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
