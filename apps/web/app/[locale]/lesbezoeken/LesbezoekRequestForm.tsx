"use client";

import { useCallback, useState } from "react";
import { Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { requestLesbezoekAction } from "@/app/actions/lesbezoeken";
import {
  LESBEZOEK_BACHELORS,
  LESBEZOEK_LIMITS,
  LESBEZOEK_MASTERS,
  LESBEZOEK_MIN_LEAD_DAYS,
} from "@/lib/lesbezoeken";
import { lesbezoekRequestErrors } from "@/lib/lesbezoekenMessages";

/**
 * Het publieke aanvraagformulier, de opvolger van de Google Form.
 *
 * De velden staan in dezelfde volgorde en met dezelfde woorden als daar: wie het
 * vorig jaar invulde, moet niet opnieuw zoeken. Wat er wél bijkomt, is dat de
 * datum een echte datum is en het uur een echt uur, zodat de aanvraag meteen op
 * de juiste plaats in de kalender belandt in plaats van als tekst in een cel.
 */

export type RequestCopy = {
  organisationLabel: string;
  organisationOther: string;
  organisationNameLabel: string;
  nameLabel: string;
  emailLabel: string;
  emailHelp: string;
  phoneLabel: string;
  subjectLabel: string;
  subjectPlaceholder: string;
  teacherNoteLabel: string;
  teacherNoteHelp: string;
  longVisitLabel: string;
  audienceLabel: string;
  audienceOtherOption: string;
  audienceOtherLabel: string;
  courseLabel: string;
  coursePlaceholder: string;
  dateLabel: string;
  timeLabel: string;
  timeHelp: string;
  teacherEmailLabel: string;
  teacherEmailHelp: string;
  honeypotLabel: string;
  sectionContact: string;
  sectionVisit: string;
  sectionClass: string;
  submit: string;
  submitting: string;
  sent: string;
  fallbackError: string;
};

const OTHER = "__other__";

/** De vroegste datum die het formulier aanvaardt, als "YYYY-MM-DD". */
function earliestDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + LESBEZOEK_MIN_LEAD_DAYS);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function LesbezoekRequestForm({
  nl,
  copy,
  organisations,
}: {
  nl: boolean;
  copy: RequestCopy;
  organisations: { id: string; name: string }[];
}) {
  const [organisation, setOrganisation] = useState("");
  const [audience, setAudience] = useState("");
  const [sent, setSent] = useState(false);

  // Niet alles leegmaken na een geslaagde aanvraag: wie voor drie doelgroepen
  // aanvraagt, tikt anders drie keer dezelfde contactgegevens en dezelfde
  // toelichting opnieuw. Enkel wat per aanvraag verschilt gaat leeg, en dat doet
  // de browser zelf niet, dus het formulier reset hier niet.
  const onSuccess = useCallback(() => setSent(true), []);

  return (
    <>
      {sent && (
        <p className="lb-warn" role="status">
          <span>{copy.sent}</span>
        </p>
      )}
      <SaveForm
        action={requestLesbezoekAction}
        submitLabel={copy.submit}
        savingLabel={copy.submitting}
        savedMessage={copy.sent}
        errorMessages={lesbezoekRequestErrors(nl)}
        fallbackErrorMessage={copy.fallbackError}
        resetOnSuccess={false}
        onSuccess={onSuccess}
        className="lb-form"
      >
        <fieldset className="lb-fieldset">
          <legend>{copy.sectionContact}</legend>

          <div className="lb-field">
            <Label htmlFor="lb-org">{copy.organisationLabel} *</Label>
            <Select
              id="lb-org"
              name="organisationId"
              value={organisation === OTHER ? "" : organisation}
              onChange={(event) => setOrganisation(event.target.value)}
              required={organisation !== OTHER}
            >
              <option value="">—</option>
              {organisations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
            <label className="lb-check" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={organisation === OTHER}
                onChange={(event) => setOrganisation(event.target.checked ? OTHER : "")}
              />
              <span>{copy.organisationOther}</span>
            </label>
          </div>

          {organisation === OTHER && (
            <div className="lb-field">
              <Label htmlFor="lb-orgname">{copy.organisationNameLabel} *</Label>
              <Input
                id="lb-orgname"
                name="organisationName"
                maxLength={LESBEZOEK_LIMITS.organisation}
                required
              />
            </div>
          )}

          <div className="lb-row">
            <div className="lb-field">
              <Label htmlFor="lb-name">{copy.nameLabel}</Label>
              <Input
                id="lb-name"
                name="requesterName"
                autoComplete="name"
                maxLength={LESBEZOEK_LIMITS.name}
              />
            </div>
            <div className="lb-field">
              <Label htmlFor="lb-email">{copy.emailLabel} *</Label>
              <Input
                id="lb-email"
                name="requesterEmail"
                type="email"
                autoComplete="email"
                maxLength={LESBEZOEK_LIMITS.email}
                aria-describedby="lb-email-help"
                required
              />
              <p className="lb-help" id="lb-email-help">
                {copy.emailHelp}
              </p>
            </div>
          </div>

          <div className="lb-field">
            <Label htmlFor="lb-phone">{copy.phoneLabel} *</Label>
            <Input
              id="lb-phone"
              name="requesterPhone"
              type="tel"
              autoComplete="tel"
              maxLength={LESBEZOEK_LIMITS.phone}
              required
            />
          </div>
        </fieldset>

        <fieldset className="lb-fieldset">
          <legend>{copy.sectionVisit}</legend>

          <div className="lb-field">
            <Label htmlFor="lb-subject">{copy.subjectLabel} *</Label>
            <Input
              id="lb-subject"
              name="subject"
              placeholder={copy.subjectPlaceholder}
              maxLength={LESBEZOEK_LIMITS.subject}
              required
            />
          </div>

          <div className="lb-field">
            <Label htmlFor="lb-teachernote">{copy.teacherNoteLabel} *</Label>
            <Textarea
              id="lb-teachernote"
              name="teacherNote"
              rows={7}
              maxLength={LESBEZOEK_LIMITS.teacherNote}
              aria-describedby="lb-teachernote-help"
              required
            />
            <p className="lb-help" id="lb-teachernote-help">
              {copy.teacherNoteHelp}
            </p>
          </div>

          <label className="lb-check">
            <input type="checkbox" name="longVisit" />
            <span>{copy.longVisitLabel}</span>
          </label>
        </fieldset>

        <fieldset className="lb-fieldset">
          <legend>{copy.sectionClass}</legend>

          <div className="lb-field">
            <Label htmlFor="lb-audience">{copy.audienceLabel} *</Label>
            <Select
              id="lb-audience"
              name="audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              required={audience !== OTHER}
            >
              <option value="">—</option>
              <optgroup label="Bachelors">
                {LESBEZOEK_BACHELORS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Masters">
                {LESBEZOEK_MASTERS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </optgroup>
              <option value={OTHER}>{copy.audienceOtherOption}</option>
            </Select>
          </div>

          {audience === OTHER && (
            <div className="lb-field">
              <Label htmlFor="lb-audience-other">{copy.audienceOtherLabel} *</Label>
              <Input
                id="lb-audience-other"
                name="audienceOther"
                maxLength={LESBEZOEK_LIMITS.audience}
                required
              />
            </div>
          )}

          <div className="lb-field">
            <Label htmlFor="lb-course">{copy.courseLabel} *</Label>
            <Input
              id="lb-course"
              name="course"
              placeholder={copy.coursePlaceholder}
              maxLength={LESBEZOEK_LIMITS.course}
              required
            />
          </div>

          <div className="lb-row">
            <div className="lb-field">
              <Label htmlFor="lb-date">{copy.dateLabel} *</Label>
              <Input id="lb-date" name="date" type="date" min={earliestDate()} required />
            </div>
            <div className="lb-field">
              <Label htmlFor="lb-time">{copy.timeLabel} *</Label>
              <Input
                id="lb-time"
                name="time"
                type="time"
                aria-describedby="lb-time-help"
                required
              />
              <p className="lb-help" id="lb-time-help">
                {copy.timeHelp}
              </p>
            </div>
          </div>

          <div className="lb-field">
            <Label htmlFor="lb-teacher">{copy.teacherEmailLabel} *</Label>
            <Input
              id="lb-teacher"
              name="teacherEmail"
              type="email"
              maxLength={LESBEZOEK_LIMITS.email}
              aria-describedby="lb-teacher-help"
              required
            />
            <p className="lb-help" id="lb-teacher-help">
              {copy.teacherEmailHelp}
            </p>
          </div>
        </fieldset>

        {/* Honeypot. Uit beeld met CSS en niet met `display: none`, want een bot
            die het formulier leest slaat een verborgen veld soms over. Wie hier
            toch iets in typt, krijgt een groene toast en er vertrekt niets. */}
        <div className="lb-honeypot" aria-hidden="true">
          <label htmlFor="lb-website">{copy.honeypotLabel}</label>
          <input id="lb-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      </SaveForm>
    </>
  );
}
