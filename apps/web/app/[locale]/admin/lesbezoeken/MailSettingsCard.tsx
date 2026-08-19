"use client";

import { Card, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import {
  saveLesbezoekSettingsAction,
  saveLesbezoekTemplatesAction,
} from "@/app/actions/lesbezoeken";
import {
  DEFAULT_LESBEZOEK_TEMPLATES,
  LESBEZOEK_PLACEHOLDERS,
  LESBEZOEK_TEMPLATE_KEYS,
  type LesbezoekConfig,
  type LesbezoekTemplateKey,
  type LesbezoekTemplates,
} from "@/lib/lesbezoekenMail";
import { lesbezoekAdminErrors } from "@/lib/lesbezoekenMessages";

/**
 * De ondertekening onder elke mail, de mailbox die een seintje krijgt, en de acht
 * sjablonen.
 *
 * De sjablonen zijn bewerkbaar omdat ze dat vroeger ook waren: het waren Word-
 * documenten in een gedeelde map, met bovenaan "pas gerust dingen aan". Wie de
 * lesbezoeken doet mag de aanhef wijzigen zonder een deploy af te wachten.
 */

const TEMPLATE_LABELS: Record<LesbezoekTemplateKey, { nl: string; en: string }> = {
  professorShortNl: { nl: "Docent · kort bezoek · NL", en: "Lecturer · short visit · NL" },
  professorLongNl: { nl: "Docent · lang bezoek · NL", en: "Lecturer · long visit · NL" },
  professorShortEn: { nl: "Docent · kort bezoek · EN", en: "Lecturer · short visit · EN" },
  professorLongEn: { nl: "Docent · lang bezoek · EN", en: "Lecturer · long visit · EN" },
  professorNudgeNl: { nl: "Herinnering docent · NL", en: "Reminder lecturer · NL" },
  professorNudgeEn: { nl: "Herinnering docent · EN", en: "Reminder lecturer · EN" },
  requesterApproved: { nl: "Aanvrager · goedgekeurd", en: "Requester · approved" },
  requesterDeclined: { nl: "Aanvrager · niet doorgegaan", en: "Requester · did not happen" },
};

export function MailSettingsCard({
  nl,
  canManage,
  config,
  templates,
}: {
  nl: boolean;
  canManage: boolean;
  config: LesbezoekConfig;
  templates: LesbezoekTemplates;
}) {
  const errors = lesbezoekAdminErrors(nl);

  if (!canManage) return null;

  return (
    <>
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Instellingen" : "Settings"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "De ondertekening staat onder elke mail; ze wisselt elk werkingsjaar mee met wie de lesbezoeken doet."
            : "The signature goes under every email; it changes each working year with whoever handles the visits."}
        </p>
        <SaveForm
          action={saveLesbezoekSettingsAction}
          submitLabel={nl ? "Opslaan" : "Save"}
          savingLabel={nl ? "Opslaan…" : "Saving…"}
          savedMessage={nl ? "Instellingen opgeslagen." : "Settings saved."}
          errorMessages={errors}
          fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
          resetOnSuccess={false}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="lb-signature">{nl ? "Ondertekening" : "Signature"}</Label>
            <Textarea id="lb-signature" name="signature" rows={3} defaultValue={config.signature} />
          </div>
          <div>
            <Label htmlFor="lb-notify">{nl ? "Mailbox lesbezoeken" : "Classroom-visit mailbox"}</Label>
            <Input
              id="lb-notify"
              name="notifyEmail"
              type="email"
              defaultValue={config.notifyEmail}
              required
            />
            <p className="lb-help">
              {nl
                ? "Krijgt een seintje bij elke nieuwe aanvraag, en is het antwoordadres van elke mail die hier vertrekt."
                : "Gets a heads-up on every new request, and is the reply-to on every email sent from here."}
            </p>
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Mailsjablonen" : "Email templates"}</h2>
        <p className="mb-2 text-sm text-[#5c667f]">
          {nl
            ? "Wat er klaarstaat wanneer je in een aanvraag op mailen klikt. Je leest de mail daar altijd nog na voor ze vertrekt."
            : "What is prepared when you compose an email on a request. You always read it over there before it goes out."}
        </p>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl ? "Beschikbare velden: " : "Available fields: "}
          {LESBEZOEK_PLACEHOLDERS.map((name) => `{${name}}`).join(" ")}.{" "}
          {nl
            ? "Een veld leegmaken zet dat sjabloon terug op de standaardtekst."
            : "Clearing a field resets that template to its default text."}
        </p>

        <SaveForm
          action={saveLesbezoekTemplatesAction}
          submitLabel={nl ? "Sjablonen opslaan" : "Save templates"}
          savingLabel={nl ? "Opslaan…" : "Saving…"}
          savedMessage={nl ? "Sjablonen opgeslagen." : "Templates saved."}
          errorMessages={errors}
          fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
          resetOnSuccess={false}
          className="space-y-3"
        >
          {LESBEZOEK_TEMPLATE_KEYS.map((key) => (
            <details key={key} className="rounded-2xl border border-vtk-blue/15 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-vtk-ink">
                {TEMPLATE_LABELS[key][nl ? "nl" : "en"]}
                {templates[key].body === DEFAULT_LESBEZOEK_TEMPLATES[key].body ? (
                  <span className="ml-2 text-xs font-normal text-[#5c667f]">
                    {nl ? "standaardtekst" : "default text"}
                  </span>
                ) : null}
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor={`tpl-subject-${key}`}>{nl ? "Onderwerp" : "Subject"}</Label>
                  <Input
                    id={`tpl-subject-${key}`}
                    name={`${key}.subject`}
                    defaultValue={templates[key].subject}
                  />
                </div>
                <div>
                  <Label htmlFor={`tpl-body-${key}`}>{nl ? "Bericht" : "Message"}</Label>
                  <Textarea
                    id={`tpl-body-${key}`}
                    name={`${key}.body`}
                    rows={12}
                    defaultValue={templates[key].body}
                    className="font-mono text-[13px]"
                  />
                </div>
              </div>
            </details>
          ))}
        </SaveForm>
      </Card>
    </>
  );
}
