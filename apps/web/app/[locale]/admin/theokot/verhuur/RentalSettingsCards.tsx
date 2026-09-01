"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { FileField } from "@/components/ui/FileField";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import {
  deleteRentalContractAction,
  saveRentalConfigAction,
  saveRentalGuideAction,
  saveRentalQuestionsAction,
  uploadRentalContractAction,
} from "@/app/actions/theokotVerhuur";
import {
  CORE_QUESTIONS,
  EXTRA_QUESTION_TYPES,
  REQUIRED_CORE_QUESTIONS,
  RENTER_TYPE_META,
  type CoreQuestionKey,
  type ExtraQuestion,
  type ExtraQuestionType,
  type RentalQuestions,
} from "@/lib/theokotVerhuur";
import { RENTAL_LEAD_MAX, type RentalConfig, type RentalGuide } from "@/lib/theokotVerhuurMail";
import { rentalAdminErrors } from "@/lib/theokotVerhuurMessages";
import type { ContractDocView } from "./types";

/**
 * De instellingen van de verhuur: wie de meldingen krijgt, wat er in het
 * formulier gevraagd wordt, welke richtlijnen ernaast staan, en de twee
 * huurcontracten.
 *
 * Elke kaart bewaart apart. Eén groot formulier zou betekenen dat een tikfout in
 * de vragenlijst ook je ondertekening tegenhoudt.
 */

// -----------------------------------------------------------------------------
// Wie krijgt de meldingen, en staat het formulier open
// -----------------------------------------------------------------------------

export function RentalConfigCard({ nl, config }: { nl: boolean; config: RentalConfig }) {
  const errors = rentalAdminErrors(nl);
  const [open, setOpen] = useState(config.formOpen);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">{nl ? "Instellingen" : "Settings"}</h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Wie een nieuwe aanvraag te zien krijgt, en hoe de mails ondertekend worden."
          : "Who sees a new request, and how the emails are signed."}
      </p>

      <SaveForm
        action={saveRentalConfigAction}
        submitLabel={nl ? "Opslaan" : "Save"}
        savingLabel={nl ? "Opslaan…" : "Saving…"}
        savedMessage={nl ? "Instellingen opgeslagen." : "Settings saved."}
        errorMessages={errors}
        fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
        resetOnSuccess={false}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="tv-notify">
            {nl ? "Wie de aanvragen behandelt" : "Who handles the requests"}
          </Label>
          <Textarea
            id="tv-notify"
            name="notifyEmails"
            rows={2}
            defaultValue={config.notifyEmails.join("\n")}
            required
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Eén adres per regel (komma's mogen ook). Zij krijgen bij elke nieuwe aanvraag een mail met de knoppen om goed te keuren of te weigeren."
              : "One address per line (commas are fine too). They get an email on every new request, with the buttons to approve or deny."}
          </p>
        </div>

        <div>
          <Label htmlFor="tv-replyto">{nl ? "Antwoordadres" : "Reply-to address"}</Label>
          <Input id="tv-replyto" name="replyTo" type="email" defaultValue={config.replyTo} />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Hier komt het antwoord van een huurder toe. Staat ook op de publieke pagina onder “Een vraag?”."
              : "This is where a renter's reply arrives. It is also shown on the public page under “A question?”."}
          </p>
        </div>

        <div>
          <Label htmlFor="tv-signature">{nl ? "Ondertekening" : "Signature"}</Label>
          <Textarea id="tv-signature" name="signature" rows={3} defaultValue={config.signature} />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Komt onder elke mail, in de plaats van {ondertekening}."
              : "Goes under every email, in place of {ondertekening}."}
          </p>
        </div>

        <div>
          <Label htmlFor="tv-lead">
            {nl ? "Minstens zoveel dagen op voorhand aanvragen" : "Request at least this many days ahead"}
          </Label>
          <Input
            id="tv-lead"
            name="minLeadDays"
            type="number"
            min={0}
            max={RENTAL_LEAD_MAX}
            step={1}
            defaultValue={config.minLeadDays}
            className="max-w-28"
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Nul laat alles toe, ook een aanvraag voor morgen. De datumkiezer op de publieke pagina volgt dit getal."
              : "Zero allows everything, including a request for tomorrow. The date picker on the public page follows this number."}
          </p>
        </div>

        <label className="tv-check">
          <input
            type="checkbox"
            name="formOpen"
            checked={open}
            onChange={(event) => setOpen(event.target.checked)}
          />
          <span>
            {nl ? "Het aanvraagformulier staat open" : "The request form is open"}
            <br />
            <span className="text-xs text-[#5c667f]">
              {nl
                ? "Zet dit uit tijdens de examens of de vakantie. De pagina blijft bestaan en toont dan de tekst hieronder."
                : "Turn this off during exams or holidays. The page stays up and shows the text below instead."}
            </span>
          </span>
        </label>

        {!open && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tv-closed-nl">{nl ? "Tekst bij gesloten (NL)" : "Closed text (NL)"}</Label>
              <Textarea
                id="tv-closed-nl"
                name="closedNoticeNl"
                rows={3}
                defaultValue={config.closedNoticeNl}
              />
            </div>
            <div>
              <Label htmlFor="tv-closed-en">{nl ? "Tekst bij gesloten (EN)" : "Closed text (EN)"}</Label>
              <Textarea
                id="tv-closed-en"
                name="closedNoticeEn"
                rows={3}
                defaultValue={config.closedNoticeEn}
              />
            </div>
          </div>
        )}
        {open && (
          <>
            {/* De teksten blijven bewaard terwijl het formulier openstaat; anders
                is de melding weg zodra je ze een keer aan- en uitzet. */}
            <input type="hidden" name="closedNoticeNl" value={config.closedNoticeNl} />
            <input type="hidden" name="closedNoticeEn" value={config.closedNoticeEn} />
          </>
        )}
      </SaveForm>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// De vragenlijst van het publieke formulier
