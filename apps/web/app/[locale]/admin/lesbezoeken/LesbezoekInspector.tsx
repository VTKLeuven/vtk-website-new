"use client";

import { useMemo, useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@vtk/ui";
import { Modal } from "@/app/[locale]/admin/admin-table";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import {
  cancelLesbezoekScheduledMailAction,
  deleteLesbezoekAction,
  reviewLesbezoekAction,
  scheduleLesbezoekMailAction,
  sendLesbezoekMailAction,
  sendNowLesbezoekScheduledMailAction,
} from "@/app/actions/lesbezoeken";
import {
  getSchedulePresets,
  LESBEZOEK_STATUSES,
  LESBEZOEK_STATUS_META,
  type SchedulePreset,
} from "@/lib/lesbezoeken";
import {
  DEFAULT_LESBEZOEK_TEMPLATE_ITEMS,
  mailVarsFor,
  nudgeTemplateKey,
  professorTemplateKey,
  renderMailTemplate,
  type LesbezoekTemplateItem,
  type LesbezoekTemplates,
} from "@/lib/lesbezoekenMail";
import { lesbezoekAdminErrors } from "@/lib/lesbezoekenMessages";
import type { VisitView } from "./types";

/**
 * Het detailpaneel van één lesbezoek: overzichtelijk ingedeeld in tabbladen voor
 * details/beoordeling en mailen, zodat het scherm rustig blijft en je direct ziet
 * wat de status is.
 */

type InspectorTab = "details" | "mail";

/** Welk sjabloon-id bij deze status standaard hoort. */
function suggestedTemplateId(visit: VisitView, lang: "nl" | "en"): string {
  if (visit.status === "PENDING") {
    return professorTemplateKey(visit.longVisit, lang);
  }
  if (visit.status === "ASKED") {
    return nudgeTemplateKey(lang);
  }
  if (visit.status === "APPROVED") {
    return "requesterApproved";
  }
  return "requesterDeclined";
}

export function LesbezoekInspector({
  nl,
  visit,
  canManage,
  templates,
  signature,
  onClose,
  onEdit,
}: {
  nl: boolean;
  visit: VisitView;
  canManage: boolean;
  templates: LesbezoekTemplates;
  signature: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const errors = lesbezoekAdminErrors(nl);
  const meta = LESBEZOEK_STATUS_META[visit.status];
  const [activeTab, setActiveTab] = useState<InspectorTab>("details");

  const templateItems =
    templates.items && templates.items.length > 0
      ? templates.items
      : DEFAULT_LESBEZOEK_TEMPLATE_ITEMS;

  return (
    <Modal
      title={`${visit.organisationName} — ${visit.course}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        {/* Header meta badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vtk-blue/10 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="lb-badge" data-tone={meta.tone}>
              {meta[nl ? "nl" : "en"]}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[#5c667f]"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {visit.mailDate[nl ? "nl" : "en"]} · {visit.mailTime}
            </span>
            {visit.longVisit && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {nl ? "Langer dan 5 min" : "Longer than 5 min"}
              </span>
            )}
          </div>

          {/* Tab Selector */}
          {canManage && (
            <div className="inline-flex rounded-full border border-vtk-blue/15 bg-zinc-50 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("details")}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all ${
                  activeTab === "details"
                    ? "bg-white text-vtk-ink shadow-xs"
                    : "text-[#5c667f] hover:text-vtk-ink"
                }`}
              >
                {nl ? "Overzicht & Status" : "Overview & Status"}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mail")}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === "mail"
                    ? "bg-vtk-ink text-white shadow-xs"
                    : "text-[#5c667f] hover:text-vtk-ink"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                {nl ? "Mail versturen" : "Send email"}
              </button>
            </div>
          )}
        </div>

        {/* Waarschuwingen bovenaan */}
        <Warnings nl={nl} visit={visit} />

        {/* Eventuele geplande mails */}
        <ScheduledMailBanner nl={nl} visit={visit} canManage={canManage} />

        {activeTab === "details" ? (
          <div className="space-y-4">
            {/* Gegevens overzicht in 2 kolommen */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-vtk-blue/12 bg-white p-4 shadow-xs">
                <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[#5c667f]">
                  {nl ? "Les & Doelgroep" : "Class & Audience"}
                </h4>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-[#5c667f]">{nl ? "Vak" : "Course"}</dt>
                    <dd className="font-semibold text-vtk-ink">{visit.course}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#5c667f]">{nl ? "Onderwerp" : "Subject"}</dt>
                    <dd className="text-zinc-800">{visit.subject}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#5c667f]">{nl ? "Doelgroep" : "Target group"}</dt>
                    <dd className="mt-0.5">
                      <span className="inline-block rounded-md bg-vtk-blue-soft/80 px-2 py-0.5 text-xs font-medium text-vtk-ink border border-vtk-blue/15">
                        {visit.audience}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-vtk-blue/12 bg-white p-4 shadow-xs">
                <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[#5c667f]">
                  {nl ? "Contactpersonen" : "Contacts"}
                </h4>
                <dl className="space-y-2.5 text-sm">
                  <div>
                    <dt className="text-xs text-[#5c667f]">{nl ? "Docent" : "Lecturer"}</dt>
                    <dd className="font-medium text-vtk-ink">
                      {visit.teacherName ? `${visit.teacherName} · ` : ""}
                      <a
                        className="text-vtk-ink underline underline-offset-2 hover:text-vtk-blue"
                        href={`mailto:${visit.teacherEmail}`}
                      >
                        {visit.teacherEmail}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#5c667f]">{nl ? "Aanvrager" : "Requester"}</dt>
                    <dd className="text-zinc-800">
                      {visit.requesterName ?? "—"}
                      {visit.requesterEmail && (
                        <>
                          {" · "}
                          <a
                            className="text-vtk-ink underline underline-offset-2 hover:text-vtk-blue"
                            href={`mailto:${visit.requesterEmail}`}
                          >
                            {visit.requesterEmail}
                          </a>
                        </>
                      )}
                      {visit.requesterPhone && (
                        <span className="text-[#5c667f]">{` · ${visit.requesterPhone}`}</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Toelichting voor de docent */}
            <div className="rounded-2xl border border-vtk-blue/12 bg-zinc-50/60 p-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#5c667f]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>{nl ? "Toelichting voor de docent" : "Note for the lecturer"}</span>
              </div>
              <p className="whitespace-pre-wrap rounded-xl border border-zinc-200/80 bg-white p-3 text-sm leading-relaxed text-zinc-800">
                {visit.teacherNote}
              </p>
            </div>

            {/* Visuele tijdlijn */}
            <TimelineSteps nl={nl} visit={visit} />

            {/* Antwoord verwerken */}
            {canManage && (
              <section className="rounded-2xl border border-vtk-blue/15 bg-white p-4 shadow-xs">
                <div className="mb-3">
                  <h3 className="font-semibold text-vtk-ink">
                    {nl ? "Antwoord verwerken & Status bijwerken" : "Record outcome & update status"}
                  </h3>
                  <p className="text-xs text-[#5c667f]">
                    {nl
                      ? "Zet hier het antwoord van de docent. Bij een weigering is de reden verplicht: die gaat mee naar de aanvrager."
                      : "Record the lecturer's response. A reason is required when declining: it goes into the reply to the requester."}
                  </p>
                </div>
                <SaveForm
                  action={reviewLesbezoekAction}
                  submitLabel={nl ? "Status opslaan" : "Save status"}
                  savingLabel={nl ? "Bezig…" : "Saving…"}
                  savedMessage={nl ? "Status bijgewerkt." : "Status updated."}
                  errorMessages={errors}
                  fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
                  resetOnSuccess={false}
                  className="space-y-3"
                >
                  <input type="hidden" name="id" value={visit.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor={`status-${visit.id}`}>{nl ? "Status" : "Status"}</Label>
                      <Select id={`status-${visit.id}`} name="status" defaultValue={visit.status}>
                        {LESBEZOEK_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {LESBEZOEK_STATUS_META[status][nl ? "nl" : "en"]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor={`reason-${visit.id}`}>
                        {nl ? "Reden of toelichting bij besluit" : "Reason or remark"}
                      </Label>
                      <Textarea
                        id={`reason-${visit.id}`}
                        name="reviewNote"
                        rows={2}
                        defaultValue={visit.reviewNote ?? ""}
                        placeholder={
                          nl
                            ? "bv. de docent laat dit semester geen lesbezoeken toe"
                            : "e.g. the lecturer does not allow class visits this semester"
                        }
                      />
                    </div>
                  </div>
                </SaveForm>
              </section>
            )}

            {/* Acties onderaan */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vtk-blue/10 pt-3">
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
                  {nl ? "Gegevens bewerken" : "Edit details"}
                </Button>
                {canManage && (
                  <DeleteButton
                    action={deleteLesbezoekAction}
                    fields={{ id: visit.id }}
                    title={nl ? "Lesbezoek verwijderen?" : "Delete classroom visit?"}
                    description={
                      nl
                        ? "De aanvraag verdwijnt volledig uit de kalender en het overzicht. Wil je ze enkel afwijzen, gebruik dan de status: dan blijft ze bewaard met de reden erbij."
                        : "The request disappears completely. To decline it instead, use the status above: it stays on file with the reason."
                    }
                    confirmLabel={nl ? "Verwijderen" : "Delete"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Lesbezoek verwijderd." : "Classroom visit deleted."}
                  >
                    {nl ? "Verwijderen" : "Delete"}
                  </DeleteButton>
                )}
              </div>

              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setActiveTab("mail")}
                  className="gap-1.5"
                >
                  <span>{nl ? "Mail opstellen" : "Compose email"}</span>
                  <span aria-hidden="true">→</span>
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Mail Tab */
          <MailComposer
            nl={nl}
            visit={visit}
            templates={templateItems}
            signature={signature}
            errors={errors}
            onBack={() => setActiveTab("details")}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * Waarschuwingen: bijzonderheden van professor/vak, botsingen op dezelfde dag,
 * notitie bij de organisatie.
 */
function Warnings({ nl, visit }: { nl: boolean; visit: VisitView }) {
  if (
    visit.peculiarities.length === 0 &&
    visit.clashes.length === 0 &&
    !visit.organisationNote
  ) {
    return null;
  }

  return (
    <div className="space-y-2">
      {visit.peculiarities.map((peculiarity) => (
        <div
          key={peculiarity.id}
          className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 leading-relaxed"
        >
          <span className="mt-0.5 shrink-0 text-amber-600 font-bold">⚠️</span>
          <span>
            <strong>{peculiarity.subject}:</strong> {peculiarity.note}
          </span>
        </div>
      ))}
      {visit.clashes.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 leading-relaxed">
          <span className="mt-0.5 shrink-0 text-amber-600 font-bold">⚠️</span>
          <span>
            <strong>{nl ? "Dezelfde docent, zelfde dag:" : "Same lecturer, same day:"}</strong>{" "}
            {visit.clashes
              .map((clash) => `${clash.organisation} (${clash.course}, ${clash.time})`)
              .join(" · ")}
          </span>
        </div>
      )}
      {visit.organisationNote && (
        <div className="flex items-start gap-2.5 rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/50 p-3 text-xs text-vtk-ink leading-relaxed">
          <span className="mt-0.5 shrink-0 font-bold">ℹ️</span>
          <span>
            <strong>{visit.organisationName}:</strong> {visit.organisationNote}
          </span>
        </div>
      )}
    </div>
  );
}

/** Visuele weergave van ingeplande mails met actieknoppen voor annuleren of direct verzenden. */
function ScheduledMailBanner({
  nl,
  visit,
  canManage,
}: {
  nl: boolean;
  visit: VisitView;
  canManage: boolean;
}) {
  if (!visit.scheduledMails || visit.scheduledMails.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {visit.scheduledMails.map((mail) => (
        <div
          key={mail.id}
          className="rounded-2xl border border-indigo-200 bg-indigo-50/90 p-4 shadow-xs space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold shadow-xs">
                🕒
              </span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                  {nl ? "Mail ingepland voor verzending" : "Email scheduled for delivery"}
                </h4>
                <p className="text-xs text-indigo-700">
                  {nl ? "Verzending gepland op: " : "Scheduled for: "}
                  <strong className="font-semibold text-indigo-950">{mail.sendAtFormatted}</strong>
                </p>
              </div>
            </div>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 border border-indigo-200">
              {mail.kind === "professor"
                ? nl
                  ? "Vraag aan docent"
                  : "Ask lecturer"
                : mail.kind === "nudge"
                  ? nl
                    ? "Herinnering"
                    : "Reminder"
                  : nl
                    ? "Terugkoppeling aanvrager"
                    : "Reply requester"}
            </span>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-white/90 p-3 text-xs space-y-1 text-zinc-800">
            <div>
              <span className="font-semibold text-[#5c667f]">{nl ? "Ontvanger: " : "Recipient: "}</span>
              <span className="font-mono text-zinc-900">{mail.to}</span>
              {mail.cc && <span className="text-[#5c667f]"> (CC: {mail.cc})</span>}
            </div>
            <div>
              <span className="font-semibold text-[#5c667f]">{nl ? "Onderwerp: " : "Subject: "}</span>
              <span className="font-medium text-zinc-900">{mail.subject}</span>
            </div>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-medium text-indigo-700 hover:text-indigo-900">
                {nl ? "Voorvertoning van bericht tonen" : "Show message preview"}
              </summary>
              <p className="mt-1.5 whitespace-pre-wrap font-mono text-[12px] text-zinc-700 bg-zinc-50 p-2.5 rounded-lg border border-zinc-200/60 leading-relaxed max-h-40 overflow-y-auto">
                {mail.body}
              </p>
            </details>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <form action={cancelLesbezoekScheduledMailAction}>
                <input type="hidden" name="id" value={mail.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="text-red-700 hover:bg-red-50 hover:text-red-800 text-xs"
                >
                  {nl ? "Planning annuleren" : "Cancel schedule"}
                </Button>
              </form>
              <form action={sendNowLesbezoekScheduledMailAction}>
                <input type="hidden" name="id" value={mail.id} />
                <Button
                  type="submit"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                >
                  {nl ? "Nu direct verzenden" : "Send immediately now"}
                </Button>
              </form>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Visuele tijdlijn met duidelijke stappen. */
function TimelineSteps({ nl, visit }: { nl: boolean; visit: VisitView }) {
  const fmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const scheduledProfMail = visit.scheduledMails?.find((m) => m.kind === "professor");
  const scheduledNudgeMail = visit.scheduledMails?.find((m) => m.kind === "nudge");
  const scheduledReqMail = visit.scheduledMails?.find((m) => m.kind === "requester");

  const steps = [
    {
      label: nl ? "Aangevraagd" : "Requested",
      done: true,
      time: visit.createdAt ? fmt.format(new Date(visit.createdAt)) : null,
      scheduled: false,
    },
    {
      label: nl ? "Vraag naar docent" : "Asked lecturer",
      done: Boolean(visit.professorMailedAt),
      time: visit.professorMailedAt
        ? fmt.format(new Date(visit.professorMailedAt))
        : scheduledProfMail
          ? `🕒 ${nl ? "Gepland" : "Scheduled"}: ${scheduledProfMail.sendAtShort}`
          : null,
      scheduled: Boolean(!visit.professorMailedAt && scheduledProfMail),
    },
    {
      label: nl ? "Herinnering" : "Reminder",
      done: Boolean(visit.professorNudgedAt),
      time: visit.professorNudgedAt
        ? fmt.format(new Date(visit.professorNudgedAt))
        : scheduledNudgeMail
          ? `🕒 ${nl ? "Gepland" : "Scheduled"}: ${scheduledNudgeMail.sendAtShort}`
          : null,
      optional: true,
      scheduled: Boolean(!visit.professorNudgedAt && scheduledNudgeMail),
    },
    {
      label: nl ? "Aanvrager verwittigd" : "Requester notified",
      done: Boolean(visit.requesterNotifiedAt),
      time: visit.requesterNotifiedAt
        ? fmt.format(new Date(visit.requesterNotifiedAt))
        : scheduledReqMail
          ? `🕒 ${nl ? "Gepland" : "Scheduled"}: ${scheduledReqMail.sendAtShort}`
          : null,
      scheduled: Boolean(!visit.requesterNotifiedAt && scheduledReqMail),
    },
  ];

  return (
    <div className="rounded-2xl border border-vtk-blue/12 bg-white p-4 shadow-xs">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#5c667f]">
        {nl ? "Statusverloop & Tijdlijn" : "Timeline & Progress"}
      </h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step, idx) => (
          <div
            key={idx}
            className={`rounded-xl border p-2.5 transition-all ${
              step.done
                ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                : step.scheduled
                  ? "border-indigo-300 bg-indigo-50/80 text-indigo-950"
                  : "border-zinc-200/70 bg-zinc-50/50 text-zinc-500"
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  step.done
                    ? "bg-emerald-600 text-white"
                    : step.scheduled
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-200 text-zinc-500 font-normal"
                }`}
              >
                {step.done ? "✓" : step.scheduled ? "🕒" : idx + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </div>
            <div className="mt-1 text-[11px] text-[#5c667f] truncate">
              {step.time ?? (nl ? "nog niet" : "not yet")}
            </div>
          </div>
        ))}
      </div>

      {visit.reviewedBy && (
        <div className="mt-2.5 text-right text-xs text-[#5c667f]">
          {nl ? "Verwerkt door" : "Handled by"}:{" "}
          <strong className="text-vtk-ink">{visit.reviewedBy}</strong>
          {visit.reviewedAt ? ` (${fmt.format(new Date(visit.reviewedAt))})` : ""}
        </div>
      )}
    </div>
  );
}

/** De mailopsteller met sjabloonselectie, uitgesteld verzenden/plannen en live voorvertoning. */
function MailComposer({
  nl,
  visit,
  templates,
  signature,
  errors,
  onBack,
}: {
  nl: boolean;
  visit: VisitView;
  templates: LesbezoekTemplateItem[];
  signature: string;
  errors: Record<string, string>;
  onBack: () => void;
}) {
  const [lang, setLang] = useState<"nl" | "en">(visit.teacherLocale);
  const defaultId = useMemo(
    () => suggestedTemplateId(visit, lang),
    [visit, lang],
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    const exists = templates.some((t) => t.id === defaultId);
    return exists ? defaultId : templates[0]?.id ?? "professorShortNl";
  });

  const selectedTemplate = useMemo(() => {
    return (
      templates.find((t) => t.id === selectedId) ??
      templates[0] ?? {
        id: "default",
        name: "Sjabloon",
        subject: "",
        body: "",
        category: "professor",
        lang: "nl",
      }
    );
  }, [templates, selectedId]);

  // Afleiden wie de ontvanger is op basis van de sjablooncategorie
  const isRequester =
    selectedTemplate.category === "requester" ||
    selectedId.toLowerCase().includes("requester");
  const recipient = isRequester ? visit.requesterEmail : visit.teacherEmail;

  const rendered = useMemo(() => {
    const vars = mailVarsFor(
      {
        teacherName: visit.teacherName,
        organisationName: visit.organisationName,
        requesterName: visit.requesterName,
        subject: visit.subject,
        course: visit.course,
        audience: visit.audience,
        teacherNote: visit.teacherNote,
        reviewNote: visit.reviewNote,
        mailDate: visit.mailDate,
        mailTime: visit.mailTime,
      },
      lang,
      signature,
    );

    return renderMailTemplate(selectedTemplate, vars);
  }, [selectedTemplate, lang, signature, visit]);

  const kind =
    selectedTemplate.category === "nudge" || selectedId.toLowerCase().includes("nudge")
      ? "nudge"
      : isRequester
        ? "requester"
        : "professor";

  // Planningsmodus: "scheduled" vs "instant"
  const presets = useMemo(() => getSchedulePresets(new Date()), []);
  const [sendMode, setSendMode] = useState<"scheduled" | "instant">("scheduled");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(presets[0]?.id ?? "tomorrow_0800");

  const [customDate, setCustomDate] = useState<string>(() => presets[0]?.dateStr ?? "");
  const [customTime, setCustomTime] = useState<string>(() => presets[0]?.timeStr ?? "08:00");

  const activeSendDate = selectedPresetId === "custom"
    ? customDate
    : (presets.find((p) => p.id === selectedPresetId)?.dateStr ?? customDate);
  const activeSendTime = selectedPresetId === "custom"
    ? customTime
    : (presets.find((p) => p.id === selectedPresetId)?.timeStr ?? customTime);

  const activePreset = presets.find((p) => p.id === selectedPresetId);
  const activeMomentLabel = activePreset
    ? (nl ? activePreset.labelNl : activePreset.labelEn)
    : `${activeSendDate} ${activeSendTime}`;

  return (
    <section className="rounded-2xl border border-vtk-blue/15 bg-white p-4 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-vtk-blue/10 pb-3">
        <div>
          <h3 className="font-semibold text-vtk-ink">{nl ? "Mail opstellen & Plannen" : "Compose & Schedule email"}</h3>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "Kies een sjabloon, pas de tekst aan en kies wanneer de mail verzonden moet worden."
              : "Pick a template, edit the text and choose when the email should be sent."}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          ← {nl ? "Terug naar overzicht" : "Back to overview"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label htmlFor={`tpl-picker-${visit.id}`}>{nl ? "Kies sjabloon" : "Choose template"}</Label>
          <Select
            id={`tpl-picker-${visit.id}`}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`lang-picker-${visit.id}`}>{nl ? "Taal / Datumformaat" : "Language"}</Label>
          <Select
            id={`lang-picker-${visit.id}`}
            value={lang}
            onChange={(e) => setLang(e.target.value as "nl" | "en")}
          >
            <option value="nl">Nederlands</option>
            <option value="en">English</option>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-vtk-blue/10 bg-zinc-50 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-[#5c667f]">{nl ? "Ontvanger: " : "Recipient: "}</span>
          <span className="font-mono font-medium text-vtk-ink">
            {recipient || (nl ? "(geen e-mailadres beschikbaar)" : "(no email available)")}
          </span>
          {isRequester && visit.organisationNote && (
            <span className="text-[#5c667f]"> · {nl ? "CC organisatie" : "CC organisation"}</span>
          )}
        </div>
        <div className="text-[#5c667f]">
          {nl ? "Type actie: " : "Action: "}
          <span className="font-semibold text-vtk-ink">
            {kind === "professor"
              ? nl
                ? "Vraag aan docent"
                : "Ask lecturer"
              : kind === "nudge"
                ? nl
                  ? "Herinnering"
                  : "Reminder"
                : nl
                  ? "Terugkoppeling aanvrager"
                  : "Reply requester"}
          </span>
        </div>
      </div>

      {/* Verzendtijdstip / Planningsopties */}
      <div className="rounded-2xl border border-vtk-blue/15 bg-zinc-50/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-[#5c667f] mb-0">
            {nl ? "Verzendtijdstip" : "Sending time"}
          </Label>
          <div className="inline-flex rounded-full border border-vtk-blue/15 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setSendMode("scheduled")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
                sendMode === "scheduled"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-[#5c667f] hover:text-vtk-ink"
              }`}
            >
              <span>🕒</span>
              <span>{nl ? "Inplannen (Aanbevolen)" : "Schedule (Recommended)"}</span>
            </button>
            <button
              type="button"
              onClick={() => setSendMode("instant")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all flex items-center gap-1.5 ${
                sendMode === "instant"
                  ? "bg-vtk-ink text-white shadow-xs"
                  : "text-[#5c667f] hover:text-vtk-ink"
              }`}
            >
              <span>⚡</span>
              <span>{nl ? "Direct versturen" : "Send immediately"}</span>
            </button>
          </div>
        </div>

        {sendMode === "scheduled" ? (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-[#5c667f]">
              {nl
                ? "Mails naar professoren worden bij voorkeur tijdens kantooruren verzonden. Kies een preset of stel zelf een moment in."
                : "Emails to lecturers are preferably sent during working hours. Choose a preset or specify a custom time."}
            </p>

            <div className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const active = selectedPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPresetId(p.id)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold shadow-xs"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    {nl ? p.labelNl : p.labelEn}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedPresetId("custom")}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                  selectedPresetId === "custom"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold shadow-xs"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {nl ? "Aangepast moment…" : "Custom time…"}
              </button>
            </div>

            {selectedPresetId === "custom" && (
              <div className="grid gap-3 pt-1 sm:grid-cols-2 rounded-xl border border-indigo-100 bg-white p-3">
                <div>
                  <Label htmlFor={`send-date-${visit.id}`}>{nl ? "Verzenddatum" : "Send date"}</Label>
                  <Input
                    id={`send-date-${visit.id}`}
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor={`send-time-${visit.id}`}>{nl ? "Verzenduurtijd (Brussel-tijd)" : "Send time"}</Label>
                  <Input
                    id={`send-time-${visit.id}`}
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200 p-2.5 rounded-xl">
            {nl
              ? "⚠️ De mail wordt meteen bij het klikken verstuurd naar de ontvanger."
              : "⚠️ The email will be delivered immediately upon clicking send."}
          </p>
        )}
      </div>

      {recipient ? (
        sendMode === "scheduled" ? (
          <SaveForm
            key={`${selectedId}-${lang}-scheduled-${selectedPresetId}-${activeSendDate}-${activeSendTime}`}
            action={scheduleLesbezoekMailAction}
            submitLabel={nl ? `Inplannen voor ${activeMomentLabel}` : `Schedule for ${activeMomentLabel}`}
            savingLabel={nl ? "Inplannen…" : "Scheduling…"}
            savedMessage={nl ? "Mail ingepland." : "Email scheduled."}
            errorMessages={errors}
            fallbackErrorMessage={nl ? "Niet ingepland." : "Not scheduled."}
            resetOnSuccess={false}
            className="space-y-3"
          >
            <input type="hidden" name="id" value={visit.id} />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="sendAtDate" value={activeSendDate} />
            <input type="hidden" name="sendAtTime" value={activeSendTime} />
            <div>
              <Label htmlFor={`subject-${visit.id}`}>{nl ? "Onderwerp" : "Subject"}</Label>
              <Input id={`subject-${visit.id}`} name="subject" defaultValue={rendered.subject} required />
            </div>
            <div>
              <Label htmlFor={`body-${visit.id}`}>{nl ? "Bericht" : "Message"}</Label>
              <Textarea
                id={`body-${visit.id}`}
                name="body"
                rows={11}
                defaultValue={rendered.body}
                className="font-mono text-[13px] leading-relaxed"
                required
              />
            </div>
          </SaveForm>
        ) : (
          <SaveForm
            key={`${selectedId}-${lang}-instant`}
            action={sendLesbezoekMailAction}
            submitLabel={nl ? `Direct versturen naar ${recipient}` : `Send immediately to ${recipient}`}
            savingLabel={nl ? "Versturen…" : "Sending…"}
            savedMessage={nl ? "Mail verstuurd." : "Email sent."}
            errorMessages={errors}
            fallbackErrorMessage={nl ? "Niet verstuurd." : "Not sent."}
            resetOnSuccess={false}
            className="space-y-3"
          >
            <input type="hidden" name="id" value={visit.id} />
            <input type="hidden" name="kind" value={kind} />
            <div>
              <Label htmlFor={`subject-${visit.id}`}>{nl ? "Onderwerp" : "Subject"}</Label>
              <Input id={`subject-${visit.id}`} name="subject" defaultValue={rendered.subject} required />
            </div>
            <div>
              <Label htmlFor={`body-${visit.id}`}>{nl ? "Bericht" : "Message"}</Label>
              <Textarea
                id={`body-${visit.id}`}
                name="body"
                rows={11}
                defaultValue={rendered.body}
                className="font-mono text-[13px] leading-relaxed"
                required
              />
            </div>
          </SaveForm>
        )
      ) : (
        <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-800">
          {nl
            ? "Er staat geen e-mailadres bij deze aanvraag voor deze ontvanger, dus er kan geen mail worden verstuurd."
            : "No email address is available for this recipient, so no email can be sent."}
        </p>
      )}
    </section>
  );
}

