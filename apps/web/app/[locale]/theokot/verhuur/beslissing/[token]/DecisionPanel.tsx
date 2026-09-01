"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { MailPreview } from "@/components/admin/MailPreview";
import { SAVE_IDLE } from "@/lib/saveState";
import { decideRentalByTokenAction } from "@/app/actions/theokotVerhuur";
import { rentalAdminErrors } from "@/lib/theokotVerhuurMessages";
import type { RentalDecisionPreview } from "@/app/actions/theokotVerhuur";

/**
 * Het scherm achter "Goedkeuren" en "Weigeren" in de meldingsmail.
 *
 * Twee knoppen, en het verschil ertussen is het hele punt van dit scherm: de
 * ene zet de status én mailt de aanvrager, de andere zet enkel de status. Dat
 * tweede geval is echt: een verhuur die al aan de toog afgesproken werd, of een
 * aanvraag waar iemand liever zelf een mail over schrijft.
 *
 * De mail staat er daarom volledig bij, bewerkbaar en met een voorbeeld eronder.
 * Wie op een knop in een mail klikt, hoort te zien wat er in zijn naam vertrekt
 * voor het vertrekt.
 */

type Ok = Extract<RentalDecisionPreview, { status: "ok" }>;

export function DecisionPanel({
  nl,
  token,
  preview,
  senderLabel,
  adminHref,
}: {
  nl: boolean;
  token: string;
  preview: Ok;
  senderLabel: string;
  adminHref: string;
}) {
  const approve = preview.action === "APPROVE";

  // Het sjabloon dat bij deze knop hoort staat voorgeselecteerd, maar je mag een
  // ander kiezen: een weigering met een andere reden, of de Engelse versie.
  const [templateId, setTemplateId] = useState(preview.defaultTemplateId ?? "");
  const template =
    preview.templates.find((item) => item.id === templateId) ?? preview.templates[0] ?? null;

  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [attach, setAttach] = useState((template?.attachContract ?? false) && preview.contractReady);
  const [done, setDone] = useState<"sent" | "status" | null>(null);

  // Tijdens het renderen en niet in een effect: React tekent dan meteen met de
  // nieuwe tekst, in plaats van eerst de oude te tonen en er overheen te schrijven.
  const [appliedId, setAppliedId] = useState(template?.id ?? "");
  if (template && template.id !== appliedId) {
    setAppliedId(template.id);
    setSubject(template.subject);
    setBody(template.body);
    setAttach(template.attachContract && preview.contractReady);
  }

  const [state, formAction, pending] = useActionState(decideRentalByTokenAction, SAVE_IDLE);
  const showToast = useToast();
  const handled = useRef<number | null>(null);
  const errors = rentalAdminErrors(nl);
  const wanted = useRef<"sent" | "status">("sent");

  useEffect(() => {
    if (state.status === "idle" || handled.current === state.nonce) return;
    handled.current = state.nonce;
    if (state.status === "success") {
      setDone(wanted.current);
    } else {
      showToast({
        message: errors[state.code] ?? state.detail ?? (nl ? "Er ging iets mis." : "Something went wrong."),
        variant: "error",
        duration: 0,
      });
    }
  }, [state, showToast, errors, nl]);

  function submit(mode: "send" | "status") {
    wanted.current = mode === "send" ? "sent" : "status";
    const data = new FormData();
    data.set("token", token);
    data.set("mode", mode);
    if (mode === "send") {
      data.set("subject", subject);
      data.set("body", body);
      data.set("templateId", template?.id ?? "");
      if (attach) data.set("attachContract", "on");
    }
    startTransition(() => formAction(data));
  }

  const statusWord = approve
    ? nl
      ? "Goedgekeurd"
      : "Approved"
    : nl
      ? "Geweigerd"
      : "Denied";

  if (done) {
    return (
      <div className="space-y-4">
        <p className="tv-notice" data-tone={approve ? "ok" : "no"} role="status">
          <span>
            {done === "sent"
              ? nl
                ? `De aanvraag staat op "${statusWord}" en de mail is naar ${preview.rental.email} vertrokken.`
                : `The request is now "${statusWord}" and the email went out to ${preview.rental.email}.`
              : nl
                ? `De aanvraag staat op "${statusWord}". Er is geen mail verstuurd.`
                : `The request is now "${statusWord}". No email was sent.`}
          </span>
        </p>
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Deze link werkt niet meer; verdere wijzigingen doe je in het beheer."
            : "This link no longer works; make further changes in the admin."}{" "}
          <a className="vtk-link" href={adminHref}>
            {nl ? "Naar het beheer" : "Go to the admin"}
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {preview.rental.alreadyDecided && (
        <p className="tv-notice" role="status">
          <span>
            {nl
              ? `Let op: deze aanvraag staat al op "${preview.rental.statusLabel.nl}". Ga je verder, dan overschrijf je die beslissing.`
              : `Careful: this request is already "${preview.rental.statusLabel.en}". Continuing overwrites that decision.`}
          </span>
        </p>
      )}

      {preview.clashes.length > 0 && (
        <div className="tv-notice">
          <span>
            <strong>{nl ? "Dit botst met een andere verhuur:" : "This clashes with another rental:"}</strong>
            <br />
            {preview.clashes.join(" · ")}
          </span>
        </div>
      )}

      <dl className="tv-def">
        <dt>{nl ? "Verantwoordelijke" : "Person in charge"}</dt>
        <dd>
          {preview.rental.responsibleName} · {preview.rental.email}
          {preview.rental.phone ? ` · ${preview.rental.phone}` : ""}
        </dd>
        <dt>{nl ? "Wanneer" : "When"}</dt>
        <dd>
          {preview.rental.startDate}, {preview.rental.startTime}–{preview.rental.endTime}
        </dd>
        <dt>{nl ? "Activiteit" : "Activity"}</dt>
        <dd>{preview.rental.purpose}</dd>
        <dt>{nl ? "Aanwezigen" : "People"}</dt>
        <dd>{preview.rental.attendees ?? "—"}</dd>
        <dt>{nl ? "Waarborg" : "Deposit"}</dt>
        <dd>{preview.rental.depositLabel}</dd>
        <dt>{nl ? "Huurder" : "Renter"}</dt>
        <dd>
          {preview.rental.renterType === "INTERNAL"
            ? nl
              ? "Post of werkgroep van VTK"
              : "Post or work group of VTK"
            : nl
              ? "Extern"
              : "External"}
        </dd>
      </dl>

      {preview.rental.remarks?.trim() && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
            {nl ? "Opmerkingen" : "Remarks"}
          </p>
          <p className="tv-quote">{preview.rental.remarks}</p>
        </div>
      )}

      <div className="tv-section">
        <div className="tv-section-head">
          <h3>{nl ? "De mail naar de aanvrager" : "The email to the requester"}</h3>
          <span className="tv-section-note">
            {nl ? "Je kan hem hier nog aanpassen." : "You can still edit it here."}
          </span>
        </div>

        <div>
          <Label htmlFor="tv-template">{nl ? "Sjabloon" : "Template"}</Label>
          <Select
            id="tv-template"
            value={template?.id ?? ""}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {preview.templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="tv-subject">{nl ? "Onderwerp" : "Subject"}</Label>
          <Input
            id="tv-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="tv-body">{nl ? "Bericht" : "Message"}</Label>
          <Textarea
            id="tv-body"
            rows={12}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="font-mono text-[13px] leading-relaxed"
          />
        </div>

        {template?.attachContract && (
          <label className="tv-check">
            <input
              type="checkbox"
              checked={attach}
              disabled={!preview.contractReady}
              onChange={(event) => setAttach(event.target.checked)}
            />
            <span>
              {nl ? "Het huurcontract meesturen" : "Attach the rental contract"}
              {!preview.contractReady && (
                <>
                  {" — "}
                  <em>
                    {nl
                      ? "er staat nog geen contract klaar voor dit soort huurder"
                      : "no contract is uploaded for this kind of renter yet"}
                  </em>
                </>
              )}
            </span>
          </label>
        )}

        <MailPreview
          nl={nl}
          from={senderLabel}
          to={preview.rental.email}
          subject={subject}
          body={body}
          attachments={attach ? [nl ? "huurcontract.pdf" : "rental-contract.pdf"] : []}
          source={nl ? "met de gegevens van deze aanvraag" : "with the details of this request"}
        />

        <p className="tv-sends-mail">
          <strong>{nl ? "Deze knop verstuurt de mail hierboven." : "This button sends the email above."}</strong>{" "}
          {nl
            ? `De aanvraag komt daarna op "${statusWord}" te staan.`
            : `The request will then be "${statusWord}".`}
        </p>

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => submit("send")} disabled={pending}>
            {pending
              ? nl
                ? "Bezig…"
                : "Working…"
              : approve
                ? nl
                  ? "Goedkeuren en mail versturen"
                  : "Approve and send email"
                : nl
                  ? "Weigeren en mail versturen"
                  : "Deny and send email"}
          </Button>
        </div>
      </div>

      <div className="tv-section">
        <div className="tv-section-head">
          <h3>{nl ? "Of enkel de status zetten" : "Or only set the status"}</h3>
        </div>
        <p className="text-sm text-[#34405e]">
          {nl
            ? `Voor de gevallen waarin je zelf al met de aanvrager sprak. De aanvraag komt op "${statusWord}" te staan en er vertrekt géén mail.`
            : `For the cases where you already talked to the requester. The request becomes "${statusWord}" and no email is sent.`}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={() => submit("status")} disabled={pending}>
            {nl ? `Alleen op "${statusWord}" zetten, zonder mail` : `Only set to "${statusWord}", no email`}
          </Button>
        </div>
      </div>
    </div>
  );
}
