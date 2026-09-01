"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@vtk/ui";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import type { SaveAction } from "@/lib/saveState";
import { BladModal } from "./BladModal";

/**
 * De knoppenrij onderaan de inspector. Bewust tekstknoppen en geen icoontjes:
 * dit zijn de primaire acties op één rekening, geen herhaalde rij-acties (zie
 * CLAUDE.md).
 */
export function ExpenseActionBar({
  expenseId,
  locale,
  editHref,
  canEdit,
  canSend,
  defaultRecipient,
  mail,
  sendAction,
  deleteAction,
  deleteDescription,
  labels,
}: {
  expenseId: string;
  locale: "nl" | "en";
  editHref: string;
  canEdit: boolean;
  canSend: boolean;
  defaultRecipient: string;
  /** De mail die straks vertrekt; het venster toont ze als voorbeeld. */
  mail: { from: string; subject: string; body: string; attachmentName: string };
  sendAction: SaveAction;
  deleteAction: (formData: FormData) => Promise<void>;
  /** Wat er precies weg is; staat in de bevestigingsdialoog. */
  deleteDescription: string;
  labels: {
    savedMessage: string;
    sentMessage: string;
    fallbackErrorMessage: string;
    errorMessages: Record<string, string>;
  };
}) {
  const nl = locale === "nl";
  const [modal, setModal] = useState<"download" | "send" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-t border-vtk-blue/10 bg-vtk-blue-muted/60 px-4 py-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setModal("download")}>
          {nl ? "Blad bekijken" : "View sheet"}
        </Button>
        {canSend && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setModal("send")}>
            {nl ? "Naar boekhouding..." : "To the accountant..."}
          </Button>
        )}
        {canEdit && (
          <Link
            href={editHref}
            className="inline-flex h-8 items-center justify-center rounded-full border border-vtk-blue/15 px-3 text-sm font-medium text-vtk-ink transition-colors hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70"
          >
            {nl ? "Bewerken" : "Edit"}
          </Link>
        )}
        {canEdit && (
          <DeleteButton
            action={deleteAction}
            fields={{ id: expenseId }}
            title={nl ? "Rekening verwijderen?" : "Delete expense?"}
            description={deleteDescription}
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={
              nl ? "Rekening en bonnetje verwijderd." : "Expense and receipt deleted."
            }
          >
            {nl ? "Verwijderen" : "Delete"}
          </DeleteButton>
        )}
      </div>

      {modal && (
        <BladModal
          expenseId={expenseId}
          locale={locale}
          mode={modal}
          defaultRecipient={modal === "send" ? defaultRecipient : undefined}
          mail={mail}
          sendAction={sendAction}
          labels={{
            savedMessage: labels.sentMessage,
            fallbackErrorMessage: labels.fallbackErrorMessage,
            errorMessages: labels.errorMessages,
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
