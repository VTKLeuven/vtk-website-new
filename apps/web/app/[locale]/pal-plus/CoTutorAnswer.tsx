"use client";

import { SaveForm } from "@/components/ui/SaveForm";
import { answerPalPlusCoTutorAction } from "@/app/actions/palPlus";
import { palPlusMemberErrors } from "@/lib/palPlusMessages";

export type CoTutorAnswerCopy = {
  accept: string;
  decline: string;
  accepted: string;
  declined: string;
  declineTitle: string;
  /** Met `{name}`. */
  declineBody: string;
  declineNo: string;
  error: string;
};

/**
 * Ja of nee op een uitnodiging als tweede tutor. Ja gaat meteen; nee vraagt
 * eerst een bevestiging, want wie het aanbod indiende krijgt daar een mail van
 * en terugdraaien kan niet via de site.
 */
export function CoTutorAnswer({
  requestId,
  inviterName,
  nl,
  copy,
}: {
  requestId: string;
  inviterName: string;
  nl: boolean;
  copy: CoTutorAnswerCopy;
}) {
  const errors = palPlusMemberErrors(nl);
  return (
    <div className="pp-invite-actions">
      <SaveForm
        action={answerPalPlusCoTutorAction}
        submitLabel={copy.accept}
        savingLabel="…"
        savedMessage={copy.accepted}
        errorMessages={errors}
        fallbackErrorMessage={copy.error}
        submitSize="sm"
      >
        <input type="hidden" name="id" value={requestId} />
        <input type="hidden" name="answer" value="accept" />
      </SaveForm>
      <SaveForm
        action={answerPalPlusCoTutorAction}
        submitLabel={copy.decline}
        savingLabel="…"
        savedMessage={copy.declined}
        errorMessages={errors}
        fallbackErrorMessage={copy.error}
        submitVariant="ghost"
        submitSize="sm"
        confirmSubmit={{
          title: copy.declineTitle,
          description: copy.declineBody.replace("{name}", inviterName),
          confirmLabel: copy.decline,
          cancelLabel: copy.declineNo,
        }}
      >
        <input type="hidden" name="id" value={requestId} />
        <input type="hidden" name="answer" value="decline" />
      </SaveForm>
    </div>
  );
}
