"use client";

import { useCallback, useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { requestRentalAction } from "@/app/actions/theokotVerhuur";
import {
  RENTAL_LIMITS,
  questionHelp,
  questionLabel,
  type ExtraQuestion,
  type RentalQuestions,
} from "@/lib/theokotVerhuur";
import { rentalRequestErrors } from "@/lib/theokotVerhuurMessages";

/**
 * Het publieke aanvraagformulier, de opvolger van de Google Form.
 *
 * De vragen komen uit de instellingen en niet uit deze component: Theokot moet
 * ze kunnen herschrijven zonder deploy. Wat hier vastligt, is welk soort veld
 * elke kernvraag krijgt, want daar hangt de rest aan: de dag is een echte datum
 * en de uren zijn echte uren, zodat een aanvraag meteen op de juiste plaats in
 * de kalender belandt in plaats van als tekst in een cel.
 *
 * De Engelse helft van het oude formulier ("############## English version") is
 * hier geen tweede alinea meer maar gewoon de vertaling van hetzelfde veld: de
 * site kent de taal van de bezoeker al.
 */

export type RentalCopy = {
  formIntro?: string;
  sectionContact: string;
  sectionWhen: string;
  sectionEvent: string;
  sectionExtra: string;
  honeypotLabel: string;
  submit: string;
  submitting: string;
  sent: string;
  newRequest: string;
  depositTransfer: string;
  depositCash: string;
  depositNvt: string;
  languageNl: string;
  languageEn: string;
  errorFallback: string;
};

/** Vandaag als "YYYY-MM-DD", plus de eventuele wachttijd uit de instellingen. */
function earliestDate(minLeadDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(0, minLeadDays));
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function RentalRequestForm({
  nl,
  questions,
  minLeadDays,
  copy,
}: {
  nl: boolean;
  questions: RentalQuestions;
  minLeadDays: number;
  copy: RentalCopy;
}) {
  const [sent, setSent] = useState(false);
  const core = questions.core;

  const onSuccess = useCallback(() => setSent(true), []);

  const label = (key: keyof typeof core) => questionLabel(core[key], nl);
  const help = (key: keyof typeof core) => questionHelp(core[key], nl);
  const star = (key: keyof typeof core) => (core[key].required ? " *" : "");

  if (sent) {
    return (
      <div className="space-y-4 pt-2">
        <p className="tv-notice" data-tone="ok" role="status">
          <span>{copy.sent}</span>
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setSent(false)}
        >
          {copy.newRequest}
        </Button>
      </div>
    );
  }

  return (
    <>
      {copy.formIntro && <p className="tv-lead">{copy.formIntro}</p>}
      <SaveForm
        action={requestRentalAction}
        submitLabel={copy.submit}
        savingLabel={copy.submitting}
        savedMessage={copy.sent}
        errorMessages={rentalRequestErrors(nl)}
        fallbackErrorMessage={copy.errorFallback}
        resetOnSuccess={true}
        onSuccess={onSuccess}
        className="tv-form"
      >
        <fieldset className="tv-fieldset">
          <legend>{copy.sectionContact}</legend>

          <div className="tv-field">
            <Label htmlFor="tv-name">
              {label("responsible")}
              {star("responsible")}
            </Label>
            <Input
              id="tv-name"
              name="responsibleName"
              maxLength={RENTAL_LIMITS.name}
              autoComplete="name"
              required
            />
            {help("responsible") && <p className="tv-help">{help("responsible")}</p>}
          </div>

          <div className="tv-row">
            <div className="tv-field">
              <Label htmlFor="tv-email">
                {label("email")}
                {star("email")}
              </Label>
              <Input
                id="tv-email"
                name="email"
                type="email"
                maxLength={RENTAL_LIMITS.email}
                autoComplete="email"
                required
              />
              {help("email") && <p className="tv-help">{help("email")}</p>}
            </div>

            <div className="tv-field">
              <Label htmlFor="tv-phone">
                {label("phone")}
                {star("phone")}
              </Label>
              <Input
                id="tv-phone"
                name="phone"
                type="tel"
                maxLength={RENTAL_LIMITS.phone}
                autoComplete="tel"
                required={core.phone.required}
              />
              {help("phone") && <p className="tv-help">{help("phone")}</p>}
            </div>
          </div>

          <div className="tv-field">
            <Label htmlFor="tv-locale">
              {label("language")}
              {star("language")}
            </Label>
            {/* De taalkeuze staat er ondanks dat de site de taal al kent: wie het
                formulier in het Nederlands invult, kan evengoed liever een Engels
                antwoord krijgen, en die keuze stuurt het mailsjabloon. */}
            <Select id="tv-locale" name="locale" defaultValue={nl ? "nl" : "en"}>
              <option value="nl">{copy.languageNl}</option>
              <option value="en">{copy.languageEn}</option>
            </Select>
            {help("language") && <p className="tv-help">{help("language")}</p>}
          </div>
        </fieldset>

        <fieldset className="tv-fieldset">
          <legend>{copy.sectionWhen}</legend>

          <div className="tv-field">
            <Label htmlFor="tv-date">
              {label("day")}
              {star("day")}
            </Label>
            <Input id="tv-date" name="date" type="date" min={earliestDate(minLeadDays)} required />
            {help("day") && <p className="tv-help">{help("day")}</p>}
          </div>

          <div className="tv-row">
            <div className="tv-field">
              <Label htmlFor="tv-start">
                {label("startTime")}
                {star("startTime")}
              </Label>
              <Input id="tv-start" name="startTime" type="time" required />
              {help("startTime") && <p className="tv-help">{help("startTime")}</p>}
            </div>

            <div className="tv-field">
              <Label htmlFor="tv-end">
                {label("endTime")}
                {star("endTime")}
              </Label>
              <Input id="tv-end" name="endTime" type="time" required />
              {help("endTime") && <p className="tv-help">{help("endTime")}</p>}
            </div>
          </div>
        </fieldset>

        <fieldset className="tv-fieldset">
          <legend>{copy.sectionEvent}</legend>

          <div className="tv-field">
            <Label htmlFor="tv-purpose">
              {label("purpose")}
              {star("purpose")}
            </Label>
            <Input
              id="tv-purpose"
              name="purpose"
              maxLength={RENTAL_LIMITS.purpose}
              required={core.purpose.required}
            />
            {help("purpose") && <p className="tv-help">{help("purpose")}</p>}
          </div>

          <div className="tv-field">
            <Label htmlFor="tv-attendees">
              {label("attendees")}
              {star("attendees")}
            </Label>
            <Input
              id="tv-attendees"
              name="attendees"
              type="number"
              min={1}
              max={RENTAL_LIMITS.attendees}
              step={1}
              className="max-w-32"
              required={core.attendees.required}
            />
            {help("attendees") && <p className="tv-help">{help("attendees")}</p>}
          </div>

          <div className="tv-field">
            <span className="block text-sm font-medium text-vtk-ink">
              {label("deposit")}
              {star("deposit")}
            </span>
            {help("deposit") && <p className="tv-help">{help("deposit")}</p>}
            <div className="tv-choices">
              {(
                [
                  ["TRANSFER", copy.depositTransfer],
                  ["CASH", copy.depositCash],
                  ["NVT", copy.depositNvt],
                ] as const
              ).map(([value, text]) => (
                <label key={value} className="tv-check">
                  <input
                    type="radio"
                    name="deposit"
                    value={value}
                    required={core.deposit.required}
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="tv-fieldset">
          <legend>{copy.sectionExtra}</legend>

          <div className="tv-field">
            <Label htmlFor="tv-remarks">
              {label("remarks")}
              {star("remarks")}
            </Label>
            <Textarea
              id="tv-remarks"
              name="remarks"
              rows={8}
              maxLength={RENTAL_LIMITS.remarks}
              required={core.remarks.required}
            />
            {help("remarks") && <p className="tv-help">{help("remarks")}</p>}
          </div>

          {questions.extra.map((question) => (
            <ExtraField key={question.id} nl={nl} question={question} />
          ))}
        </fieldset>

        <div className="tv-honeypot" aria-hidden="true">
          <label htmlFor="tv-website">{copy.honeypotLabel}</label>
          <input id="tv-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      </SaveForm>
    </>
  );
}

/** Een vraag die Theokot zelf toevoegde. Het antwoord landt in `extraAnswers`. */
function ExtraField({ nl, question }: { nl: boolean; question: ExtraQuestion }) {
  const id = `tv-extra-${question.id}`;
  const name = `extra:${question.id}`;
  const label = questionLabel(question, nl);
  const help = questionHelp(question, nl);
  const star = question.required ? " *" : "";

  if (question.type === "checkbox") {
    return (
      <div className="tv-field">
        <label className="tv-check">
          <input id={id} name={name} type="checkbox" value={nl ? "Ja" : "Yes"} required={question.required} />
          <span>
            {label}
            {star}
          </span>
        </label>
        {help && <p className="tv-help">{help}</p>}
      </div>
    );
  }

  return (
    <div className="tv-field">
      <Label htmlFor={id}>
        {label}
        {star}
      </Label>
      {question.type === "textarea" ? (
        <Textarea id={id} name={name} rows={5} maxLength={RENTAL_LIMITS.extraAnswer} required={question.required} />
      ) : question.type === "choice" ? (
        <Select id={id} name={name} defaultValue="" required={question.required}>
          <option value="">—</option>
          {question.options.map((option) => (
            <option key={option.value} value={option.value}>
              {nl ? option.labelNl : option.labelEn || option.labelNl}
            </option>
          ))}
        </Select>
      ) : (
        <Input id={id} name={name} maxLength={RENTAL_LIMITS.extraAnswer} required={question.required} />
      )}
      {help && <p className="tv-help">{help}</p>}
    </div>
  );
}
