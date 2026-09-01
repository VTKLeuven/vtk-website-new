"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { MailPreview } from "@/components/admin/MailPreview";
import { deleteRentalTemplateAction, saveRentalTemplateAction } from "@/app/actions/theokotVerhuur";
import {
  RENTAL_PLACEHOLDERS,
  previewRentalVars,
  renderRentalMail,
  type RentalTemplate,
} from "@/lib/theokotVerhuurMail";
import { rentalAdminErrors } from "@/lib/theokotVerhuurMessages";

/**
 * De mailsjablonen van de verhuur.
 *
 * Elk sjabloon is een eigen formulier dat apart bewaart. Dat is met opzet: één
 * groot formulier voor alle sjablonen betekent dat een tikfout in het ene het
 * andere meesleurt, en dat je na elke kleine wijziging alles opnieuw verstuurt.
 *
 * Onder elk sjabloon staat het mailvoorbeeld met voorbeeldgegevens ingevuld.
 * Zonder dat bewerk je `{plaatshouders}` en zie je nooit de zin die de huurder
 * leest.
 */

const CATEGORY_LABELS: Record<RentalTemplate["category"], { nl: string; en: string }> = {
  confirmation: { nl: "Ontvangstbevestiging", en: "Confirmation of receipt" },
  approved: { nl: "Goedgekeurd", en: "Approved" },
  rejected: { nl: "Geweigerd", en: "Denied" },
  other: { nl: "Algemeen", en: "General" },
};

export function RentalTemplatesCard({
  nl,
  templates,
  senderLabel,
  signature,
  replyTo,
}: {
  nl: boolean;
  templates: RentalTemplate[];
  senderLabel: string;
  signature: string;
  replyTo: string;
}) {
  const [draft, setDraft] = useState<RentalTemplate | null>(null);

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{nl ? "Mailsjablonen" : "Email templates"}</h2>
          <p className="text-sm text-[#5c667f]">
            {nl
              ? "De teksten die klaarstaan wanneer je een aanvraag beantwoordt. De ontvangstbevestiging vertrekt automatisch; de andere kies je zelf bij een aanvraag."
              : "The texts that are ready when you answer a request. The confirmation of receipt goes out automatically; the others you pick per request."}
          </p>
        </div>
        {!draft && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(emptyTemplate(nl))}>
            + {nl ? "Nieuw sjabloon" : "New template"}
          </Button>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/30 p-3 text-xs text-[#5c667f]">
        <span className="font-semibold text-vtk-ink">
          {nl ? "Beschikbare variabelen: " : "Available variables: "}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {RENTAL_PLACEHOLDERS.map((name) => (
            <code
              key={name}
              className="rounded-md border border-vtk-blue/15 bg-white px-1.5 py-0.5 font-mono text-[11px] text-vtk-ink"
            >
              {`{${name}}`}
            </code>
          ))}
        </span>
      </div>

      <div className="space-y-3">
        {draft && (
          <TemplateEditor
            nl={nl}
            template={draft}
            senderLabel={senderLabel}
            signature={signature}
            replyTo={replyTo}
            open
            onSaved={() => setDraft(null)}
          />
        )}
        {templates.map((template, index) => (
          <TemplateEditor
            key={template.id}
            nl={nl}
            template={template}
            senderLabel={senderLabel}
            signature={signature}
            replyTo={replyTo}
            open={!draft && index === 0}
          />
        ))}
      </div>
    </Card>
  );
}

function emptyTemplate(nl: boolean): RentalTemplate {
  return {
    id: "",
    name: nl ? "Nieuw sjabloon" : "New template",
    category: "other",
    lang: "nl",
    attachContract: false,
    isDefault: false,
    subject: nl ? "Over je aanvraag voor het Theokot op {datum}" : "About your Theokot request on {datum}",
    body: nl
      ? [
          "Beste {naam},",
          "",
          "Over je aanvraag om het Theokot te gebruiken op {datum} van {startuur} tot {einduur}:",
          "",
          "{motivatie}",
          "",
          "Met vriendelijke groeten,",
          "{ondertekening}",
        ].join("\n")
      : [
          "Dear {naam},",
          "",
          "About your request to use Theokot on {datum} from {startuur} to {einduur}:",
          "",
          "{motivatie}",
          "",
          "Kind regards,",
          "{ondertekening}",
        ].join("\n"),
  };
}

