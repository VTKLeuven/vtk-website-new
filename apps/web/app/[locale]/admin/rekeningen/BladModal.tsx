"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@vtk/ui";
import { Modal } from "@/app/[locale]/admin/admin-table";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE, type SaveAction } from "@/lib/saveState";

/**
 * Het blad bekijken voor je het downloadt of doorstuurt.
 *
 * Billsheet had dit ook, en om een goede reden: het bonnetje komt van een
 * telefoon en ligt vaak op zijn kant. Wie het blad ongezien doorstuurt, stuurt de
 * boekhouder een liggende kassabon.
 *
 * Het voorbeeld is gewoon een `<iframe>` op de blad-route, en draaien verandert
 * enkel `?rotate=` in die URL. Het alternatief (met `fetch` een blob ophalen en
 * die in de iframe hangen) gaf hetzelfde beeld, maar met een laadtoestand, een
 * foutafhandeling en blob-URL's die opgeruimd moeten worden; de browser doet dit
 * allemaal zelf. Downloaden is om dezelfde reden een gewone link: de route zet
 * `Content-Disposition` al met de juiste bestandsnaam.
 */
export function BladModal({
  expenseId,
  locale,
  mode,
  defaultRecipient,
  sendAction,
  labels,
  onClose,
}: {
  expenseId: string;
  locale: "nl" | "en";
  mode: "download" | "send";
  defaultRecipient?: string;
  sendAction?: SaveAction;
  labels: {
    savedMessage: string;
    fallbackErrorMessage: string;
    errorMessages: Record<string, string>;
  };
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();

  const [rotate, setRotate] = useState(0);
  const [recipient, setRecipient] = useState(defaultRecipient ?? "");

  const [sendState, sendFormAction, sending] = useActionState(
    sendAction ?? (async () => SAVE_IDLE),
    SAVE_IDLE,
  );
  const handledSend = useRef<number | null>(null);

  useEffect(() => {
    if (sendState.status === "idle" || handledSend.current === sendState.nonce) return;
    handledSend.current = sendState.nonce;
    if (sendState.status === "success") {
      showToast({ message: labels.savedMessage, variant: "success" });
      router.refresh();
      onClose();
    } else {
      showToast({
        message:
          labels.errorMessages[sendState.code] ??
          sendState.detail ??
          labels.fallbackErrorMessage,
        variant: "error",
        duration: 0,
      });
    }
  }, [sendState, showToast, labels, router, onClose]);

  function send() {
    if (!sendAction) return;
    const data = new FormData();
    data.set("id", expenseId);
    data.set("to", recipient);
    data.set("rotate", String(rotate));
    startTransition(() => sendFormAction(data));
  }

  const bladUrl = (inline: boolean) =>
    `/api/admin/rekeningen/${expenseId}/blad?rotate=${rotate}${inline ? "&inline=1" : ""}`;

  return (
    <Modal
      title={
        mode === "download"
          ? nl
            ? "Blad bekijken en downloaden"
            : "Preview and download the sheet"
          : nl
            ? "Blad doorsturen naar de boekhouding"
            : "Forward the sheet to the accountant"
      }
      size="lg"
      onClose={onClose}
    >
      <div className="space-y-4">
        {mode === "send" && (
          <div>
            <Label htmlFor="blad-recipient">{nl ? "Sturen naar" : "Send to"}</Label>
            <Input
              id="blad-recipient"
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="boekhouding@voorbeeld.be"
            />
            {!defaultRecipient && (
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl
                  ? "Er staat nog geen vast adres van de boekhouder ingesteld; dat doe je bij Instellingen."
                  : "No fixed accountant address is configured yet; set it under Settings."}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {mode === "download" ? (
            <a
              href={bladUrl(false)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-vtk-ink bg-vtk-ink px-4 text-sm font-medium text-vtk-surface hover:bg-vtk-navy"
            >
              {nl ? "Downloaden" : "Download"}
            </a>
          ) : (
            <Button type="button" onClick={send} disabled={sending || !recipient.trim()}>
              {sending ? (nl ? "Versturen..." : "Sending...") : nl ? "Versturen" : "Send"}
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            onClick={() => setRotate((current) => (current + 90) % 360)}
            disabled={sending}
          >
            {nl ? "Draai 90°" : "Rotate 90°"}
          </Button>
          <span className="text-xs text-[#5c667f]">
            {rotate === 0 ? (nl ? "Niet gedraaid" : "Not rotated") : `${rotate}°`}
          </span>

          <Button type="button" variant="ghost" className="ml-auto" onClick={onClose}>
            {nl ? "Sluiten" : "Close"}
          </Button>
        </div>

        {/* `key` op de rotatie: zonder dat hertekent de browser de PDF-lezer niet
            wanneer enkel de querystring verandert, en blijf je naar het vorige
            blad kijken. */}
        <iframe
          key={rotate}
          src={bladUrl(true)}
          title={nl ? "Voorbeeld van het blad" : "Preview of the sheet"}
          className="h-[70vh] w-full rounded-xl border border-vtk-blue/15 bg-white"
        />

        <p className="text-xs text-[#5c667f]">
          {nl
            ? "Ligt het bonnetje op zijn kant? Draai het hier recht; het blad dat je downloadt of verstuurt is precies wat je hierboven ziet."
            : "Is the receipt sideways? Straighten it here; the sheet you download or send is exactly what you see above."}
        </p>
      </div>
    </Modal>
  );
}
