"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Label } from "@vtk/ui";
import { deleteShortLinkAction, saveShortLinkAction } from "@/app/actions/shortlinks";

export type LinkRow = {
  id: string;
  slug: string;
  url: string;
  enabled: boolean;
  clicks: number;
  createdByName: string | null;
  createdAtLabel: string;
  expiresValue: string; // "YYYY-MM-DD" for the date input, or "" when none
  expiresLabel: string | null; // formatted date, or null when none
  expired: boolean;
};

// "null" = closed, "new" = create form, an id-bearing row = edit that link.
type Editing = LinkRow | "new" | null;

export function ShortLinksManager({
  host,
  nl,
  links,
}: {
  host: string;
  nl: boolean;
  links: LinkRow[];
}) {
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<LinkRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // A save/delete revalidates the route, so `links` arrives as a new array only
  // when the server data actually changed — close any open modal at that point.
  useEffect(() => {
    setEditing(null);
    setDeleting(null);
  }, [links]);

  const inactiveCount = links.filter((l) => !l.enabled || l.expired).length;
  const visible = showInactive ? links : links.filter((l) => l.enabled && !l.expired);

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(`https://${host}/${slug}`);
      setCopied(slug);
      setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {nl ? "Toon inactieve" : "Show inactive"}
          {inactiveCount > 0 && <span className="text-zinc-400">({inactiveCount})</span>}
        </label>
        <Button size="sm" onClick={() => setEditing("new")}>
          {nl ? "Nieuwe link" : "New link"}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-zinc-200">
          {visible.map((l) => (
            <li
              key={l.id}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                l.enabled && !l.expired ? "" : "bg-zinc-50/60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-vtk-ink">
                  {host}/{l.slug}
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-zinc-400 hover:text-zinc-600 hover:underline"
                  title={l.url}
                >
                  → {l.url}
                </a>
              </div>

              <div className="hidden w-32 shrink-0 text-xs leading-tight text-zinc-500 lg:block">
                {l.createdByName ?? (nl ? "onbekend" : "unknown")}
                <br />
                {l.createdAtLabel}
              </div>

              <div className="w-16 shrink-0 text-right tabular-nums text-xs text-zinc-500">
                {l.clicks} {nl ? "kliks" : "clicks"}
              </div>

              <div className="hidden w-28 shrink-0 sm:block">
                <StatusPill link={l} nl={nl} />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => copy(l.slug)}>
                  {copied === l.slug ? (nl ? "Gekopieerd" : "Copied") : nl ? "Kopieer" : "Copy"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>
                  {nl ? "Bewerk" : "Edit"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(l)}>
                  {nl ? "Verwijder" : "Delete"}
                </Button>
              </div>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="p-8 text-center text-zinc-500">
              {links.length === 0
                ? nl
                  ? "Nog geen verkorte links"
                  : "No short links yet"
                : nl
                  ? "Geen actieve links — vink 'Toon inactieve' aan."
                  : "No active links — tick 'Show inactive'."}
            </li>
          )}
        </ul>
      </Card>

      {editing !== null && (
        <EditModal
          host={host}
          nl={nl}
          link={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting !== null && (
        <DeleteModal host={host} nl={nl} link={deleting} onClose={() => setDeleting(null)} />
      )}
    </>
  );
}

function StatusPill({ link, nl }: { link: LinkRow; nl: boolean }) {
  if (!link.enabled) {
    return (
      <span className="inline-block rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
        {nl ? "Uitgeschakeld" : "Disabled"}
      </span>
    );
  }
  if (link.expired) {
    return (
      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        {nl ? "Verlopen" : "Expired"} {link.expiresLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
      {nl ? "Actief" : "Active"}
      {link.expiresLabel && (
        <span className="text-emerald-600/70">
          · {nl ? "tot" : "until"} {link.expiresLabel}
        </span>
      )}
    </span>
  );
}

function EditModal({
  host,
  nl,
  link,
  onClose,
}: {
  host: string;
  nl: boolean;
  link: LinkRow | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isEdit = link !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <Card className="my-8 w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? (nl ? "Link bewerken" : "Edit link") : nl ? "Nieuwe link" : "New link"}
          </h2>
          <button className="text-zinc-400 hover:text-zinc-700" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form action={saveShortLinkAction} onSubmit={() => setBusy(true)} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={link.id} />}
          <div>
            <Label>Slug</Label>
            <div className="flex items-center gap-1">
              <span className="whitespace-nowrap text-sm text-zinc-400">{host}/</span>
              <Input name="slug" required defaultValue={link?.slug} placeholder="mijn-link" />
            </div>
          </div>
          <div>
            <Label>{nl ? "Doel-URL" : "Destination URL"}</Label>
            <Input name="url" type="url" required defaultValue={link?.url} placeholder="https://..." />
          </div>
          <div>
            <Label>{nl ? "Verloopt op (optioneel)" : "Expires on (optional)"}</Label>
            <Input name="expiresAt" type="date" defaultValue={link?.expiresValue ?? ""} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={link ? link.enabled : true} />
            {nl ? "Actief" : "Active"}
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              {nl ? "Annuleren" : "Cancel"}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (nl ? "Bezig..." : "Saving...") : nl ? "Opslaan" : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function DeleteModal({
  host,
  nl,
  link,
  onClose,
}: {
  host: string;
  nl: boolean;
  link: LinkRow;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <Card className="my-8 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{nl ? "Link verwijderen?" : "Delete link?"}</h2>
        <p className="mt-2 text-sm text-zinc-600">
          {nl ? "Je staat op het punt " : "You are about to delete "}
          <span className="font-medium text-vtk-ink">
            {host}/{link.slug}
          </span>
          {nl
            ? " te verwijderen. Bezoekers van deze link krijgen daarna een 404. Dit kan niet ongedaan gemaakt worden."
            : ". Visitors of this link will then get a 404. This cannot be undone."}
        </p>
        <form
          action={deleteShortLinkAction}
          onSubmit={() => setBusy(true)}
          className="mt-5 flex justify-end gap-2"
        >
          <input type="hidden" name="id" value={link.id} />
          <Button type="button" variant="ghost" onClick={onClose}>
            {nl ? "Annuleren" : "Cancel"}
          </Button>
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? (nl ? "Bezig..." : "Deleting...") : nl ? "Verwijderen" : "Delete"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
