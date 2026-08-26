"use client";

import { useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import { TileVisualPicker } from "@/components/admin/TileVisualPicker";
import { TILE_COLORS, TileChip } from "@/lib/dashboard-tiles";
import {
  deleteDefaultTileAction,
  reorderDefaultTilesAction,
  saveDefaultTileAction,
} from "@/app/actions/dashboard";

type Loc = "nl" | "en";

export type SimpleTile = {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string;
  imageKey: string | null;
  order: number;
};

export type GroupSection = { id: string; name: string; tiles: SimpleTile[] };

const T = {
  nl: {
    personal: "Van jou",
    personalHint: "Alleen jij ziet deze snelkoppelingen op jouw dashboard.",
    global: "Voor iedereen",
    globalHint:
      "Iedereen die inlogt ziet deze tegels, onder de kop \"Voor iedereen\" op het dashboard.",
    groups: "Per post of werkgroep",
    groupHint:
      "Enkel leden van die post zien deze tegels, in een eigen sectie met de naam van de post.",
    addTile: "Tegel toevoegen",
    edit: "Bewerken",
    remove: "Verwijderen",
    removeTile: "Tegel verwijderen?",
    removeConfirm: (label: string) =>
      `"${label}" verdwijnt van het dashboard. Dit kan niet ongedaan gemaakt worden.`,
    label: "Naam",
    url: "URL",
    color: "Kleur",
    save: "Opslaan",
    cancel: "Annuleren",
    newTile: "Nieuwe tegel",
    editTile: "Tegel bewerken",
    none: "Nog geen tegels.",
    dragHint: "Sleep om de volgorde te wijzigen",
  },
  en: {
    personal: "Yours",
    personalHint: "Only you see these shortcuts on your dashboard.",
    global: "For everyone",
    globalHint:
      'Everyone who signs in sees these tiles, under the "For everyone" heading on the dashboard.',
    groups: "Per post or working group",
    groupHint:
      "Only members of that post see these tiles, in a section of their own carrying the post's name.",
    addTile: "Add tile",
    edit: "Edit",
    remove: "Remove",
    removeTile: "Remove tile?",
    removeConfirm: (label: string) =>
      `"${label}" will disappear from the dashboard. This cannot be undone.`,
    label: "Name",
    url: "URL",
    color: "Color",
    save: "Save",
    cancel: "Cancel",
    newTile: "New tile",
    editTile: "Edit tile",
    none: "No tiles yet.",
    dragHint: "Drag to reorder",
  },
} as const;

type EditorState =
  | { scope: "USER"; groupId: null; tile: SimpleTile | null }
  | { scope: "GLOBAL"; groupId: null; tile: SimpleTile | null }
  | { scope: "GROUP"; groupId: string; tile: SimpleTile | null }
  | null;

export function DefaultTilesManager({
  locale,
  canManageGlobal,
  canManageGroups,
  personalTiles,
  globalTiles,
  groups,
}: {
  locale: Loc;
  canManageGlobal: boolean;
  canManageGroups: boolean;
  personalTiles: SimpleTile[];
  globalTiles: SimpleTile[];
  groups: GroupSection[];
}) {
  const t = T[locale];
  const [editor, setEditor] = useState<EditorState>(null);
  const [removing, setRemoving] = useState<SimpleTile | null>(null);
  const [pending, startTransition] = useTransition();

  const [prevPersonalTiles, setPrevPersonalTiles] = useState<SimpleTile[]>(personalTiles);
  const [ownTiles, setOwnTiles] = useState<SimpleTile[]>(personalTiles);
  if (personalTiles !== prevPersonalTiles) {
    setPrevPersonalTiles(personalTiles);
    setOwnTiles(personalTiles);
  }

  const [prevGlobalTiles, setPrevGlobalTiles] = useState<SimpleTile[]>(globalTiles);
  const [pubTiles, setPubTiles] = useState<SimpleTile[]>(globalTiles);
  if (globalTiles !== prevGlobalTiles) {
    setPrevGlobalTiles(globalTiles);
    setPubTiles(globalTiles);
  }

  const [prevGroups, setPrevGroups] = useState<GroupSection[]>(groups);
  const [grpSections, setGrpSections] = useState<GroupSection[]>(groups);
  if (groups !== prevGroups) {
    setPrevGroups(groups);
    setGrpSections(groups);
  }

  function remove(tile: SimpleTile) {
    startTransition(async () => {
      await deleteDefaultTileAction(tile.id);
      setRemoving(null);
    });
  }

  function handleReorderPersonal(next: SimpleTile[]) {
    setOwnTiles(next);
    startTransition(() =>
      void reorderDefaultTilesAction({ scope: "USER", ids: next.map((x) => x.id) })
    );
  }

  function handleReorderGlobal(next: SimpleTile[]) {
    setPubTiles(next);
    startTransition(() =>
      void reorderDefaultTilesAction({ scope: "GLOBAL", ids: next.map((x) => x.id) })
    );
  }

  function handleReorderGroup(groupId: string, next: SimpleTile[]) {
    setGrpSections((cur) =>
      cur.map((g) => (g.id === groupId ? { ...g, tiles: next } : g))
    );
    startTransition(() =>
      void reorderDefaultTilesAction({ scope: "GROUP", groupId, ids: next.map((x) => x.id) })
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Eigen tegels (Van jou) */}
      <section className="vtk-tiles-section">
        <div className="vtk-tiles-section-head">
          <div>
            <h2 className="font-semibold">{t.personal}</h2>
            <p className="text-sm text-zinc-500">{t.personalHint}</p>
          </div>
          <button
            type="button"
            className="vtk-tile-btn vtk-tile-btn-primary"
            onClick={() => setEditor({ scope: "USER", groupId: null, tile: null })}
          >
            + {t.addTile}
          </button>
        </div>
        <TileList
          tiles={ownTiles}
          t={t}
          onEdit={(tile) => setEditor({ scope: "USER", groupId: null, tile })}
          onRemove={setRemoving}
          onReorder={handleReorderPersonal}
        />
      </section>

      {/* 2. Voor iedereen */}
      {canManageGlobal ? (
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
          <TileList
            tiles={pubTiles}
            t={t}
            onEdit={(tile) => setEditor({ scope: "GLOBAL", groupId: null, tile })}
            onRemove={setRemoving}
            onReorder={handleReorderGlobal}
          />
        </section>
      ) : null}

      {/* 3. Per post of werkgroep */}
      {canManageGroups ? (
        <section className="vtk-tiles-section">
          <h2 className="font-semibold">{t.groups}</h2>
          <p className="text-sm text-zinc-500">{t.groupHint}</p>
          <div className="space-y-4 mt-3">
            {grpSections.map((g) => (
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
                <TileList
                  tiles={g.tiles}
                  t={t}
                  onEdit={(tile) =>
                    setEditor({ scope: "GROUP", groupId: g.id, tile })
                  }
                  onRemove={setRemoving}
                  onReorder={(next) => handleReorderGroup(g.id, next)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

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

      <ConfirmDialog
        open={removing !== null}
        title={t.removeTile}
        description={t.removeConfirm(removing?.label ?? "")}
        confirmLabel={t.remove}
        cancelLabel={t.cancel}
        pending={pending}
        onConfirm={() => removing && remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function TileList({
  tiles,
  t,
  onEdit,
  onRemove,
  onReorder,
}: {
  tiles: SimpleTile[];
  t: (typeof T)[Loc];
  onEdit: (tile: SimpleTile) => void;
  onRemove: (tile: SimpleTile) => void;
  onReorder: (next: SimpleTile[]) => void;
}) {
  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (tiles.length === 0) return <p className="vtk-tiles-empty">{t.none}</p>;

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...tiles];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  }

  return (
    <ul className="vtk-tiles-rows">
      {tiles.map((tile, index) => {
        return (
          <li
            key={tile.id}
            className={`vtk-tiles-row transition-colors ${
              overIndex === index ? "bg-vtk-yellow/20 border-vtk-blue" : ""
            }`}
            draggable
            onDragStart={() => {
              dragFrom.current = index;
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIndex !== index) setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(index);
            }}
          >
            <span
              className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-700 px-1 text-base select-none"
              title={t.dragHint}
              aria-hidden="true"
            >
              ⠿
            </span>
            <TileChip
              icon={tile.icon}
              imageKey={tile.imageKey}
              color={tile.color}
              size={18}
              className="vtk-tile-chip-sm"
            />
            <span className="vtk-tiles-row-main">
              <strong>{tile.label}</strong>
              <span className="text-zinc-500 text-xs">{tile.url}</span>
            </span>
            <span className="vtk-tiles-row-actions">
              <IconButton label={t.edit} srLabel={`${t.edit}: ${tile.label}`} onClick={() => onEdit(tile)}>
                <PencilIcon />
              </IconButton>
              <IconButton
                label={t.remove}
                srLabel={`${t.remove}: ${tile.label}`}
                tone="danger"
                onClick={() => onRemove(tile)}
              >
                <TrashIcon />
              </IconButton>
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
  onSubmit: (data: {
    label: string;
    url: string;
    icon: string;
    color: string;
    imageKey: string | null;
  }) => void;
}) {
  const t = T[locale];
  const tile = state.tile;
  const [label, setLabel] = useState(tile?.label ?? "");
  const [url, setUrl] = useState(tile?.url ?? "");
  const [icon, setIcon] = useState(tile?.icon ?? "link");
  const [color, setColor] = useState(tile?.color ?? "navy");
  const [imageKey, setImageKey] = useState<string | null>(tile?.imageKey ?? null);

  return (
    <div className="vtk-tile-modal-backdrop" onClick={onClose}>
      <div className="vtk-tile-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tile ? t.editTile : t.newTile}</h3>

        <div className="vtk-tile-preview">
          <TileChip icon={icon} imageKey={imageKey} color={color} />
          <span className="vtk-shortcut-label">{label || "—"}</span>
        </div>

        <label className="vtk-tile-field">
          <span>{t.label}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </label>
        <label className="vtk-tile-field">
          <span>{t.url}</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>

        <TileVisualPicker
          locale={locale}
          icon={icon}
          imageKey={imageKey}
          onIconChange={setIcon}
          onImageChange={setImageKey}
        />

        <div className="vtk-tile-field">
          <span>{t.color}</span>
          <div className="vtk-color-grid">
            {TILE_COLORS.map((col) => (
              <button
                key={col.key}
                type="button"
                className={"vtk-color-opt" + (color === col.key ? " is-active" : "")}
                title={locale === "nl" ? col.labelNl : col.labelEn}
                aria-label={locale === "nl" ? col.labelNl : col.labelEn}
                aria-pressed={color === col.key}
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
            onClick={() =>
              onSubmit({ label, url, icon, color, imageKey })
            }
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
