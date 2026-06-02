"use client";

import { useState, useTransition } from "react";
import {
  TILE_COLORS,
  TILE_ICONS,
  TileIcon,
  tileColor,
} from "@/lib/dashboard-tiles";
import {
  deleteDefaultTileAction,
  saveDefaultTileAction,
} from "@/app/actions/dashboard";

type Loc = "nl" | "en";

export type SimpleTile = {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  order: number;
};

export type GroupSection = { id: string; name: string; tiles: SimpleTile[] };

const T = {
  nl: {
    global: "Globale tegels",
    globalHint: "Zichtbaar voor iedereen.",
    groups: "Tegels per groep",
    groupHint: "Extra tegels voor leden van deze groep.",
    addTile: "Tegel toevoegen",
    edit: "Bewerken",
    remove: "Verwijderen",
    removeConfirm: "Deze tegel voor iedereen verwijderen?",
    label: "Naam",
    url: "URL",
    icon: "Pictogram",
    color: "Kleur",
    order: "Volgorde",
    save: "Opslaan",
    cancel: "Annuleren",
    newTile: "Nieuwe tegel",
    editTile: "Tegel bewerken",
    none: "Nog geen tegels.",
  },
  en: {
    global: "Global tiles",
    globalHint: "Shown to everyone.",
    groups: "Tiles per group",
    groupHint: "Extra tiles for members of this group.",
    addTile: "Add tile",
    edit: "Edit",
    remove: "Remove",
    removeConfirm: "Remove this tile for everyone?",
    label: "Name",
    url: "URL",
    icon: "Icon",
    color: "Color",
    order: "Order",
    save: "Save",
    cancel: "Cancel",
    newTile: "New tile",
    editTile: "Edit tile",
    none: "No tiles yet.",
  },
} as const;

type EditorState =
  | { scope: "GLOBAL"; groupId: null; tile: SimpleTile | null }
  | { scope: "GROUP"; groupId: string; tile: SimpleTile | null }
  | null;

export function DefaultTilesManager({
  locale,
  globalTiles,
  groups,
}: {
  locale: Loc;
  globalTiles: SimpleTile[];
  groups: GroupSection[];
}) {
  const t = T[locale];
  const [editor, setEditor] = useState<EditorState>(null);
  const [pending, startTransition] = useTransition();

  function remove(tile: SimpleTile) {
    if (!confirm(t.removeConfirm)) return;
    startTransition(() => deleteDefaultTileAction(tile.id));
  }

  return (
    <div className="space-y-6">
      <section className="vtk-tiles-section">
        <div className="vtk-tiles-section-head">
          <div>
            <h2 className="font-semibold">{t.global}</h2>
            <p className="text-sm text-zinc-500">{t.globalHint}</p>
          </div>
          <button
            type="button"
            className="vtk-tile-btn vtk-tile-btn-primary"
            onClick={() => setEditor({ scope: "GLOBAL", groupId: null, tile: null })}
          >
            + {t.addTile}
          </button>
        </div>
        <TileList tiles={globalTiles} t={t} onEdit={(tile) => setEditor({ scope: "GLOBAL", groupId: null, tile })} onRemove={remove} />
      </section>

      <section className="vtk-tiles-section">
        <h2 className="font-semibold">{t.groups}</h2>
        <p className="text-sm text-zinc-500">{t.groupHint}</p>
        <div className="space-y-4 mt-3">
          {groups.map((g) => (
            <div key={g.id} className="vtk-tiles-group">
              <div className="vtk-tiles-section-head">
                <h3 className="font-semibold text-sm">{g.name}</h3>
                <button
                  type="button"
                  className="vtk-tile-btn"
                  onClick={() => setEditor({ scope: "GROUP", groupId: g.id, tile: null })}
                >
                  + {t.addTile}
                </button>
              </div>
              <TileList tiles={g.tiles} t={t} onEdit={(tile) => setEditor({ scope: "GROUP", groupId: g.id, tile })} onRemove={remove} />
            </div>
          ))}
        </div>
      </section>

      {editor && (
        <DefaultTileEditor
          locale={locale}
          state={editor}
          pending={pending}
          onClose={() => setEditor(null)}
          onSubmit={(data) => {
            startTransition(() =>
              saveDefaultTileAction({
                id: editor.tile?.id,
                scope: editor.scope,
                groupId: editor.groupId,
                ...data,
              })
            );
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}

function TileList({
  tiles,
  t,
  onEdit,
  onRemove,
}: {
  tiles: SimpleTile[];
  t: (typeof T)[Loc];
  onEdit: (tile: SimpleTile) => void;
  onRemove: (tile: SimpleTile) => void;
}) {
  if (tiles.length === 0) return <p className="vtk-tiles-empty">{t.none}</p>;
  return (
    <ul className="vtk-tiles-rows">
      {tiles.map((tile) => {
        const c = tileColor(tile.color);
        return (
          <li key={tile.id} className="vtk-tiles-row">
            <span className="vtk-tile-chip vtk-tile-chip-sm" style={{ background: c.chipBg, color: c.chipFg }}>
              <TileIcon name={tile.icon} size={18} />
            </span>
            <span className="vtk-tiles-row-main">
              <strong>{tile.label}</strong>
              <span className="text-zinc-500 text-xs">{tile.url}</span>
            </span>
            <span className="vtk-tiles-row-actions">
              <button type="button" className="vtk-tile-btn" onClick={() => onEdit(tile)}>
                {t.edit}
              </button>
              <button type="button" className="vtk-tile-btn" onClick={() => onRemove(tile)}>
                {t.remove}
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function DefaultTileEditor({
  locale,
  state,
  pending,
  onClose,
  onSubmit,
}: {
  locale: Loc;
  state: NonNullable<EditorState>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (data: { label: string; url: string; icon: string; color: string; order: number }) => void;
}) {
  const t = T[locale];
  const tile = state.tile;
  const [label, setLabel] = useState(tile?.label ?? "");
  const [url, setUrl] = useState(tile?.url ?? "");
  const [icon, setIcon] = useState(tile?.icon ?? "link");
  const [color, setColor] = useState(tile?.color ?? "navy");
  const [order, setOrder] = useState(String(tile?.order ?? 0));
  const c = tileColor(color);

  return (
    <div className="vtk-tile-modal-backdrop" onClick={onClose}>
      <div className="vtk-tile-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tile ? t.editTile : t.newTile}</h3>

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
        <label className="vtk-tile-field">
          <span>{t.order}</span>
          <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
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

        <div className="vtk-tile-modal-actions">
          <button type="button" className="vtk-tile-btn" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="vtk-tile-btn vtk-tile-btn-primary"
            disabled={pending || !label.trim() || !url.trim()}
            onClick={() => onSubmit({ label, url, icon, color, order: parseInt(order, 10) || 0 })}
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
