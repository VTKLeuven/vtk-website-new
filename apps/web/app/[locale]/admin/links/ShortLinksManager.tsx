"use client";

import { useState } from "react";
import { Download, QrCode } from "lucide-react";
import { Button, Card, Input, Label } from "@vtk/ui";
import { IconButton, RowActions } from "@/components/ui/IconButton";
import { CheckIcon, CopyIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
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
  const [qrLink, setQrLink] = useState<LinkRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // A save/delete revalidates the route, so `links` arrives as a new array only
  // when the server data actually changed — close any open modal at that point.
  // Adjusting state during render (storing the previous value) is React's
  // recommended pattern for resetting on a prop change; it avoids the extra
  // render an effect would cause.
  const [prevLinks, setPrevLinks] = useState(links);
  if (links !== prevLinks) {
    setPrevLinks(links);
    setEditing(null);
    setDeleting(null);
    setQrLink(null);
  }

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

              <RowActions>
                <IconButton
                  label={
                    copied === l.slug
                      ? nl
                        ? "Gekopieerd"
                        : "Copied"
                      : nl
                        ? "Link kopiëren"
                        : "Copy link"
                  }
                  srLabel={`${nl ? "Link kopiëren" : "Copy link"}: /${l.slug}`}
                  onClick={() => copy(l.slug)}
                >
                  {copied === l.slug ? <CheckIcon /> : <CopyIcon />}
                </IconButton>
                <IconButton
                  label={nl ? "QR-code maken" : "Create QR code"}
                  srLabel={`${nl ? "QR-code maken" : "Create QR code"}: /${l.slug}`}
                  onClick={() => setQrLink(l)}
                >
                  <QrCode size={16} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={nl ? "Bewerken" : "Edit"}
                  srLabel={`${nl ? "Bewerken" : "Edit"}: /${l.slug}`}
                  onClick={() => setEditing(l)}
                >
                  <PencilIcon />
                </IconButton>
                <IconButton
                  label={nl ? "Verwijderen" : "Delete"}
                  srLabel={`${nl ? "Verwijderen" : "Delete"}: /${l.slug}`}
                  tone="danger"
                  onClick={() => setDeleting(l)}
                >
                  <TrashIcon />
                </IconButton>
              </RowActions>
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

      {qrLink !== null && (
        <QrModal host={host} nl={nl} link={qrLink} onClose={() => setQrLink(null)} />
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

function QrModal({
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
  const [retry, setRetry] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const endpoint = `/api/shortlinks/${encodeURIComponent(link.slug)}/qr`;
  const previewEndpoint = `${endpoint}?preview=${retry}`;
  const filename = `vtk-${link.slug}-qr.png`;
  const inactive = !link.enabled || link.expired;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <Card
        className="my-8 w-full max-w-md p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortlink-qr-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="shortlink-qr-title" className="text-lg font-semibold">
              {nl ? "QR-code" : "QR code"}
            </h2>
            <p className="mt-1 break-all text-sm text-zinc-500">
              https://{host}/{link.slug}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-zinc-400 hover:text-zinc-700"
            onClick={onClose}
            aria-label={nl ? "Sluiten" : "Close"}
          >
            ✕
          </button>
        </div>

        <figure className="mx-auto mt-5 grid aspect-square w-full max-w-[340px] place-items-center overflow-hidden rounded-[28px] border border-vtk-blue/10 bg-white p-2 shadow-sm">
          {imageFailed ? (
            <div className="px-6 text-center">
              <p className="text-sm text-red-700">
                {nl ? "De QR-code kon niet geladen worden." : "The QR code could not be loaded."}
              </p>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-vtk-ink underline underline-offset-4"
                onClick={() => {
                  setImageFailed(false);
                  setRetry((value) => value + 1);
                }}
              >
                {nl ? "Opnieuw proberen" : "Try again"}
              </button>
            </div>
          ) : (
            <>
              {/* Dynamisch gegenereerde PNG; de image-optimizer kan hier niets winnen. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewEndpoint}
                alt={nl ? `QR-code voor ${host}/${link.slug}` : `QR code for ${host}/${link.slug}`}
                className="aspect-square h-auto w-full rounded-[22px]"
                onError={() => setImageFailed(true)}
              />
            </>
          )}
        </figure>

        <p className="mt-4 text-sm leading-6 text-zinc-600">
          {nl
            ? "PNG van 1200 × 1200 px met afgeronde VTK-blauwe vormgeving en het VTK-logo. Test voor drukwerk altijd één proefscan op het uiteindelijke formaat."
            : "1200 × 1200 px PNG with rounded VTK blue styling and the VTK logo. Always test-scan one proof at its final print size."}
        </p>

        {inactive ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {nl
              ? "Let op: deze verkorte link is momenteel niet actief. De QR-code werkt pas wanneer de link actief en niet verlopen is."
              : "Note: this short link is currently inactive. The QR code only works while the link is active and has not expired."}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {nl ? "Sluiten" : "Close"}
          </Button>
          <a
            href={`${endpoint}?download=1`}
            download={filename}
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface shadow-sm transition-colors hover:bg-vtk-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vtk-ink"
          >
            <Download size={16} aria-hidden="true" />
            {nl ? "PNG downloaden" : "Download PNG"}
          </a>
        </div>
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
