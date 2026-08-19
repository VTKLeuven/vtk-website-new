"use client";

import { useMemo, useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@vtk/ui";
import { Modal } from "@/app/[locale]/admin/admin-table";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import {
  deleteLesbezoekAction,
  reviewLesbezoekAction,
  sendLesbezoekMailAction,
} from "@/app/actions/lesbezoeken";
import {
  LESBEZOEK_STATUSES,
  LESBEZOEK_STATUS_META,
  type LesbezoekStatusCode,
} from "@/lib/lesbezoeken";
import {
  mailVarsFor,
  nudgeTemplateKey,
  professorTemplateKey,
  renderMailTemplate,
  type LesbezoekTemplates,
} from "@/lib/lesbezoekenMail";
import { lesbezoekAdminErrors } from "@/lib/lesbezoekenMessages";
import type { VisitView } from "./types";

/**
 * Het detailpaneel van één lesbezoek: alles wat je nodig hebt om te beslissen, en
 * de twee dingen die op die beslissing volgen (de status bijwerken en een mail
 * versturen).
 *
 * De waarschuwingen staan bovenaan en niet onderaan. Dat is het hele punt van dit
 * scherm: in de oude werkwijze stonden de bijzonderheden van een professor, de
 * dubbele aanvragen en de reputatie van een organisatie in drie andere tabbladen,
 * en wie ze vergat te openen mailde een professor die nooit lesbezoeken toelaat.
 */

type MailKind = "professor" | "nudge" | "requester";

/** Welke mail er bij deze status het meest voor de hand ligt. */
function suggestedKind(status: LesbezoekStatusCode): MailKind {
  if (status === "PENDING") return "professor";
  if (status === "ASKED") return "nudge";
  // Beslist: dan is de aanvrager aan de beurt.
  return "requester";
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

  return (
    <Modal
      title={`${visit.organisationName} — ${visit.course}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="lb-badge" data-tone={meta.tone}>
            {meta[nl ? "nl" : "en"]}
          </span>
          <span className="text-sm text-[#5c667f]">
            {visit.mailDate[nl ? "nl" : "en"]} · {visit.mailTime}
          </span>
          {visit.longVisit && (
            <span className="rounded-full border border-vtk-blue/15 px-2 py-0.5 text-xs font-semibold text-[#5c667f]">
              {nl ? "Langer dan 5 min" : "Longer than 5 min"}
            </span>
          )}
        </div>

        <Warnings nl={nl} visit={visit} />

        <dl className="lb-def">
          <dt>{nl ? "Doelgroep" : "Target group"}</dt>
          <dd>{visit.audience}</dd>
          <dt>{nl ? "Vak" : "Course"}</dt>
          <dd>{visit.course}</dd>
          <dt>{nl ? "Onderwerp" : "Subject"}</dt>
          <dd>{visit.subject}</dd>
          <dt>{nl ? "Docent" : "Lecturer"}</dt>
          <dd>
            {visit.teacherName ? `${visit.teacherName} · ` : ""}
            <a className="underline underline-offset-2" href={`mailto:${visit.teacherEmail}`}>
              {visit.teacherEmail}
            </a>
          </dd>
          <dt>{nl ? "Aanvrager" : "Requester"}</dt>
          <dd>
            {visit.requesterName ?? "—"}
            {visit.requesterEmail ? (
              <>
                {" · "}
                <a className="underline underline-offset-2" href={`mailto:${visit.requesterEmail}`}>
                  {visit.requesterEmail}
                </a>
              </>
            ) : null}
            {visit.requesterPhone ? ` · ${visit.requesterPhone}` : ""}
          </dd>
        </dl>

        <div>
          {/* Een `<Label>` zonder veld eronder is geen label maar een kopje; een
              screenreader kondigt het anders aan als het bijschrift van een
              invulveld dat er niet is. */}
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
            {nl ? "Toelichting voor de docent" : "Note for the lecturer"}
          </p>
          <p className="lb-quote">{visit.teacherNote}</p>
        </div>

        <Timeline nl={nl} visit={visit} />

        {canManage && (
          <>
            <section className="rounded-2xl border border-vtk-blue/15 p-4">
              <h3 className="mb-1 font-semibold text-vtk-ink">
                {nl ? "Antwoord verwerken" : "Record the outcome"}
              </h3>
              <p className="mb-3 text-sm text-[#5c667f]">
                {nl
                  ? "De docent antwoordt per mail; zet hier wat hij zei. Bij een weigering is de reden verplicht: die gaat mee in de terugkoppeling naar de aanvrager."
                  : "The lecturer replies by email; record their answer here. A reason is required when declining: it goes into the reply to the requester."}
              </p>
              <SaveForm
                action={reviewLesbezoekAction}
                submitLabel={nl ? "Status bijwerken" : "Update status"}
                savingLabel={nl ? "Bezig…" : "Saving…"}
                savedMessage={nl ? "Status bijgewerkt." : "Status updated."}
                errorMessages={errors}
                fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
                resetOnSuccess={false}
                className="space-y-3"
              >
                <input type="hidden" name="id" value={visit.id} />
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
                <div>
                  <Label htmlFor={`reason-${visit.id}`}>
                    {nl ? "Reden of opmerking" : "Reason or remark"}
                  </Label>
                  <Textarea
                    id={`reason-${visit.id}`}
                    name="reviewNote"
                    rows={3}
                    defaultValue={visit.reviewNote ?? ""}
                    placeholder={
                      nl
                        ? "de docent laat dit semester geen lesbezoeken toe"
                        : "the lecturer does not allow class visits this semester"
                    }
                  />
                </div>
              </SaveForm>
            </section>

            <MailComposer
              nl={nl}
              visit={visit}
              templates={templates}
              signature={signature}
              errors={errors}
            />

            <div className="flex items-center justify-between gap-3 border-t border-vtk-blue/10 pt-3">
              <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
                {nl ? "Gegevens bewerken" : "Edit details"}
              </Button>
              <DeleteButton
                action={deleteLesbezoekAction}
                fields={{ id: visit.id }}
                title={nl ? "Lesbezoek verwijderen?" : "Delete classroom visit?"}
                description={
                  nl
                    ? "De aanvraag verdwijnt volledig, ook uit de kalender en het overzicht per organisatie. Wil je ze enkel afwijzen, gebruik dan hierboven de status: dan blijft ze bewaard met de reden erbij."
                    : "The request disappears completely, including from the calendar and the per-organisation overview. To decline it instead, use the status above: it then stays on file with the reason."
                }
                confirmLabel={nl ? "Verwijderen" : "Delete"}
                cancelLabel={nl ? "Annuleren" : "Cancel"}
                successMessage={nl ? "Lesbezoek verwijderd." : "Classroom visit deleted."}
              >
                {nl ? "Lesbezoek verwijderen" : "Delete classroom visit"}
              </DeleteButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * Wat je moet weten vóór je iets doorstuurt: de bijzonderheden van deze professor
 * of dit vak, andere aanvragen bij dezelfde docent op dezelfde dag, en de notitie
 * bij de organisatie.
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
        <p key={peculiarity.id} className="lb-warn">
          <span>
            <strong>{peculiarity.subject}:</strong> {peculiarity.note}
          </span>
        </p>
      ))}
      {visit.clashes.length > 0 && (
        <p className="lb-warn">
          <span>
            <strong>{nl ? "Dezelfde docent, zelfde dag:" : "Same lecturer, same day:"}</strong>{" "}
            {visit.clashes
              .map((clash) => `${clash.organisation} (${clash.course}, ${clash.time})`)
              .join(" · ")}
          </span>
        </p>
      )}
      {visit.organisationNote && (
        <p className="lb-warn">
          <span>
            <strong>{visit.organisationName}:</strong> {visit.organisationNote}
          </span>
        </p>
      )}
    </div>
  );
}

/** Wat er al gebeurd is. Vervangt de hulpkolommen "por mail gestuurd?" en "laten weten?". */
function Timeline({ nl, visit }: { nl: boolean; visit: VisitView }) {
  const fmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const rows: [string, string | null][] = [
    [nl ? "Aangevraagd" : "Requested", visit.createdAt],
    [nl ? "Vraag naar de docent" : "Asked the lecturer", visit.professorMailedAt],
    [nl ? "Herinnering gestuurd" : "Reminder sent", visit.professorNudgedAt],
    [nl ? "Aanvrager verwittigd" : "Requester informed", visit.requesterNotifiedAt],
  ];

  return (
    <dl className="lb-def">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className={value ? "" : "text-[#5c667f]"}>
            {value ? fmt.format(new Date(value)) : nl ? "nog niet" : "not yet"}
          </dd>
        </div>
      ))}
      {visit.reviewedBy && (
        <>
          <dt>{nl ? "Verwerkt door" : "Handled by"}</dt>
          <dd>
            {visit.reviewedBy}
            {visit.reviewedAt ? ` · ${fmt.format(new Date(visit.reviewedAt))}` : ""}
          </dd>
        </>
      )}
    </dl>
  );
}

/**
 * De mailopsteller: het sjabloon wordt ingevuld en in een bewerkbaar veld gezet,
 * zodat wie verstuurt hem eerst leest.
 *
 * Dat is bewust een stap trager dan de mailmerge die dit vervangt. Die stuurde
 * een rij tegelijk naar een professor zonder dat iemand de tekst nog zag, en een
 * fout in het sjabloon vertrok dan honderd keer.
 */
function MailComposer({
  nl,
  visit,
  templates,
  signature,
  errors,
}: {
  nl: boolean;
  visit: VisitView;
  templates: LesbezoekTemplates;
  signature: string;
  errors: Record<string, string>;
}) {
  const suggested = suggestedKind(visit.status);
  const [kind, setKind] = useState<MailKind>(suggested);
  const [lang, setLang] = useState<"nl" | "en">(visit.teacherLocale);

  // De keuze volgt de status zodra die verandert. Zonder dit blijft het paneel na
  // een goedkeuring op "herinnering aan de docent" staan, want de beginwaarde van
  // `useState` loopt maar één keer en het detailpaneel blijft ondertussen open.
  // Een eigen keuze blijft wel staan tot de status opnieuw wijzigt.
  const [suggestedFor, setSuggestedFor] = useState<LesbezoekStatusCode>(visit.status);
  if (suggestedFor !== visit.status) {
    setSuggestedFor(visit.status);
    setKind(suggested);
  }

  const template = useMemo(() => {
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
      kind === "requester" ? "nl" : lang,
      signature,
    );

    const key =
      kind === "professor"
        ? professorTemplateKey(visit.longVisit, lang)
        : kind === "nudge"
          ? nudgeTemplateKey(lang)
          : visit.status === "APPROVED"
            ? "requesterApproved"
            : "requesterDeclined";

    return renderMailTemplate(templates[key], vars);
  }, [kind, lang, signature, templates, visit]);

  const recipient = kind === "requester" ? visit.requesterEmail : visit.teacherEmail;

  return (
    <section className="rounded-2xl border border-vtk-blue/15 p-4">
      <h3 className="mb-1 font-semibold text-vtk-ink">{nl ? "Mail versturen" : "Send an email"}</h3>
      <p className="mb-3 text-sm text-[#5c667f]">
        {nl
          ? "Het sjabloon staat ingevuld klaar. Lees hem na en pas aan waar nodig; wat hier staat is wat er vertrekt."
          : "The template is filled in for you. Read it over and adjust where needed; what you see here is what goes out."}
      </p>

      <div className="mb-3 flex flex-wrap gap-3">
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor={`kind-${visit.id}`}>{nl ? "Welke mail" : "Which email"}</Label>
          <Select
            id={`kind-${visit.id}`}
            value={kind}
            onChange={(event) => setKind(event.target.value as MailKind)}
          >
            <option value="professor">
              {nl ? "Vraag aan de docent" : "Request to the lecturer"}
            </option>
            <option value="nudge">{nl ? "Herinnering aan de docent" : "Reminder to the lecturer"}</option>
            <option value="requester">
              {nl ? "Terugkoppeling naar de aanvrager" : "Reply to the requester"}
            </option>
          </Select>
        </div>
        {kind !== "requester" && (
          <div className="w-40">
            <Label htmlFor={`lang-${visit.id}`}>{nl ? "Taal" : "Language"}</Label>
            <Select
              id={`lang-${visit.id}`}
              value={lang}
              onChange={(event) => setLang(event.target.value as "nl" | "en")}
            >
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
            </Select>
          </div>
        )}
      </div>

      {recipient ? (
        <SaveForm
          // De sleutel dwingt een verse render van de niet-gecontroleerde velden
          // wanneer je van sjabloon of taal wisselt; anders blijft de vorige tekst
          // staan en verstuur je de Engelse mail met de Nederlandse aanhef.
          key={`${kind}-${lang}`}
          action={sendLesbezoekMailAction}
          submitLabel={nl ? `Versturen naar ${recipient}` : `Send to ${recipient}`}
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
            <Input id={`subject-${visit.id}`} name="subject" defaultValue={template.subject} />
          </div>
          <div>
            <Label htmlFor={`body-${visit.id}`}>{nl ? "Bericht" : "Message"}</Label>
            <Textarea
              id={`body-${visit.id}`}
              name="body"
              rows={12}
              defaultValue={template.body}
              className="font-mono text-[13px]"
            />
          </div>
        </SaveForm>
      ) : (
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Er staat geen adres van de aanvrager bij deze aanvraag, dus er valt niets terug te koppelen."
            : "This request has no requester address, so there is nobody to reply to."}
        </p>
      )}
    </section>
  );
}
