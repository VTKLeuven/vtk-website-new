"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { IconButton, RowActions } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { deletePageAssetAction } from "@/app/actions/pages";
import type { AssetNode } from "./ContentManager";

export function AssetList({
  locale,
  pageId,
  assets,
}: {
  locale: Locale;
  pageId: string;
  assets: AssetNode[];
}) {
  const nl = locale === "nl";
  const [confirming, setConfirming] = useState<AssetNode | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const asset = confirming;
    if (!asset) return;
    const form = new FormData();
    form.append("id", asset.id);
    form.append("pageId", pageId);
    startTransition(async () => {
      await deletePageAssetAction(form);
      setConfirming(null);
    });
  }

  if (assets.length === 0) {
    return (
      <p className="text-sm text-[#5c667f]">
        {nl ? "Nog geen bijlagen." : "No attachments yet."}
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-vtk-blue/10">
        {assets.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium text-vtk-ink">{a.labelNl}</div>
              <div className="truncate text-xs text-[#5c667f]">
                {a.kind === "EMBEDDED_PDF" ? "PDF embed" : "Download"} ·{" "}
                <a
                  href={a.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {a.storageKey}
                </a>
              </div>
            </div>
            <RowActions>
              <IconButton
                label={nl ? "Verwijderen" : "Remove"}
                srLabel={`${nl ? "Verwijderen" : "Remove"}: ${a.labelNl}`}
                tone="danger"
                onClick={() => setConfirming(a)}
              >
                <TrashIcon />
              </IconButton>
            </RowActions>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirming !== null}
        title={nl ? "Bijlage verwijderen?" : "Delete attachment?"}
        description={
          nl
            ? `"${confirming?.labelNl}" wordt van deze pagina gehaald. Dit kan niet ongedaan gemaakt worden.`
            : `"${confirming?.labelNl}" will be removed from this page. This cannot be undone.`
        }
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
