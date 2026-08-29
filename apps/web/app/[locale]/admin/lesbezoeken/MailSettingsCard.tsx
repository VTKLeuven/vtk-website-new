"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import {
  saveLesbezoekSettingsAction,
  saveLesbezoekTemplatesAction,
} from "@/app/actions/lesbezoeken";
import {
  DEFAULT_LESBEZOEK_TEMPLATE_ITEMS,
  LESBEZOEK_PLACEHOLDERS,
  type LesbezoekConfig,
  type LesbezoekTemplateCategory,
  type LesbezoekTemplateItem,
  type LesbezoekTemplates,
} from "@/lib/lesbezoekenMail";
import {
  LESBEZOEK_NUDGE_LEAD_MAX,
  LESBEZOEK_NUDGE_LEAD_MIN,
} from "@/lib/lesbezoeken";
import { lesbezoekAdminErrors } from "@/lib/lesbezoekenMessages";

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
  const [items, setItems] = useState<LesbezoekTemplateItem[]>(() => {
    return templates.items && templates.items.length > 0
      ? templates.items
      : DEFAULT_LESBEZOEK_TEMPLATE_ITEMS;
  });

  if (!canManage) return null;

  const handleUpdateItem = (
    id: string,
    field: keyof LesbezoekTemplateItem,
    value: unknown,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddNew = () => {
    const id = `custom_${Date.now().toString(36)}`;
    const newItem: LesbezoekTemplateItem = {
      id,
      name: nl ? "Nieuw mailsjabloon" : "New email template",
      subject: nl ? "Betreft: {vak} op {datum}" : "Regarding: {vak} on {datum}",
      body: nl
        ? [
            "Beste {contactpersoon},",
            "",
            "Hierbij informeren wij u over het lesbezoek voor {organisatie} tijdens {vak} op {datum} om {uur}.",
            "",
            "Met vriendelijke groeten,",
            "{ondertekening}",
          ].join("\n")
        : [
            "Dear {contactpersoon},",
            "",
            "We are writing regarding the classroom visit for {organisatie} during {vak} on {datum} at {uur}.",
            "",
            "Sincerely,",
            "{ondertekening}",
          ].join("\n"),
      category: "other",
      lang: "nl",
      isDefault: false,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleResetDefaults = () => {
    if (
      window.confirm(
        nl
          ? "Weet je zeker dat je alle standaardsjablonen wilt herstellen naar de oorspronkelijke tekst?"
          : "Are you sure you want to reset all standard templates to their default text?",
      )
    ) {
      setItems(DEFAULT_LESBEZOEK_TEMPLATE_ITEMS);
    }
  };

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
          <div>
            <Label htmlFor="lb-nudge-days">
              {nl
                ? "Herinnering aankondigen vanaf (dagen voor het bezoek)"
                : "Announce the reminder from (days before the visit)"}
            </Label>
            <Input
              id="lb-nudge-days"
              name="nudgeLeadDays"
              type="number"
              min={LESBEZOEK_NUDGE_LEAD_MIN}
              max={LESBEZOEK_NUDGE_LEAD_MAX}
              step={1}
              defaultValue={config.nudgeLeadDays}
              className="max-w-28"
            />
            <p className="lb-help">
              {nl
                ? "Zoveel dagen voor het bezoek roept de werklijst dat de docent nog niet antwoordde. Wie eerder wil porren, zet het hoger."
                : "This many days before the visit, the work list flags that the lecturer has not replied. Set it higher to nudge sooner."}
            </p>
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h2 className="text-lg font-semibold">{nl ? "Mailsjablonen" : "Email templates"}</h2>
            <p className="text-sm text-[#5c667f]">
              {nl
                ? "Beheer de sjablonen die klaarstaan wanneer je een mail verstuurt. Je kan namen aanpassen, nieuwe sjablonen toevoegen of overbodige verwijderen."
                : "Manage the email templates used when composing messages. You can edit names, add new templates, or remove unneeded ones."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddNew}
            >
              + {nl ? "Nieuw sjabloon" : "New template"}
            </Button>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/30 p-3 text-xs text-[#5c667f]">
          <span className="font-semibold text-vtk-ink">
            {nl ? "Beschikbare variabelen: " : "Available variables: "}
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {LESBEZOEK_PLACEHOLDERS.map((name) => (
              <code
                key={name}
                className="rounded-md bg-white border border-vtk-blue/15 px-1.5 py-0.5 font-mono text-[11px] text-vtk-ink"
              >
                {`{${name}}`}
              </code>
            ))}
          </div>
        </div>

        <SaveForm
          action={saveLesbezoekTemplatesAction}
          submitLabel={nl ? "Sjablonen opslaan" : "Save templates"}
          savingLabel={nl ? "Opslaan…" : "Saving…"}
          savedMessage={nl ? "Sjablonen opgeslagen." : "Templates saved."}
          errorMessages={errors}
          fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
          resetOnSuccess={false}
          className="space-y-4"
        >
          <input
            type="hidden"
            name="templatesJson"
            value={JSON.stringify(items)}
          />

          <div className="space-y-3">
            {items.map((item, index) => (
              <details
                key={item.id}
                open={index === 0}
                className="group rounded-2xl border border-vtk-blue/15 bg-white p-4 transition-all"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-vtk-ink select-none">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-vtk-blue/10 text-xs font-semibold text-vtk-ink group-open:rotate-90 transition-transform">
                      ›
                    </span>
                    <span className="truncate font-medium">{item.name || (nl ? "Naamloos sjabloon" : "Untitled template")}</span>
                    {item.lang && (
                      <span className="rounded-full border border-vtk-blue/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5c667f]">
                        {item.lang}
                      </span>
                    )}
                    {item.category && item.category !== "other" && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                        {item.category === "professor"
                          ? nl
                            ? "Docent"
                            : "Lecturer"
                          : item.category === "nudge"
                            ? nl
                              ? "Herinnering"
                              : "Reminder"
                            : nl
                              ? "Aanvrager"
                              : "Requester"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteItem(item.id);
                      }}
                      className="rounded-lg p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title={nl ? "Sjabloon verwijderen" : "Delete template"}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
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
                </summary>

                <div className="mt-4 space-y-3 pt-3 border-t border-vtk-blue/10">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <Label htmlFor={`tpl-name-${item.id}`}>
                        {nl ? "Naam van sjabloon" : "Template name"}
                      </Label>
                      <Input
                        id={`tpl-name-${item.id}`}
                        value={item.name}
                        onChange={(e) => handleUpdateItem(item.id, "name", e.target.value)}
                        placeholder={nl ? "bv. Docent · uitnodiging" : "e.g. Lecturer · invitation"}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`tpl-cat-${item.id}`}>
                        {nl ? "Bestemming" : "Target"}
                      </Label>
                      <Select
                        id={`tpl-cat-${item.id}`}
                        value={item.category ?? "other"}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.id,
                            "category",
                            e.target.value as LesbezoekTemplateCategory,
                          )
                        }
                      >
                        <option value="professor">{nl ? "Docent (aanvraag)" : "Lecturer (request)"}</option>
                        <option value="nudge">{nl ? "Docent (herinnering)" : "Lecturer (reminder)"}</option>
                        <option value="requester">{nl ? "Aanvrager" : "Requester"}</option>
                        <option value="other">{nl ? "Algemeen / Overig" : "General / Other"}</option>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-3">
                      <Label htmlFor={`tpl-subject-${item.id}`}>{nl ? "Onderwerp" : "Subject"}</Label>
                      <Input
                        id={`tpl-subject-${item.id}`}
                        value={item.subject}
                        onChange={(e) => handleUpdateItem(item.id, "subject", e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`tpl-lang-${item.id}`}>{nl ? "Taal" : "Language"}</Label>
                      <Select
                        id={`tpl-lang-${item.id}`}
                        value={item.lang ?? "nl"}
                        onChange={(e) => handleUpdateItem(item.id, "lang", e.target.value as "nl" | "en")}
                      >
                        <option value="nl">Nederlands</option>
                        <option value="en">English</option>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`tpl-body-${item.id}`}>{nl ? "Bericht" : "Message"}</Label>
                    <Textarea
                      id={`tpl-body-${item.id}`}
                      rows={10}
                      value={item.body}
                      onChange={(e) => handleUpdateItem(item.id, "body", e.target.value)}
                      className="font-mono text-[13px] leading-relaxed"
                      required
                    />
                  </div>
                </div>
              </details>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleResetDefaults}>
              {nl ? "Standaardsjablonen herstellen" : "Reset standard templates"}
            </Button>
          </div>
        </SaveForm>
      </Card>
    </>
  );
}
