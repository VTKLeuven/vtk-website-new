"use client";

import { useMemo, useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@vtk/ui";
import { Modal } from "@/app/[locale]/admin/admin-table";
import { SaveForm } from "@/components/ui/SaveForm";
import { sendBulkLesbezoekMailsAction } from "@/app/actions/lesbezoeken";
import { getSchedulePresets } from "@/lib/lesbezoeken";
import {
  DEFAULT_LESBEZOEK_TEMPLATE_ITEMS,
  digestMailVars,
  mailVarsFor,
  nudgeTemplateKey,
  professorTemplateKey,
  REQUESTER_DIGEST_TEMPLATE_KEY,
  renderMailTemplate,
  type LesbezoekTemplateItem,
} from "@/lib/lesbezoekenMail";
import { lesbezoekAdminErrors } from "@/lib/lesbezoekenMessages";
import type { VisitView } from "./types";

/**
 * Meerdere mails in één beurt: de vraag naar de docenten van een hele reeks
 * aanvragen, of één gebundelde terugkoppeling per aanvrager.
 *
 * Dit is de mailmerge die de Word-sjablonen vervingen, met het verschil dat elke
 * mail hier eerst leesbaar en bewerkbaar op het scherm staat. Dat is de regel uit
 * docs/design-decisions.md: een merge die rij per rij rechtstreeks naar een
 * professor vertrekt, stuurt bij een fout in het sjabloon honderd keer dezelfde
 * fout. Uitvinken kan per mail, en de tekst blijft tot de laatste seconde van jou.
 */

export type BulkMode = "professor" | "requester";

/** Eén op te stellen mail. Bij een bundel dekt `ids` meerdere lesbezoeken. */
type Draft = {
  key: string;
  ids: string[];
  kind: "professor" | "nudge" | "requester";
  to: string;
  cc: string | null;
  title: string;
  meta: string;
  /** De lesbezoeken in deze mail, voor het regeltje onder de titel. */
  lines: string[];
  subject: string;
  body: string;
  included: boolean;
};

/** Sjabloon "automatisch": per bezoek het sjabloon dat erbij hoort. */
const AUTO = "__auto__";

function shortWhen(visit: VisitView, nl: boolean): string {
  const date = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${visit.day}T12:00:00`));
  return `${date} · ${visit.time}`;
}

export function BulkMailModal({
  nl,
  mode,
  visits,
  templates,
  signature,
  onClose,
  onSent,
}: {
  nl: boolean;
  mode: BulkMode;
  /** De aangevinkte lesbezoeken, in de volgorde van de werklijst. */
  visits: VisitView[];
  templates: LesbezoekTemplateItem[];
  signature: string;
  onClose: () => void;
  /** Loopt enkel wanneer er echt iets vertrokken of ingepland is. */
  onSent: () => void;
}) {
  const errors = lesbezoekAdminErrors(nl);

  const [lang, setLang] = useState<"auto" | "nl" | "en">("auto");
  const [templateId, setTemplateId] = useState<string>(AUTO);

  // Wie er niet in de merge past, en waarom. Beter zichtbaar bovenaan dan
  // stilzwijgend weggelaten: anders denkt iemand dat er twintig mails vertrokken
  // terwijl het er zeventien waren.
  const skipped = useMemo(() => {
    if (mode === "professor") {
      return visits.filter((visit) => visit.status !== "PENDING" && visit.status !== "ASKED");
    }
    return visits.filter((visit) => !visit.requesterEmail);
  }, [mode, visits]);

  const usable = useMemo(
    () => visits.filter((visit) => !skipped.includes(visit)),
    [visits, skipped],
  );

  const build = useMemo(
    () => (activeLang: "auto" | "nl" | "en", activeTemplate: string): Draft[] => {
      // Een installatie die haar sjablonen al ooit bewaarde, heeft het
      // bundelsjabloon niet in haar lijst staan: die tekst is er later
      // bijgekomen. Terugvallen op de ingebouwde tekst is dan beter dan het
      // eerste het beste sjabloon uit de lijst te pakken.
      const pick = (id: string): LesbezoekTemplateItem | undefined =>
        templates.find((item) => item.id === id) ??
        DEFAULT_LESBEZOEK_TEMPLATE_ITEMS.find((item) => item.id === id);

      if (mode === "professor") {
        const drafts: Draft[] = [];
        for (const visit of usable) {
          const locale = activeLang === "auto" ? visit.teacherLocale : activeLang;
          // Ligt de vraag al bij de docent, dan is de mail een herinnering. Zo
          // bedient dezelfde knop het insturen van nieuwe aanvragen én het
          // porren van de reeksen die blijven liggen.
          const kind = visit.status === "ASKED" ? "nudge" : "professor";
          const defaultId =
            kind === "nudge"
              ? nudgeTemplateKey(locale)
              : professorTemplateKey(visit.longVisit, locale);
          const template =
            (activeTemplate !== AUTO ? pick(activeTemplate) : undefined) ??
            pick(defaultId) ??
            templates[0];
          if (!template) continue;

          const rendered = renderMailTemplate(template, mailVarsFor(visit, locale, signature));

          drafts.push({
            key: visit.id,
            ids: [visit.id],
            kind,
            to: visit.teacherEmail,
            cc: null,
            title: `${visit.organisationName} — ${visit.course}`,
            meta: `${shortWhen(visit, nl)} · ${visit.teacherName ?? visit.teacherEmail}`,
            lines: [],
            subject: rendered.subject,
            body: rendered.body,
            included: true,
          });
        }
        return drafts;
      }

      // Bundelen per aanvrager binnen één organisatie. Niet per adres alleen:
      // wie voor twee organisaties aanvraagt, krijgt anders één mail waarin de
      // lesbezoeken van beide door elkaar staan.
      const groups = new Map<string, VisitView[]>();
      for (const visit of usable) {
        const key = `${visit.organisationId}|${(visit.requesterEmail ?? "").toLowerCase()}`;
        const bucket = groups.get(key);
        if (bucket) bucket.push(visit);
        else groups.set(key, [visit]);
      }

      const template =
        (activeTemplate !== AUTO ? pick(activeTemplate) : undefined) ??
        pick(REQUESTER_DIGEST_TEMPLATE_KEY) ??
        templates[0];
      if (!template) return [];

      const bundles: Draft[] = [];
      for (const [key, group] of groups.entries()) {
        const first = group[0]!;
        const locale = activeLang === "en" ? "en" : "nl";
        const rendered = renderMailTemplate(
          template,
          digestMailVars(
            {
              organisationName: first.organisationName,
              requesterName: first.requesterName,
              visits: group,
            },
            locale,
            signature,
          ),
        );

        bundles.push({
          key,
          ids: group.map((visit) => visit.id),
          kind: "requester",
          to: first.requesterEmail!,
          cc: null,
          title: `${first.organisationName} — ${first.requesterName ?? first.requesterEmail}`,
          meta: nl
            ? `${group.length} lesbezoek${group.length === 1 ? "" : "en"} in één mail`
            : `${group.length} class visit${group.length === 1 ? "" : "s"} in one email`,
          lines: group.map(
            (visit) =>
              `${visit.course} · ${shortWhen(visit, nl)}${
                visit.requesterNotifiedAt ? (nl ? " · al verwittigd" : " · already notified") : ""
              }`,
          ),
          subject: rendered.subject,
          body: rendered.body,
          included: true,
        });
      }

      return bundles;
    },
    [mode, usable, templates, signature, nl],
  );

  const [drafts, setDrafts] = useState<Draft[]>(() => build(lang, templateId));

  // Van taal of sjabloon wisselen stelt alles opnieuw op. Dat wist wat je typte,
  // dus het is een bewuste keuze en geen bijwerking: half vertaalde mails zijn
  // erger dan opnieuw beginnen.
  const [prevKey, setPrevKey] = useState(`${lang}|${templateId}`);
  const nextKey = `${lang}|${templateId}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setDrafts(build(lang, templateId));
  }

  const included = drafts.filter((draft) => draft.included);
  const mailCount = included.length;
  const visitCount = included.reduce((total, draft) => total + draft.ids.length, 0);

  const presets = useMemo(() => getSchedulePresets(new Date()), []);
  const [sendMode, setSendMode] = useState<"scheduled" | "instant">("scheduled");
  const [presetId, setPresetId] = useState<string>(presets[0]?.id ?? "tomorrow_0800");
  const [customDate, setCustomDate] = useState<string>(() => presets[0]?.dateStr ?? "");
  const [customTime, setCustomTime] = useState<string>(() => presets[0]?.timeStr ?? "08:00");

  const activePreset = presets.find((preset) => preset.id === presetId);
  const sendAtDate = presetId === "custom" ? customDate : (activePreset?.dateStr ?? customDate);
  const sendAtTime = presetId === "custom" ? customTime : (activePreset?.timeStr ?? customTime);
  const momentLabel = activePreset
    ? nl
      ? activePreset.labelNl
      : activePreset.labelEn
    : `${sendAtDate} ${sendAtTime}`;

  const payload = JSON.stringify({
    mode: sendMode === "instant" ? "instant" : "scheduled",
    sendAtDate,
    sendAtTime,
    locale: nl ? "nl" : "en",
    items: included.map((draft) => ({
      ids: draft.ids,
      kind: draft.kind,
      subject: draft.subject,
      body: draft.body,
    })),
  });

  // Om dezelfde reden staat het bundelsjabloon in de keuzelijst, ook wanneer het
  // niet in de bewaarde sjablonen zit.
  const known = templates.some((item) => item.id === REQUESTER_DIGEST_TEMPLATE_KEY)
    ? templates
    : [
        ...templates,
        ...DEFAULT_LESBEZOEK_TEMPLATE_ITEMS.filter(
          (item) => item.id === REQUESTER_DIGEST_TEMPLATE_KEY,
        ),
      ];

  const relevantTemplates = known.filter((item) =>
    mode === "professor"
      ? item.category === "professor" || item.category === "nudge" || item.category === "other"
      : item.category === "requester" || item.category === "other",
  );

  const update = (key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  };

  return (
    <Modal
      title={
        mode === "professor"
          ? nl
            ? "Naar de docenten versturen"
            : "Send to the lecturers"
          : nl
            ? "Terugkoppeling bundelen"
            : "Bundle the replies"
      }
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-[#5c667f]">
          {mode === "professor"
            ? nl
              ? "Elke aanvraag krijgt haar eigen mail, met het sjabloon dat bij haar hoort. Aanvragen die al bij de docent liggen, krijgen de herinnering in plaats van de vraag. Lees ze na voor je verstuurt: een fout in de tekst vertrekt hier evenveel keer als er mails zijn."
              : "Each request gets its own email, with the template that fits it. Requests already with the lecturer get the reminder instead of the question. Read them before sending: a mistake goes out as many times as there are emails."
            : nl
              ? "Per aanvrager één mail met al zijn lesbezoeken erin, gegroepeerd per uitkomst. Twintig aanvragen worden dus één bericht in plaats van twintig."
              : "One email per requester with all of their class visits, grouped by outcome. Twenty requests become one message instead of twenty."}
        </p>

        {skipped.length > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs leading-relaxed text-amber-900">
            {mode === "professor"
              ? nl
                ? `${skipped.length} geselecteerde aanvraag/aanvragen zijn hier weggelaten: ze staan niet meer op "Nieuw" of "Bij de prof", dus er is niets meer aan de docent te vragen.`
                : `${skipped.length} selected request(s) were left out: they are no longer "New" or "With the professor", so there is nothing left to ask.`
              : nl
                ? `${skipped.length} geselecteerde aanvraag/aanvragen zijn hier weggelaten: er staat geen mailadres van een aanvrager bij.`
                : `${skipped.length} selected request(s) were left out: there is no requester email address on them.`}
          </p>
        )}

        {drafts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-vtk-blue/20 p-6 text-center text-sm text-[#5c667f]">
            {nl
              ? "Er blijft geen enkele mail over om te versturen."
              : "No email is left to send."}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="bulk-template">{nl ? "Sjabloon" : "Template"}</Label>
                <Select
                  id="bulk-template"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  <option value={AUTO}>
                    {nl ? "Automatisch per aanvraag" : "Automatic per request"}
                  </option>
                  {relevantTemplates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="bulk-lang">{nl ? "Taal" : "Language"}</Label>
                <Select
                  id="bulk-lang"
                  value={lang}
                  onChange={(event) => setLang(event.target.value as "auto" | "nl" | "en")}
                >
                  <option value="auto">
                    {nl ? "Automatisch (master = Engels)" : "Automatic (master = English)"}
                  </option>
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.key}
                  className={`rounded-2xl border p-3 transition-colors ${
                    draft.included
                      ? "border-vtk-blue/15 bg-white"
                      : "border-zinc-200 bg-zinc-50/70 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-[#0E1A36]"
                      checked={draft.included}
                      onChange={(event) => update(draft.key, { included: event.target.checked })}
                      aria-label={
                        nl ? `Mail meesturen: ${draft.title}` : `Include email: ${draft.title}`
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-vtk-ink">{draft.title}</span>
                        <span className="lb-badge" data-tone={draft.kind === "nudge" ? "waiting" : "sent"}>
                          {draft.kind === "professor"
                            ? nl
                              ? "Vraag"
                              : "Request"
                            : draft.kind === "nudge"
                              ? nl
                                ? "Herinnering"
                                : "Reminder"
                              : nl
                                ? "Terugkoppeling"
                                : "Reply"}
                        </span>
                      </div>
                      <p className="text-xs text-[#5c667f]">{draft.meta}</p>
                      <p className="text-xs text-[#5c667f]">
                        {nl ? "Naar" : "To"}: <span className="font-mono">{draft.to}</span>
                      </p>
                      {draft.lines.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-[#5c667f]">
                          {draft.lines.map((line) => (
                            <li key={line}>· {line}</li>
                          ))}
                        </ul>
                      )}

                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-vtk-ink underline underline-offset-2">
                          {nl ? "Tekst nalezen en aanpassen" : "Read and edit the text"}
                        </summary>
                        <div className="mt-2 space-y-2">
                          <div>
                            <Label htmlFor={`bulk-subject-${draft.key}`}>
                              {nl ? "Onderwerp" : "Subject"}
                            </Label>
                            <Input
                              id={`bulk-subject-${draft.key}`}
                              value={draft.subject}
                              onChange={(event) =>
                                update(draft.key, { subject: event.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`bulk-body-${draft.key}`}>
                              {nl ? "Bericht" : "Message"}
                            </Label>
                            <Textarea
                              id={`bulk-body-${draft.key}`}
                              rows={10}
                              value={draft.body}
                              onChange={(event) => update(draft.key, { body: event.target.value })}
                              className="font-mono text-[13px] leading-relaxed"
                            />
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-vtk-blue/15 bg-zinc-50/70 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="mb-0 text-xs font-bold uppercase tracking-wider text-[#5c667f]">
                  {nl ? "Verzendtijdstip" : "Sending time"}
                </Label>
                <div className="inline-flex rounded-full border border-vtk-blue/15 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setSendMode("scheduled")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                      sendMode === "scheduled"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-[#5c667f] hover:text-vtk-ink"
                    }`}
                  >
                    {nl ? "Inplannen (aanbevolen)" : "Schedule (recommended)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMode("instant")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                      sendMode === "instant"
                        ? "bg-vtk-ink text-white shadow-xs"
                        : "text-[#5c667f] hover:text-vtk-ink"
                    }`}
                  >
                    {nl ? "Direct versturen" : "Send immediately"}
                  </button>
                </div>
              </div>

              {sendMode === "scheduled" ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#5c667f]">
                    {nl
                      ? "Een reeks mails aan docenten vertrekt bij voorkeur tijdens de kantooruren, niet 's avonds allemaal tegelijk."
                      : "A batch of emails to lecturers is best sent during office hours, not all at once at night."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setPresetId(preset.id)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                          presetId === preset.id
                            ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-900 shadow-xs"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                        }`}
                      >
                        {nl ? preset.labelNl : preset.labelEn}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPresetId("custom")}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                        presetId === "custom"
                          ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-900 shadow-xs"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                      }`}
                    >
                      {nl ? "Aangepast moment…" : "Custom time…"}
                    </button>
                  </div>
                  {presetId === "custom" && (
                    <div className="grid gap-3 rounded-xl border border-indigo-100 bg-white p-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="bulk-date">{nl ? "Verzenddatum" : "Send date"}</Label>
                        <Input
                          id="bulk-date"
                          type="date"
                          value={customDate}
                          onChange={(event) => setCustomDate(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="bulk-time">
                          {nl ? "Verzenduur (Brussel-tijd)" : "Send time (Brussels)"}
                        </Label>
                        <Input
                          id="bulk-time"
                          type="time"
                          value={customTime}
                          onChange={(event) => setCustomTime(event.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900">
                  {nl
                    ? `Bij het klikken vertrekken de ${mailCount} mails meteen. Terugnemen kan niet.`
                    : `On click, the ${mailCount} emails go out right away. There is no undo.`}
                </p>
              )}
            </div>

            <SaveForm
              action={sendBulkLesbezoekMailsAction}
              submitLabel={
                sendMode === "scheduled"
                  ? nl
                    ? `${mailCount} mail(s) inplannen voor ${momentLabel}`
                    : `Schedule ${mailCount} email(s) for ${momentLabel}`
                  : nl
                    ? `${mailCount} mail(s) nu versturen`
                    : `Send ${mailCount} email(s) now`
              }
              savingLabel={nl ? "Bezig…" : "Working…"}
              savedMessage={
                sendMode === "scheduled"
                  ? nl
                    ? `${mailCount} mail(s) ingepland voor ${visitCount} lesbezoek(en).`
                    : `${mailCount} email(s) scheduled for ${visitCount} class visit(s).`
                  : nl
                    ? `${mailCount} mail(s) verstuurd voor ${visitCount} lesbezoek(en).`
                    : `${mailCount} email(s) sent for ${visitCount} class visit(s).`
              }
              errorMessages={errors}
              fallbackErrorMessage={nl ? "Niet verstuurd." : "Not sent."}
              resetOnSuccess={false}
              submitDisabled={mailCount === 0}
              onSuccess={() => {
                onSent();
                onClose();
              }}
            >
              <input type="hidden" name="payload" value={payload} />
              <p className="mb-3 text-xs text-[#5c667f]">
                {nl
                  ? `${mailCount} mail(s) aangevinkt, samen goed voor ${visitCount} lesbezoek(en).`
                  : `${mailCount} email(s) ticked, covering ${visitCount} class visit(s).`}
              </p>
            </SaveForm>
          </>
        )}

        <div className="flex justify-end border-t border-vtk-blue/10 pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {nl ? "Annuleren" : "Cancel"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
