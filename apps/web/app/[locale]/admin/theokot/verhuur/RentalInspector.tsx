"use client";

import { useMemo, useState } from "react";
import { Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { MailPreview } from "@/components/admin/MailPreview";
import {
  deleteRentalAction,
  sendRentalReplyAction,
  updateRentalAction,
} from "@/app/actions/theokotVerhuur";
import {
  CONTRACT_STATES,
  CONTRACT_STATE_META,
  DEPOSIT_CHOICE_META,
  DEPOSIT_STATES,
  DEPOSIT_STATE_META,
  KEY_STATES,
  KEY_STATE_META,
  RENTAL_STATUSES,
  RENTAL_STATUS_META,
  RENTER_TYPES,
  RENTER_TYPE_META,
  type RentalStatus,
} from "@/lib/theokotVerhuur";
import {
  renderRentalMail,
  type RentalTemplate,
  type RentalTemplateVars,
} from "@/lib/theokotVerhuurMail";
import { rentalAdminErrors } from "@/lib/theokotVerhuurMessages";
import type { RentalView } from "./types";

/**
 * De detailweergave in de modal: alles over één aanvraag, en de twee dingen die
 * je ermee kan doen.
 *
 * Die twee staan bewust in aparte kaders met elk hun eigen kop. Bovenaan de vier
 * opvolgvelden, die **niets** versturen; daaronder het antwoord, dat **wel**
 * mailt. Dat onderscheid is de reden dat dit scherm zo is opgebouwd: een status
 * op "goedgekeurd" zetten omdat het al aan de toog afgesproken werd, mag geen
 * mail losmaken, en een mail versturen mag niet stiekem gebeuren.
 */

export function RentalInspector({
  nl,
  rental,
  templates,
  senderLabel,
  signature,
  contractAvailable,
  canManage,
}: {
  nl: boolean;
  rental: RentalView;
  templates: RentalTemplate[];
  senderLabel: string;
  signature: string;
  /** Per soort huurder en taal: staat er een huurcontract klaar? */
  contractAvailable: Record<string, boolean>;
  canManage: boolean;
}) {
  const errors = rentalAdminErrors(nl);

  // De soort huurder staat in het formulier hierboven, maar bepaalt welk contract
  // er kan meegaan; het mailpaneel leest hem daarom mee. De component krijgt een
  // `key` per aanvraag (zie RentalBoard), dus deze beginwaarde klopt altijd.
  const [renterType, setRenterType] = useState(rental.renterType);

  return (
    <div className="space-y-4">
      <RentalFacts nl={nl} rental={rental} />

      {canManage && (
        <>
          <StatusForm
            nl={nl}
            rental={rental}
            errors={errors}
            renterType={renterType}
            onRenterTypeChange={setRenterType}
          />
          <ReplyForm
            nl={nl}
            rental={rental}
            templates={templates}
            senderLabel={senderLabel}
            signature={signature}
            renterType={renterType}
            contractAvailable={contractAvailable}
            errors={errors}
          />
        </>
      )}

      <MessageHistory nl={nl} rental={rental} />

      {canManage && (
        <div className="flex justify-end">
          <DeleteButton
            action={deleteRentalAction}
            fields={{ rentalId: rental.id }}
            title={nl ? "Aanvraag verwijderen?" : "Delete request?"}
            description={
              nl
                ? `De aanvraag van ${rental.responsibleName} voor ${rental.dateLabel} verdwijnt, samen met de mails die erover verstuurd werden. De aanvrager krijgt hier geen bericht van. Gebruik dit enkel voor spam of een dubbele inzending; een verhuur die niet doorging, zet je beter op "Geannuleerd".`
                : `The request from ${rental.responsibleName} for ${rental.dateLabel} disappears, together with the emails sent about it. The requester is not notified. Use this only for spam or a duplicate; a rental that did not happen is better set to "Cancelled".`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Aanvraag verwijderd." : "Request deleted."}
          >
            {nl ? "Aanvraag verwijderen" : "Delete request"}
          </DeleteButton>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// De aanvraag zelf
// -----------------------------------------------------------------------------

function RentalFacts({ nl, rental }: { nl: boolean; rental: RentalView }) {
  const lang = nl ? "nl" : "en";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tv-badge" data-tone={RENTAL_STATUS_META[rental.status].tone}>
          {RENTAL_STATUS_META[rental.status][lang]}
        </span>
        <h2 className="text-lg font-semibold text-vtk-ink">{rental.responsibleName}</h2>
      </div>

      {rental.clashes.length > 0 && (
        <div className="tv-notice">
          <span>
            <strong>{nl ? "Botst met:" : "Clashes with:"}</strong>{" "}
            {rental.clashes.map((clash) => clash.label).join(" · ")}
          </span>
        </div>
      )}

      <dl className="tv-def">
        <dt>{nl ? "Wanneer" : "When"}</dt>
        <dd>
          {rental.dateLabel}, {rental.timeLabel}
        </dd>
        <dt>{nl ? "Contact" : "Contact"}</dt>
        <dd>
          <a className="vtk-link" href={`mailto:${rental.email}`}>
            {rental.email}
          </a>
          {rental.phone ? ` · ${rental.phone}` : ""}
        </dd>
        <dt>{nl ? "Activiteit" : "Activity"}</dt>
        <dd>{rental.purpose}</dd>
        <dt>{nl ? "Aanwezigen" : "People"}</dt>
        <dd>{rental.attendees ?? "—"}</dd>
        <dt>{nl ? "Waarborg gevraagd" : "Deposit chosen"}</dt>
        <dd>{DEPOSIT_CHOICE_META[rental.depositChoice][lang]}</dd>
        <dt>{nl ? "Taal" : "Language"}</dt>
        <dd>{rental.locale === "nl" ? "Nederlands" : "English"}</dd>
        <dt>{nl ? "Ingediend" : "Submitted"}</dt>
        <dd>{rental.createdAtLabel}</dd>
        {rental.decidedAtLabel && (
          <>
            <dt>{nl ? "Beslist" : "Decided"}</dt>
            <dd>
              {rental.decidedAtLabel}
              {rental.decidedViaMail
                ? nl
                  ? " · via de knop in de meldingsmail"
                  : " · via the button in the notification email"
                : rental.decidedByName
                  ? ` · ${rental.decidedByName}`
                  : ""}
            </dd>
          </>
        )}
        {rental.requesterNotifiedAtLabel && (
          <>
            <dt>{nl ? "Aanvrager verwittigd" : "Requester notified"}</dt>
            <dd>{rental.requesterNotifiedAtLabel}</dd>
          </>
        )}
      </dl>

      {rental.remarks?.trim() && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
            {nl ? "Opmerkingen van de aanvrager" : "Remarks from the requester"}
          </p>
          <p className="tv-quote">{rental.remarks}</p>
        </div>
      )}

      {rental.extraAnswers.map((answer) => (
        <div key={answer.id}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
            {answer.label}
          </p>
          <p className="tv-quote">{answer.value}</p>
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// De vier opvolgvelden
// -----------------------------------------------------------------------------

function StatusForm({
  nl,
  rental,
  errors,
  renterType,
  onRenterTypeChange,
}: {
  nl: boolean;
  rental: RentalView;
  errors: Record<string, string>;
  renterType: RentalView["renterType"];
  onRenterTypeChange: (value: RentalView["renterType"]) => void;
}) {
  const lang = nl ? "nl" : "en";
  return (
    <div className="tv-section">
      <div className="tv-section-head">
        <h3>{nl ? "Opvolging" : "Follow-up"}</h3>
        <span className="tv-section-note">
          {nl ? "Opslaan verstuurt geen enkele mail." : "Saving sends no email at all."}
        </span>
      </div>

      <SaveForm
        action={updateRentalAction}
        submitLabel={nl ? "Opslaan" : "Save"}
        savingLabel={nl ? "Opslaan…" : "Saving…"}
        savedMessage={
          nl
            ? "Opgeslagen. Er is geen mail verstuurd."
            : "Saved. No email was sent."
        }
        errorMessages={errors}
        fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
        resetOnSuccess={false}
        className="space-y-3"
      >
        <input type="hidden" name="rentalId" value={rental.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`st-${rental.id}`}>{nl ? "Status" : "Status"}</Label>
            <Select id={`st-${rental.id}`} name="status" defaultValue={rental.status}>
              {RENTAL_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {RENTAL_STATUS_META[value][lang]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`dep-${rental.id}`}>{nl ? "Waarborg" : "Deposit"}</Label>
            <Select id={`dep-${rental.id}`} name="deposit" defaultValue={rental.deposit}>
              {DEPOSIT_STATES.map((value) => (
                <option key={value} value={value}>
                  {DEPOSIT_STATE_META[value][lang]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`con-${rental.id}`}>{nl ? "Contract" : "Contract"}</Label>
            <Select id={`con-${rental.id}`} name="contract" defaultValue={rental.contract}>
              {CONTRACT_STATES.map((value) => (
                <option key={value} value={value}>
                  {CONTRACT_STATE_META[value][lang]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`key-${rental.id}`}>{nl ? "Sleutel" : "Key"}</Label>
            <Select id={`key-${rental.id}`} name="keyStatus" defaultValue={rental.keyStatus}>
              {KEY_STATES.map((value) => (
                <option key={value} value={value}>
                  {KEY_STATE_META[value][lang]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor={`rt-${rental.id}`}>{nl ? "Soort huurder" : "Kind of renter"}</Label>
          <Select
            id={`rt-${rental.id}`}
            name="renterType"
            value={renterType}
            onChange={(event) => onRenterTypeChange(event.target.value as RentalView["renterType"])}
          >
            {RENTER_TYPES.map((value) => (
              <option key={value} value={value}>
                {RENTER_TYPE_META[value][lang]}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Bepaalt welk huurcontract er als bijlage meegaat. De gok komt uit de vierkante haakjes vooraan de activiteit."
              : "Decides which rental contract is attached. The guess comes from the square brackets in front of the activity."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor={`date-${rental.id}`}>{nl ? "Dag" : "Day"}</Label>
            <Input id={`date-${rental.id}`} name="date" type="date" defaultValue={rental.dateInput} />
          </div>
          <div>
            <Label htmlFor={`start-${rental.id}`}>{nl ? "Van" : "From"}</Label>
            <Input
              id={`start-${rental.id}`}
              name="startTime"
              type="time"
              defaultValue={rental.startInput}
            />
          </div>
          <div>
            <Label htmlFor={`end-${rental.id}`}>{nl ? "Tot" : "Until"}</Label>
            <Input id={`end-${rental.id}`} name="endTime" type="time" defaultValue={rental.endInput} />
          </div>
        </div>

        <div>
          <Label htmlFor={`dn-${rental.id}`}>
            {nl ? "Reden of toelichting (gaat mee in de mail)" : "Reason or note (goes into the email)"}
          </Label>
          <Textarea
            id={`dn-${rental.id}`}
            name="decisionNote"
            rows={3}
            defaultValue={rental.decisionNote ?? ""}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Dit is de {motivatie} in de sjablonen hieronder. Opslaan verstuurt nog niets."
              : "This is the {motivatie} in the templates below. Saving still sends nothing."}
          </p>
        </div>

        <div>
          <Label htmlFor={`in-${rental.id}`}>{nl ? "Interne notitie" : "Internal note"}</Label>
          <Textarea
            id={`in-${rental.id}`}
            name="internalNote"
            rows={2}
            defaultValue={rental.internalNote ?? ""}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl ? "Enkel zichtbaar in het beheer." : "Only visible in the admin."}
          </p>
        </div>
      </SaveForm>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Het antwoord naar de aanvrager
// -----------------------------------------------------------------------------

/** Welke status er standaard bij een sjabloon hoort. */
function statusForCategory(category: RentalTemplate["category"]): RentalStatus | "" {
  if (category === "approved") return "APPROVED";
  if (category === "rejected") return "REJECTED";
  return "";
}

function ReplyForm({
  nl,
  rental,
  templates,
  senderLabel,
  signature,
  renterType,
  contractAvailable,
  errors,
}: {
  nl: boolean;
  rental: RentalView;
  templates: RentalTemplate[];
  senderLabel: string;
  signature: string;
  renterType: RentalView["renterType"];
  contractAvailable: Record<string, boolean>;
  errors: Record<string, string>;
}) {
  const lang = nl ? "nl" : "en";
  const vars: RentalTemplateVars = useMemo(
    () => ({ ...rental.mailVars, ondertekening: signature }),
    [rental.mailVars, signature],
  );

  // Het sjabloon dat past bij de taal van de aanvrager staat vooraan; die koos
  // die taal zelf in het formulier.
  const sorted = useMemo(
    () => [...templates].sort((a, b) => Number(b.lang === rental.locale) - Number(a.lang === rental.locale)),
    [templates, rental.locale],
  );

  const [templateId, setTemplateId] = useState(sorted[0]?.id ?? "");
  const template = sorted.find((item) => item.id === templateId) ?? sorted[0];

  const first = template ? renderRentalMail(template, vars) : { subject: "", body: "" };
  const [subject, setSubject] = useState(first.subject);
  const [body, setBody] = useState(first.body);
  const [status, setStatus] = useState<RentalStatus | "">(
    template ? statusForCategory(template.category) : "",
  );
  const [attach, setAttach] = useState(template?.attachContract ?? false);

  // Een ander sjabloon vult het opsteldeel opnieuw. Bewust niet samenvoegen met
  // wat je zelf al typte: half overschrijven is erger dan opnieuw beginnen.
  //
  // Dit gebeurt tijdens het renderen en niet in een effect: React tekent dan
  // meteen met de nieuwe waarden, in plaats van eerst het oude sjabloon te tonen
  // en er daarna overheen te schrijven.
  const [appliedId, setAppliedId] = useState(template?.id ?? "");
  if (template && template.id !== appliedId) {
    const rendered = renderRentalMail(template, vars);
    setAppliedId(template.id);
    setSubject(rendered.subject);
    setBody(rendered.body);
    setStatus(statusForCategory(template.category));
    setAttach(template.attachContract);
  }

  const contractKey = `${renterType}:${rental.locale}`;
  const contractReady = contractAvailable[contractKey] ?? contractAvailable[`${renterType}:nl`] ?? false;

  const statusLabel = status ? RENTAL_STATUS_META[status][lang] : null;

  return (
    <div className="tv-section">
      <div className="tv-section-head">
        <h3>{nl ? "Antwoorden" : "Reply"}</h3>
        <span className="tv-section-note">
          {nl ? "Dit verstuurt wél een mail." : "This does send an email."}
        </span>
      </div>

      <SaveForm
        action={sendRentalReplyAction}
        submitLabel={nl ? "Versturen" : "Send"}
        savingLabel={nl ? "Versturen…" : "Sending…"}
        savedMessage={nl ? "Mail verstuurd." : "Email sent."}
        errorMessages={errors}
        fallbackErrorMessage={nl ? "Niet verstuurd." : "Not sent."}
        resetOnSuccess={false}
        className="space-y-3"
      >
        <input type="hidden" name="rentalId" value={rental.id} />
        <input type="hidden" name="templateId" value={template?.id ?? ""} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`tpl-${rental.id}`}>{nl ? "Sjabloon" : "Template"}</Label>
            <Select
              id={`tpl-${rental.id}`}
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {sorted.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`sst-${rental.id}`}>
              {nl ? "Status hierbij zetten op" : "Set the status to"}
            </Label>
            <Select
              id={`sst-${rental.id}`}
              name="setStatus"
              value={status}
              onChange={(event) => setStatus(event.target.value as RentalStatus | "")}
            >
              <option value="">{nl ? "Status niet wijzigen" : "Leave the status alone"}</option>
              {RENTAL_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {RENTAL_STATUS_META[value][lang]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor={`sub-${rental.id}`}>{nl ? "Onderwerp" : "Subject"}</Label>
          <Input
            id={`sub-${rental.id}`}
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor={`body-${rental.id}`}>{nl ? "Bericht" : "Message"}</Label>
          <Textarea
            id={`body-${rental.id}`}
            name="body"
            rows={12}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="font-mono text-[13px] leading-relaxed"
            required
          />
        </div>

        <label className="tv-check">
          <input
            type="checkbox"
            name="attachContract"
            checked={attach && contractReady}
            disabled={!contractReady}
            onChange={(event) => setAttach(event.target.checked)}
          />
          <span>
            {nl ? "Het huurcontract meesturen" : "Attach the rental contract"}
            {!contractReady && (
              <>
                {" — "}
                <em>
                  {nl
                    ? "er staat nog geen contract klaar voor dit soort huurder; upload het bij Instellingen"
                    : "no contract is uploaded for this kind of renter; upload it under Settings"}
                </em>
              </>
            )}
          </span>
        </label>

        <MailPreview
          nl={nl}
          from={senderLabel}
          to={rental.email}
          subject={subject}
          body={body}
          attachments={attach && contractReady ? [nl ? "huurcontract.pdf" : "rental-contract.pdf"] : []}
          source={nl ? "met de gegevens van deze aanvraag" : "with the details of this request"}
        />

        <p className="tv-sends-mail">
          <strong>
            {nl
              ? `Versturen stuurt deze mail naar ${rental.email}.`
              : `Sending delivers this email to ${rental.email}.`}
          </strong>{" "}
          {statusLabel
            ? nl
              ? `De status komt daarbij op "${statusLabel}".`
              : `The status becomes "${statusLabel}".`
            : nl
              ? "De status blijft staan zoals hij is."
              : "The status stays as it is."}{" "}
          {nl
            ? "Wil je enkel de status wijzigen zonder te mailen, gebruik dan het kader hierboven."
            : "To change only the status without emailing, use the panel above."}
        </p>
      </SaveForm>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Wat er al verstuurd werd
// -----------------------------------------------------------------------------

const KIND_LABELS: Record<string, { nl: string; en: string }> = {
  confirmation: { nl: "Ontvangstbevestiging", en: "Confirmation of receipt" },
  notify: { nl: "Melding aan Theokot", en: "Notification to Theokot" },
  reply: { nl: "Antwoord", en: "Reply" },
};

function MessageHistory({ nl, rental }: { nl: boolean; rental: RentalView }) {
  if (rental.messages.length === 0) return null;
  const lang = nl ? "nl" : "en";

  return (
    <div className="tv-section">
      <div className="tv-section-head">
        <h3>{nl ? "Verstuurde mails" : "Emails sent"}</h3>
      </div>
      <div className="space-y-2">
        {rental.messages.map((message) => (
          <details key={message.id} className="rounded-xl border border-vtk-blue/12 bg-white p-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-vtk-ink">
              {message.subject}
              <span className="ml-2 text-xs font-normal text-[#5c667f]">
                {KIND_LABELS[message.kind]?.[lang] ?? message.kind} · {message.sentAtLabel}
                {message.sentViaMail
                  ? nl
                    ? " · via de meldingsmail"
                    : " · via the notification email"
                  : message.sentByName
                    ? ` · ${message.sentByName}`
                    : ""}
              </span>
            </summary>
            <p className="tv-quote mt-2">{message.body}</p>
            {message.attachmentName && (
              <p className="mt-2 text-xs text-[#5c667f]">
                {nl ? "Bijlage: " : "Attachment: "}
                {message.attachmentName}
              </p>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
