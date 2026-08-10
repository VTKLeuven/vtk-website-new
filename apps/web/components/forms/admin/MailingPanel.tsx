"use client";

import { useState, useTransition } from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@vtk/ui";
import {
  previewFormMailingAction,
  sendFormMailingAction,
  type MailingPreview,
} from "@/app/actions/formEntries";
import { useToast } from "@/components/ui/toast";
import type { AdminLocale } from "./format";

/**
 * Mailen naar de deelnemers.
 *
 * Verzenden kan pas na een voorbeeld: een mailing naar honderden mensen mag
 * geen verrassing zijn, en een tikfout in een plaatshouder zie je enkel wanneer
 * je hem ingevuld ziet staan.
 */
export function MailingPanel({
  locale,
  formId,
  reviewStatus,
  includeTest,
}: {
  locale: AdminLocale;
  formId: string;
  reviewStatus: string | null;
  includeTest: boolean;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<MailingPreview | null>(null);

  const input = {
    formId,
    locale,
    subject,
    body,
    entryIds: [] as string[],
    reviewStatus,
    includeTest,
  };

  function loadPreview() {
    startTransition(async () => {
      try {
        setPreview(await previewFormMailingAction(input));
      } catch {
        showToast({
          message: nl ? "Voorbeeld maken is niet gelukt." : "Building the preview failed.",
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  function send() {
    startTransition(async () => {
      const state = await sendFormMailingAction(input);
      if (state.status === "error") {
        const messages: Record<string, string> = {
          NO_RECIPIENTS: nl
            ? "Er is niemand om naar te mailen met deze filter."
            : "There is nobody to mail with this filter.",
          NO_MAILSERVER: nl
            ? "Er is geen mailserver ingesteld, dus er vertrekt niets."
            : "No mail server is configured, so nothing would be sent.",
        };
        showToast({
          message: messages[state.code] ?? (nl ? "Versturen is niet gelukt." : "Sending failed."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: nl ? "Mailing verstuurd" : "Mailing sent", variant: "success" });
      setPreview(null);
      setSubject("");
      setBody("");
    });
  }

  return (
    <section className="ticket-admin-section" aria-labelledby="mailing-heading">
      <div className="ticket-admin-section-head">
        <div className="ticket-admin-section-heading">
          <span className="ticket-admin-section-icon">
            <Mail aria-hidden="true" size={17} />
          </span>
          <div>
            <h2 id="mailing-heading">{nl ? "Deelnemers mailen" : "Mail participants"}</h2>
            <p>
              {nl
                ? "Naar iedereen die aan de huidige filter voldoet."
                : "To everyone matching the current filter."}
            </p>
          </div>
        </div>
      </div>

      <div className="ticket-admin-form">
        <div className="ticket-admin-field">
          <label htmlFor="mailing-subject">{nl ? "Onderwerp" : "Subject"}</label>
          <input
            id="mailing-subject"
            value={subject}
            maxLength={200}
            onChange={(event) => {
              setSubject(event.target.value);
              setPreview(null);
            }}
          />
        </div>
        <div className="ticket-admin-field">
          <label htmlFor="mailing-body">{nl ? "Bericht" : "Message"}</label>
          <textarea
            id="mailing-body"
            rows={8}
            value={body}
            maxLength={20_000}
            onChange={(event) => {
              setBody(event.target.value);
              setPreview(null);
            }}
          />
          <span className="ticket-admin-help">
            {nl
              ? "Plaatshouders: {{naam}} en {{antwoorden}}. Een onbekende naam blijft staan zoals ze is, zodat een tikfout opvalt."
              : "Placeholders: {{naam}} and {{antwoorden}}. An unknown name stays as it is, so a typo shows."}
          </span>
        </div>

        {preview ? (
          <div className="form-admin-mail-preview">
            <p>
              {nl
                ? `Dit vertrekt naar ${preview.recipients} ontvanger(s).`
                : `This goes to ${preview.recipients} recipient(s).`}
              {preview.missingEmail > 0
                ? nl
                  ? ` ${preview.missingEmail} inzending(en) hebben geen e-mailadres en vallen weg.`
                  : ` ${preview.missingEmail} entr(ies) have no e-mail address and are skipped.`
                : ""}
            </p>
            {preview.sample ? (
              <>
                <p className="ticket-admin-row-meta">
                  {nl ? "Voorbeeld voor" : "Preview for"} {preview.sample.to}
                </p>
                <p className="ticket-admin-row-title">{preview.sample.subject}</p>
                <pre>{preview.sample.text}</pre>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="ticket-admin-row-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={loadPreview}
            disabled={pending || !subject.trim() || !body.trim()}
          >
            {nl ? "Voorbeeld tonen" : "Show preview"}
          </Button>
          <Button
            type="button"
            onClick={send}
            disabled={pending || !preview || preview.recipients === 0}
          >
            <Send aria-hidden="true" size={15} />
            {pending
              ? nl
                ? "Bezig..."
                : "Sending..."
              : nl
                ? "Versturen"
                : "Send"}
          </Button>
        </div>
      </div>
    </section>
  );
}
