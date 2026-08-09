"use client";

import { useCallback, useState } from "react";
import { Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { sendContactMessageAction } from "@/app/actions/contact";
import { CONTACT_LIMITS, type ContactErrorCode } from "@/lib/contactForm";

/** De `contact`-namespace uit de dictionaries; komt als prop binnen, want dit is client. */
export type ContactCopy = {
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailHelp: string;
  subjectLabel: string;
  subjectPlaceholder: string;
  messageLabel: string;
  messagePlaceholder: string;
  messageHelp: string;
  honeypotLabel: string;
  submit: string;
  submitting: string;
  sent: string;
  errors: Record<string, string>;
};

function withMax(template: string, max: number): string {
  return template.replace("{max}", String(max));
}

/**
 * Het contactformulier.
 *
 * De velden zijn gecontroleerd (en niet kaal uncontrolled) om één reden: na een
 * geslaagde verzending moeten ze leeglopen, terwijl ze na een fout net moeten
 * blijven staan. Wie een lang bericht typte en een typfout in zijn adres had,
 * mag dat bericht niet kwijtraken.
 */
export function ContactForm({ copy }: { copy: ContactCopy }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const clear = useCallback(() => {
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
  }, []);

  // De foutcodes van de action, elk met een melding die zegt wát er misging.
  // Onbekende codes vallen terug op `errors.fallback`.
  const errorMessages: Record<ContactErrorCode, string> = {
    NAME_REQUIRED: copy.errors.nameRequired,
    NAME_TOO_LONG: withMax(copy.errors.nameTooLong, CONTACT_LIMITS.name),
    EMAIL_REQUIRED: copy.errors.emailRequired,
    EMAIL_INVALID: copy.errors.emailInvalid,
    EMAIL_TOO_LONG: copy.errors.emailTooLong,
    SUBJECT_REQUIRED: copy.errors.subjectRequired,
    SUBJECT_TOO_LONG: withMax(copy.errors.subjectTooLong, CONTACT_LIMITS.subject),
    MESSAGE_REQUIRED: copy.errors.messageRequired,
    MESSAGE_TOO_LONG: withMax(copy.errors.messageTooLong, CONTACT_LIMITS.message),
    RATE_LIMITED: copy.errors.rateLimited,
    MAIL_FAILED: copy.errors.mailFailed,
  };

  return (
    <SaveForm
      action={sendContactMessageAction}
      submitLabel={copy.submit}
      savingLabel={copy.submitting}
      savedMessage={copy.sent}
      errorMessages={errorMessages}
      fallbackErrorMessage={copy.errors.fallback}
      onSuccess={clear}
      className="vtk-contact-form"
    >
      <div className="vtk-contact-row">
        <div className="vtk-contact-field">
          <Label htmlFor="contact-name">{copy.nameLabel}</Label>
          <Input
            id="contact-name"
            name="name"
            required
            autoComplete="name"
            maxLength={CONTACT_LIMITS.name}
            placeholder={copy.namePlaceholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="vtk-contact-field">
          <Label htmlFor="contact-email">{copy.emailLabel}</Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={CONTACT_LIMITS.email}
            placeholder={copy.emailPlaceholder}
            aria-describedby="contact-email-help"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <p className="vtk-contact-help" id="contact-email-help">
            {copy.emailHelp}
          </p>
        </div>
      </div>

      <div className="vtk-contact-field">
        <Label htmlFor="contact-subject">{copy.subjectLabel}</Label>
        <Input
          id="contact-subject"
          name="subject"
          required
          maxLength={CONTACT_LIMITS.subject}
          placeholder={copy.subjectPlaceholder}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>

      <div className="vtk-contact-field">
        <Label htmlFor="contact-message">{copy.messageLabel}</Label>
        <Textarea
          id="contact-message"
          name="message"
          required
          rows={8}
          maxLength={CONTACT_LIMITS.message}
          placeholder={copy.messagePlaceholder}
          aria-describedby="contact-message-help"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <p className="vtk-contact-help" id="contact-message-help">
          {withMax(copy.messageHelp, CONTACT_LIMITS.message)}
        </p>
      </div>

      {/* Honeypot. Uit beeld met CSS en niet met `display: none`, want een bot
          die het formulier leest slaat een verborgen veld soms over. Wie hier
          toch iets in typt, krijgt een groene toast en er vertrekt niets. */}
      <div className="vtk-contact-honeypot" aria-hidden="true">
        <label htmlFor="contact-website">{copy.honeypotLabel}</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
    </SaveForm>
  );
}