function TemplateEditor({
  nl,
  template,
  senderLabel,
  signature,
  replyTo,
  open,
  onSaved,
}: {
  nl: boolean;
  template: RentalTemplate;
  senderLabel: string;
  signature: string;
  replyTo: string;
  open: boolean;
  onSaved?: () => void;
}) {
  const errors = rentalAdminErrors(nl);
  const lang = nl ? "nl" : "en";

  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category);
  const [templateLang, setTemplateLang] = useState(template.lang);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [attachContract, setAttachContract] = useState(template.attachContract);

  const vars = previewRentalVars(templateLang, signature);
  const rendered = renderRentalMail({ subject, body }, vars);

  return (
    <details open={open} className="group rounded-2xl border border-vtk-blue/15 bg-white p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-vtk-ink select-none">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-vtk-blue/10 text-xs font-semibold transition-transform group-open:rotate-90">
            ›
          </span>
          <span className="truncate">{name}</span>
          <span className="rounded-full border border-vtk-blue/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5c667f]">
            {templateLang}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
            {CATEGORY_LABELS[category][lang]}
          </span>
        </span>
        {!template.isDefault && template.id && (
          <span onClick={(event) => event.preventDefault()}>
            <DeleteIconButton
              action={deleteRentalTemplateAction}
              fields={{ templateId: template.id }}
              label={nl ? "Sjabloon verwijderen" : "Delete template"}
              srLabel={nl ? `Verwijderen: ${template.name}` : `Delete: ${template.name}`}
              title={nl ? "Sjabloon verwijderen?" : "Delete template?"}
              description={
                nl
                  ? `"${template.name}" verdwijnt uit de keuzelijst bij een aanvraag. Mails die al met dit sjabloon verstuurd zijn, blijven staan zoals ze verstuurd werden.`
                  : `"${template.name}" disappears from the list of templates. Emails already sent with it stay exactly as they were sent.`
              }
              confirmLabel={nl ? "Verwijderen" : "Delete"}
              cancelLabel={nl ? "Annuleren" : "Cancel"}
              successMessage={nl ? "Sjabloon verwijderd." : "Template deleted."}
            />
          </span>
        )}
      </summary>

      <SaveForm
        action={saveRentalTemplateAction}
        submitLabel={nl ? "Sjabloon opslaan" : "Save template"}
        savingLabel={nl ? "Opslaan…" : "Saving…"}
        savedMessage={nl ? "Sjabloon opgeslagen." : "Template saved."}
        errorMessages={errors}
        fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
        resetOnSuccess={false}
        onSuccess={onSaved}
        className="mt-4 space-y-3 border-t border-vtk-blue/10 pt-3"
      >
        <input type="hidden" name="templateId" value={template.id} />

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor={`n-${template.id}`}>{nl ? "Naam" : "Name"}</Label>
            <Input
              id={`n-${template.id}`}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor={`c-${template.id}`}>{nl ? "Bestemming" : "Purpose"}</Label>
            <Select
              id={`c-${template.id}`}
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value as RentalTemplate["category"])}
              // Een standaardsjabloon houdt zijn bestemming: de knoppen in het
              // beheer en in de meldingsmail zoeken erop.
              disabled={template.isDefault}
            >
              {(Object.keys(CATEGORY_LABELS) as RentalTemplate["category"][]).map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value][lang]}
                </option>
              ))}
            </Select>
            {template.isDefault && <input type="hidden" name="category" value={category} />}
          </div>
          <div>
            <Label htmlFor={`l-${template.id}`}>{nl ? "Taal" : "Language"}</Label>
            <Select
              id={`l-${template.id}`}
              name="lang"
              value={templateLang}
              onChange={(event) => setTemplateLang(event.target.value as "nl" | "en")}
            >
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor={`s-${template.id}`}>{nl ? "Onderwerp" : "Subject"}</Label>
          <Input
            id={`s-${template.id}`}
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor={`b-${template.id}`}>{nl ? "Bericht" : "Message"}</Label>
          <Textarea
            id={`b-${template.id}`}
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
            checked={attachContract}
            onChange={(event) => setAttachContract(event.target.checked)}
          />
          <span>
            {nl
              ? "Het huurcontract als bijlage meesturen"
              : "Attach the rental contract to this email"}
            <br />
            <span className="text-xs text-[#5c667f]">
              {nl
                ? "Welk contract dat is, volgt uit de aanvraag zelf: intern of extern, en haar taal."
                : "Which contract that is follows from the request itself: internal or external, and its language."}
            </span>
          </span>
        </label>

        <MailPreview
          nl={nl}
          from={senderLabel}
          to={
            templateLang === "nl" ? "jonas@voorbeeld.be" : "jonas@example.org"
          }
          replyTo={replyTo}
          subject={rendered.subject}
          body={rendered.body}
          attachments={
            attachContract ? [templateLang === "nl" ? "huurcontract.pdf" : "rental-contract.pdf"] : []
          }
          source={nl ? "met voorbeeldgegevens" : "with example data"}
        />
      </SaveForm>
    </details>
  );
}
