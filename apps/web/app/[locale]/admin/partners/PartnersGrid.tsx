"use client";

import { useRef, useState, useTransition } from "react";
import { Button, ConfirmDialog, Input, Label } from "@vtk/ui";
import {
  deletePartnerAction,
  reorderPartnersAction,
  savePartnerAction,
} from "@/app/actions/pocs-partners";

export type PartnerTile = {
  id: string;
  name: string;
  url: string | null;
  logoKey: string;
  logoUrl: string | null;
  active: boolean;
};

export function PartnersGrid({
  locale,
  partners,
}: {
  locale: "nl" | "en";
  partners: PartnerTile[];
}) {
  const nl = locale === "nl";
  const [items, setItems] = useState<PartnerTile[]>(partners);
  const [editing, setEditing] = useState<PartnerTile | null>(null);
  const [, startTransition] = useTransition();

  const dragFrom = useRef<number | null>(null);
  const dragged = useRef(false);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function persistOrder(next: PartnerTile[]) {
    startTransition(() => void reorderPartnersAction(next.map((p) => p.id)));
  }

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    persistOrder(next);
  }

  return (
    <>
      <p className="text-sm text-zinc-500">
        {nl
          ? "Sleep de tegels om de volgorde te wijzigen; klik op een tegel om naam, URL of logo aan te passen. De indeling komt overeen met de website."
          : "Drag the tiles to reorder them; click a tile to edit its name, URL or logo. The layout mirrors the website."}
      </p>

      {items.length === 0 ? (
        <p className="p-8 text-center text-zinc-500">{nl ? "Nog geen partners" : "No partners yet"}</p>
      ) : (
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {items.map((p, index) => (
            <button
              key={p.id}
              type="button"
              draggable
              onDragStart={() => {
                dragFrom.current = index;
                dragged.current = true;
              }}
              onDragEnd={() => {
                dragged.current = false;
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
              onClick={() => {
                if (dragged.current) return;
                setEditing(p);
              }}
              className={[
                "group relative grid aspect-[16/9] cursor-grab place-items-center rounded-2xl border bg-white p-3 text-center text-xs text-zinc-500 transition-transform active:cursor-grabbing",
                overIndex === index ? "border-vtk-ink ring-2 ring-vtk-yellow" : "border-vtk-blue/15",
                p.active ? "" : "opacity-50",
                "hover:-translate-y-0.5 hover:border-vtk-blue/30",
              ].join(" ")}
              title={nl ? "Sleep om te herschikken; klik om te bewerken" : "Drag to reorder; click to edit"}
            >
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logoUrl} alt={p.name} className="max-h-[52px] max-w-full object-contain" />
              ) : (
                <span>{p.name}</span>
              )}
              {!p.active && (
                <span className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium text-white">
                  {nl ? "Inactief" : "Inactive"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <EditPartnerModal
          key={editing.id}
          locale={locale}
          partner={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditPartnerModal({
  locale,
  partner,
  onClose,
}: {
  locale: "nl" | "en";
  partner: PartnerTile;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const [logoKey, setLogoKey] = useState(partner.logoKey);
  const [previewUrl, setPreviewUrl] = useState<string | null>(partner.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "image");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      if (!res.ok) {
        setErr(nl ? "Upload mislukt" : "Upload failed");
        return;
      }
      const data = (await res.json()) as { key: string; url: string | null };
      setLogoKey(data.key);
      setPreviewUrl(data.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-vtk-blue/15 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{nl ? "Partner bewerken" : "Edit partner"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700"
            aria-label={nl ? "Sluiten" : "Close"}
          >
            ✕
          </button>
        </div>

        <form action={savePartnerAction} className="space-y-4">
          <input type="hidden" name="id" value={partner.id} />
          <input type="hidden" name="logoKey" value={logoKey} />

          <div className="flex items-center gap-4">
            <div className="grid aspect-[16/9] w-32 shrink-0 place-items-center rounded-xl border border-vtk-blue/15 bg-white p-2">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={partner.name} className="max-h-[52px] max-w-full object-contain" />
              ) : (
                <span className="text-xs text-zinc-400">{nl ? "Geen logo" : "No logo"}</span>
              )}
            </div>
            <div>
              <Label>{nl ? "Logo vervangen" : "Replace logo"}</Label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
                className="text-xs"
              />
              {uploading && <p className="mt-1 text-xs text-zinc-500">{nl ? "Bezig..." : "Uploading..."}</p>}
              {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
            </div>
          </div>

          <div>
            <Label>Name</Label>
            <Input name="name" defaultValue={partner.name} required />
          </div>
          <div>
            <Label>URL</Label>
            <Input name="url" defaultValue={partner.url ?? ""} placeholder="https://..." />
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={partner.active} />
            {nl ? "Actief" : "Active"}
          </label>

          <div className="flex items-center justify-between pt-2">
            <Button type="submit" disabled={uploading}>
              {nl ? "Opslaan" : "Save"}
            </Button>
            <DeletePartnerButton locale={locale} id={partner.id} name={partner.name} />
          </div>
        </form>
      </div>
    </div>
  );
}

function DeletePartnerButton({
  locale,
  id,
  name,
}: {
  locale: "nl" | "en";
  id: string;
  name: string;
}) {
  const nl = locale === "nl";
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const form = new FormData();
    form.append("id", id);
    startTransition(() => void deletePartnerAction(form));
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        {nl ? "Verwijderen" : "Delete"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={nl ? "Partner verwijderen?" : "Delete partner?"}
        description={
          nl
            ? `"${name}" wordt permanent verwijderd, inclusief het logo. Dit kan niet ongedaan gemaakt worden.`
            : `"${name}" will be permanently deleted, including its logo. This cannot be undone.`
        }
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