// -----------------------------------------------------------------------------

const CORE_TITLES: Record<CoreQuestionKey, { nl: string; en: string }> = {
  language: { nl: "Taalkeuze", en: "Language choice" },
  responsible: { nl: "Verantwoordelijke", en: "Person in charge" },
  phone: { nl: "Telefoonnummer", en: "Phone number" },
  email: { nl: "E-mailadres", en: "Email address" },
  day: { nl: "Dag", en: "Day" },
  startTime: { nl: "Startuur", en: "Starting hour" },
  endTime: { nl: "Einduur", en: "Ending hour" },
  purpose: { nl: "Aard van de activiteit", en: "Type of activity" },
  attendees: { nl: "Aantal aanwezigen", en: "Number of people" },
  deposit: { nl: "Waarborg", en: "Deposit" },
  remarks: { nl: "Opmerkingen", en: "Remarks" },
};

const TYPE_LABELS: Record<ExtraQuestionType, { nl: string; en: string }> = {
  text: { nl: "Korte tekst", en: "Short text" },
  textarea: { nl: "Lange tekst", en: "Long text" },
  choice: { nl: "Keuzelijst", en: "Dropdown" },
  checkbox: { nl: "Vinkje", en: "Checkbox" },
};

export function RentalQuestionsCard({
  nl,
  questions,
}: {
  nl: boolean;
  questions: RentalQuestions;
}) {
  const errors = rentalAdminErrors(nl);
  const lang = nl ? "nl" : "en";
  const [extra, setExtra] = useState<ExtraQuestion[]>(questions.extra);

  const addExtra = () => {
    setExtra((prev) => [
      ...prev,
      {
        id: `q${Date.now().toString(36)}`,
        type: "text",
        labelNl: nl ? "Nieuwe vraag" : "New question",
        labelEn: "",
        helpNl: "",
        helpEn: "",
        required: false,
        options: [],
      },
    ]);
  };

  const update = (id: string, patch: Partial<ExtraQuestion>) => {
    setExtra((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">
        {nl ? "Vragen op het aanvraagformulier" : "Questions on the request form"}
      </h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "De vraagteksten van de publieke pagina. De elf vragen hierboven zijn de kern van een aanvraag: je kan ze herschrijven, maar niet weghalen. Op de dag en de uren hangt de kalender, en zonder e-mailadres gaat er geen antwoord ergens naartoe."
          : "The question texts of the public page. The eleven questions below are the core of a request: you can rewrite them, but not remove them. The calendar hangs on the day and the hours, and without an email address no answer goes anywhere."}
      </p>

      <SaveForm
        action={saveRentalQuestionsAction}
        submitLabel={nl ? "Vragen opslaan" : "Save questions"}
        savingLabel={nl ? "Opslaan…" : "Saving…"}
        savedMessage={nl ? "Vragen opgeslagen." : "Questions saved."}
        errorMessages={errors}
        fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
        resetOnSuccess={false}
        className="space-y-3"
      >
        {CORE_QUESTIONS.map((key) => {
          const question = questions.core[key];
          const locked = REQUIRED_CORE_QUESTIONS.includes(key);
          return (
            <details key={key} className="rounded-2xl border border-vtk-blue/15 bg-white p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-vtk-ink">
                {CORE_TITLES[key][lang]}
                <span className="ml-2 text-xs font-normal text-[#5c667f]">
                  {question.labelNl}
                  {locked ? (nl ? " · altijd verplicht" : " · always required") : ""}
                </span>
              </summary>

              <div className="mt-3 space-y-3 border-t border-vtk-blue/10 pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`cl-${key}`}>{nl ? "Label (NL)" : "Label (NL)"}</Label>
                    <Input
                      id={`cl-${key}`}
                      name={`core:${key}:labelNl`}
                      defaultValue={question.labelNl}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`cle-${key}`}>{nl ? "Label (EN)" : "Label (EN)"}</Label>
                    <Input
                      id={`cle-${key}`}
                      name={`core:${key}:labelEn`}
                      defaultValue={question.labelEn}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`ch-${key}`}>{nl ? "Uitleg (NL)" : "Help text (NL)"}</Label>
                    <Textarea
                      id={`ch-${key}`}
                      name={`core:${key}:helpNl`}
                      rows={4}
                      defaultValue={question.helpNl}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`che-${key}`}>{nl ? "Uitleg (EN)" : "Help text (EN)"}</Label>
                    <Textarea
                      id={`che-${key}`}
                      name={`core:${key}:helpEn`}
                      rows={4}
                      defaultValue={question.helpEn}
                    />
                  </div>
                </div>
                {!locked && (
                  <label className="tv-check">
                    <input
                      type="checkbox"
                      name={`core:${key}:required`}
                      defaultChecked={question.required}
                    />
                    <span>{nl ? "Verplicht in te vullen" : "Required"}</span>
                  </label>
                )}
              </div>
            </details>
          );
        })}

        <div className="flex items-center justify-between pt-2">
          <h3 className="text-sm font-semibold text-vtk-ink">
            {nl ? "Eigen vragen" : "Your own questions"}
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={addExtra}>
            + {nl ? "Vraag toevoegen" : "Add a question"}
          </Button>
        </div>

        {extra.length === 0 && (
          <p className="text-sm text-[#5c667f]">
            {nl
              ? "Nog geen eigen vragen. Voeg er een toe wanneer je iets wil weten dat hierboven niet gevraagd wordt."
              : "No questions of your own yet. Add one when you need something the questions above do not ask."}
          </p>
        )}

        {extra.map((question) => (
          <div key={question.id} className="space-y-3 rounded-2xl border border-vtk-blue/15 bg-white p-4">
            <input type="hidden" name="extraId" value={question.id} />
            <div className="flex items-start justify-between gap-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`el-${question.id}`}>{nl ? "Label (NL)" : "Label (NL)"}</Label>
                  <Input
                    id={`el-${question.id}`}
                    name={`extra:${question.id}:labelNl`}
                    value={question.labelNl}
                    onChange={(event) => update(question.id, { labelNl: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor={`ele-${question.id}`}>{nl ? "Label (EN)" : "Label (EN)"}</Label>
                  <Input
                    id={`ele-${question.id}`}
                    name={`extra:${question.id}:labelEn`}
                    value={question.labelEn}
                    onChange={(event) => update(question.id, { labelEn: event.target.value })}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExtra((prev) => prev.filter((item) => item.id !== question.id))}
                className="mt-6 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                title={nl ? "Vraag weghalen" : "Remove question"}
              >
                <span className="sr-only">
                  {nl ? `Vraag weghalen: ${question.labelNl}` : `Remove question: ${question.labelNl}`}
                </span>
                <svg
                  aria-hidden="true"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`eh-${question.id}`}>{nl ? "Uitleg (NL)" : "Help text (NL)"}</Label>
                <Textarea
                  id={`eh-${question.id}`}
                  name={`extra:${question.id}:helpNl`}
                  rows={2}
                  value={question.helpNl}
                  onChange={(event) => update(question.id, { helpNl: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`ehe-${question.id}`}>{nl ? "Uitleg (EN)" : "Help text (EN)"}</Label>
                <Textarea
                  id={`ehe-${question.id}`}
                  name={`extra:${question.id}:helpEn`}
                  rows={2}
                  value={question.helpEn}
                  onChange={(event) => update(question.id, { helpEn: event.target.value })}
                />
              </div>
            </div>

            <div className="grid items-end gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`et-${question.id}`}>{nl ? "Soort veld" : "Field type"}</Label>
                <Select
                  id={`et-${question.id}`}
                  name={`extra:${question.id}:type`}
                  value={question.type}
                  onChange={(event) =>
                    update(question.id, { type: event.target.value as ExtraQuestionType })
                  }
                >
                  {EXTRA_QUESTION_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {TYPE_LABELS[value][lang]}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="tv-check">
                <input
                  type="checkbox"
                  name={`extra:${question.id}:required`}
                  checked={question.required}
                  onChange={(event) => update(question.id, { required: event.target.checked })}
                />
                <span>{nl ? "Verplicht in te vullen" : "Required"}</span>
              </label>
            </div>

            {question.type === "choice" && (
              <div>
                <Label htmlFor={`eo-${question.id}`}>{nl ? "Keuzes" : "Options"}</Label>
                <Textarea
                  id={`eo-${question.id}`}
                  name={`extra:${question.id}:options`}
                  rows={4}
                  defaultValue={question.options
                    .map((option) =>
                      option.labelEn && option.labelEn !== option.labelNl
                        ? `${option.labelNl} | ${option.labelEn}`
                        : option.labelNl,
                    )
                    .join("\n")}
                />
                <p className="mt-1 text-xs text-[#5c667f]">
                  {nl
                    ? "Eén keuze per regel. Wil je een Engelse vertaling, zet ze achter een verticale streep: “Ja | Yes”."
                    : "One option per line. For an English translation, put it after a vertical bar: “Ja | Yes”."}
                </p>
              </div>
            )}
          </div>
        ))}
      </SaveForm>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// De huurcontracten
// -----------------------------------------------------------------------------

const SLOTS = [
  { audience: "INTERNAL" as const, locale: "nl" },
  { audience: "INTERNAL" as const, locale: "en" },
  { audience: "EXTERNAL" as const, locale: "nl" },
  { audience: "EXTERNAL" as const, locale: "en" },
];

export function RentalContractsCard({
  nl,
  contracts,
}: {
  nl: boolean;
  contracts: ContractDocView[];
}) {
  const errors = rentalAdminErrors(nl);
  const lang = nl ? "nl" : "en";

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">{nl ? "Huurcontracten" : "Rental contracts"}</h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Het contract dat als bijlage meegaat bij een goedkeuring. Een post of werkgroep van VTK tekent een ander contract dan een externe huurder, dus het zijn er twee; een Engelse versie mag, en ontbreekt ze, dan gaat de Nederlandse mee."
          : "The contract attached to an approval. A post or work group of VTK signs a different contract than an external renter, so there are two; an English version is optional, and when it is missing the Dutch one is attached."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {SLOTS.map((slot) => {
          const doc = contracts.find(
            (item) => item.audience === slot.audience && item.locale === slot.locale,
          );
          const title = `${RENTER_TYPE_META[slot.audience][lang]} · ${slot.locale.toUpperCase()}`;
          return (
            <div
              key={`${slot.audience}-${slot.locale}`}
              className="space-y-3 rounded-2xl border border-vtk-blue/15 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-vtk-ink">{title}</h3>
                {doc && (
                  <DeleteIconButton
                    action={deleteRentalContractAction}
                    fields={{ contractId: doc.id }}
                    label={nl ? "Contract verwijderen" : "Delete contract"}
                    srLabel={nl ? `Verwijderen: ${title}` : `Delete: ${title}`}
                    title={nl ? "Huurcontract verwijderen?" : "Delete rental contract?"}
                    description={
                      nl
                        ? `${doc.fileName} verdwijnt uit de opslag. Mails die het al als bijlage kregen, blijven ongewijzigd; nieuwe goedkeuringen voor ${title} vertrekken tot je een nieuw contract uploadt zonder bijlage.`
                        : `${doc.fileName} disappears from storage. Emails that already carried it stay unchanged; new approvals for ${title} go out without an attachment until you upload a new contract.`
                    }
                    confirmLabel={nl ? "Verwijderen" : "Delete"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Huurcontract verwijderd." : "Rental contract deleted."}
                  />
                )}
              </div>

              {doc ? (
                <p className="text-sm text-[#34405e]">
                  <a className="vtk-link" href={doc.href} target="_blank" rel="noreferrer">
                    {doc.fileName}
                  </a>
                  <br />
                  <span className="text-xs text-[#5c667f]">
                    {nl ? "Geüpload op " : "Uploaded on "}
                    {doc.uploadedAtLabel}
                    {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-[#5c667f]">
                  {nl
                    ? "Nog geen contract geüpload."
                    : "No contract uploaded yet."}
                </p>
              )}

              <SaveForm
                action={uploadRentalContractAction}
                submitLabel={doc ? (nl ? "Vervangen" : "Replace") : nl ? "Uploaden" : "Upload"}
                savingLabel={nl ? "Uploaden…" : "Uploading…"}
                savedMessage={nl ? "Huurcontract opgeslagen." : "Rental contract saved."}
                errorMessages={errors}
                fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
                className="space-y-3"
              >
                <input type="hidden" name="audience" value={slot.audience} />
                <input type="hidden" name="locale" value={slot.locale} />
                <FileField
                  name="file"
                  accept="application/pdf,.pdf"
                  locale={nl ? "nl" : "en"}
                  hint={nl ? "Enkel pdf, hoogstens 15 MB." : "PDF only, 15 MB at most."}
                />
              </SaveForm>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Richtlijnen en handleiding
// -----------------------------------------------------------------------------

export function RentalGuideCard({ nl, guide }: { nl: boolean; guide: RentalGuide }) {
  const errors = rentalAdminErrors(nl);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">
        {nl ? "Richtlijnen en handleiding" : "Guidelines and handbook"}
      </h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "De richtlijnen staan naast het publieke formulier; de handleiding staat enkel hier, voor wie de aanvragen behandelt."
          : "The guidelines sit next to the public form; the handbook stays here, for whoever handles the requests."}
      </p>

      <SaveForm
        action={saveRentalGuideAction}
        submitLabel={nl ? "Opslaan" : "Save"}
        savingLabel={nl ? "Opslaan…" : "Saving…"}
        savedMessage={nl ? "Teksten opgeslagen." : "Texts saved."}
        errorMessages={errors}
        fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
        resetOnSuccess={false}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="tv-guide-nl">
            {nl ? "Richtlijnen op de publieke pagina (NL)" : "Guidelines on the public page (NL)"}
          </Label>
          <MarkdownEditorField
            textareaId="tv-guide-nl"
            locale={nl ? "nl" : "en"}
            name="guidelinesNl"
            defaultValue={guide.guidelinesNl}
            rows={12}
            allowImages={false}
          />
        </div>
        <div>
          <Label htmlFor="tv-guide-en">
            {nl ? "Richtlijnen op de publieke pagina (EN)" : "Guidelines on the public page (EN)"}
          </Label>
          <MarkdownEditorField
            textareaId="tv-guide-en"
            locale={nl ? "nl" : "en"}
            name="guidelinesEn"
            defaultValue={guide.guidelinesEn}
            rows={12}
            allowImages={false}
          />
        </div>
        <div>
          <Label htmlFor="tv-handbook">
            {nl ? "Handleiding voor het beheer" : "Handbook for the admin"}
          </Label>
          <MarkdownEditorField
            textareaId="tv-handbook"
            locale={nl ? "nl" : "en"}
            name="handbook"
            defaultValue={guide.handbook}
            rows={12}
            allowImages={false}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Staat bovenaan het tabblad Aanvragen. Schrijf hier wat de volgende verantwoordelijke moet weten."
              : "Shown at the top of the Requests tab. Write here what next year's responsible needs to know."}
          </p>
        </div>
      </SaveForm>
    </Card>
  );
}
