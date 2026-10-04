"use client";

import { useState, useTransition } from "react";
import { Button, Card, Label, Select, Textarea } from "@vtk/ui";
import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import { Modal } from "../admin-table";
import {
  assignPalPlusRequestCourseAction,
  closePalPlusRequestAction,
  reopenPalPlusRequestAction,
} from "@/app/actions/palPlus";
import {
  isActivePalPlusStatus,
  PAL_PLUS_LIMITS,
  PAL_PLUS_STATUS_LABELS,
  type PalPlusRequestStatusCode,
} from "@/lib/palPlus";
import { palPlusAdminErrors } from "@/lib/palPlusMessages";

export type PalPlusRequestView = {
  id: string;
  kind: "GIVE" | "FOLLOW";
  status: PalPlusRequestStatusCode;
  courseId: string | null;
  /** Het vak uit de lijst, of wat de indiener intikte wanneer er nog geen vak aan hangt. */
  courseLabel: string;
  /** Wat de indiener zelf intikte, als dat zo was. */
  courseTyped: string | null;
  description: string;
  submitterName: string;
  submitterEmail: string;
  submittedLabel: string;
  momentLabel: string | null;
  preferredPeriod: string | null;
  askers: number;
  backerNames: string[];
  respondsTo: { courseLabel: string; description: string } | null;
  responses: { id: string; name: string; status: PalPlusRequestStatusCode; submittedLabel: string }[];
  reviewNote: string | null;
  reviewedLabel: string | null;
};

export type AssignableCourse = { id: string; label: string; active: boolean };

/**
 * Het werkbakje van Onderwijs: wat nog beslist moet worden (`queue`), of wat al
 * afgehandeld is (`processed`). Een klik op de rij opent de aanvraag; daar
 * staan de acties.
 */
export function RequestsBoard({
  nl,
  base,
  mode,
  requests,
  courses,
}: {
  nl: boolean;
  base: string;
  mode: "queue" | "processed";
  requests: PalPlusRequestView[];
  courses: AssignableCourse[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const kindLabel = (kind: "GIVE" | "FOLLOW") =>
    kind === "GIVE" ? (nl ? "Aanbod" : "Offer") : nl ? "Hulpvraag" : "Help request";

  return (
    <Card className="p-5">
      {requests.length === 0 ? (
        <p className="text-sm text-vtk-muted">
          {mode === "queue"
            ? nl
              ? "Niets te doen: er wacht geen aanbod op een beslissing en er staat geen vraag open."
              : "Nothing to do: no offer is waiting for a decision and no request is open."
            : nl
              ? "Nog niets afgehandeld."
              : "Nothing handled yet."}
        </p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="vtk-palplus-table">
            <thead>
              <tr>
                <th scope="col">{nl ? "Vak" : "Course"}</th>
                <th scope="col">{nl ? "Soort" : "Kind"}</th>
                <th scope="col">{nl ? "Wie" : "Who"}</th>
                {mode === "queue" ? (
                  <th scope="col" className="is-num">
                    {nl ? "Zoeken dit" : "Need this"}
                  </th>
                ) : (
                  <th scope="col">{nl ? "Status" : "Status"}</th>
                )}
                <th scope="col">{nl ? "Ingediend" : "Submitted"}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className="vtk-palplus-row"
                  onClick={() => setSelectedId(request.id)}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="vtk-palplus-rowtitle"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(request.id);
                      }}
                    >
                      {request.courseLabel}
                    </button>
                    {request.courseTyped && !request.courseId && (
                      <span className="vtk-palplus-sub">
                        {nl ? "Zelf ingetikt, nog geen vak uit de lijst" : "Typed in, no course from the list yet"}
                      </span>
                    )}
                  </th>
                  <td data-label={nl ? "Soort" : "Kind"}>{kindLabel(request.kind)}</td>
                  <td data-label={nl ? "Wie" : "Who"}>{request.submitterName}</td>
                  {mode === "queue" ? (
                    <td data-label={nl ? "Zoeken dit" : "Need this"} className="is-num">
                      {request.kind === "FOLLOW" ? request.askers : <span className="text-vtk-muted">-</span>}
                    </td>
                  ) : (
                    <td data-label={nl ? "Status" : "Status"}>
                      <span className="vtk-palplus-status" data-status={request.status}>
                        {PAL_PLUS_STATUS_LABELS[request.status][nl ? "nl" : "en"]}
                      </span>
                    </td>
                  )}
                  <td data-label={nl ? "Ingediend" : "Submitted"}>{request.submittedLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Modal
          title={`${kindLabel(selected.kind)}: ${selected.courseLabel}`}
          size="lg"
          onClose={() => setSelectedId(null)}
        >
          <RequestDetail
            nl={nl}
            base={base}
            request={selected}
            courses={courses}
            onDone={() => setSelectedId(null)}
          />
        </Modal>
      )}
    </Card>
  );
}

function RequestDetail({
  nl,
  base,
  request,
  courses,
  onDone,
}: {
  nl: boolean;
  base: string;
  request: PalPlusRequestView;
  courses: AssignableCourse[];
  onDone: () => void;
}) {
  const errors = palPlusAdminErrors(nl);
  const active = isActivePalPlusStatus(request.status);
  const give = request.kind === "GIVE";

  return (
    <div className="vtk-palplus-detail">
      <div className="flex flex-wrap items-center gap-2">
        <span className="vtk-palplus-status" data-status={request.status}>
          {PAL_PLUS_STATUS_LABELS[request.status][nl ? "nl" : "en"]}
        </span>
      </div>

      <dl className="vtk-palplus-facts">
        <div>
          <dt>{nl ? "Ingediend door" : "Submitted by"}</dt>
          <dd>
            {request.submitterName}
            <br />
            <a className="text-vtk-muted underline underline-offset-2" href={`mailto:${request.submitterEmail}`}>
              {request.submitterEmail}
            </a>
          </dd>
        </div>
        <div>
          <dt>{nl ? "Ingediend op" : "Submitted on"}</dt>
          <dd>{request.submittedLabel}</dd>
        </div>
        {give && request.momentLabel && (
          <div>
            <dt>{nl ? "Voorgesteld moment" : "Proposed moment"}</dt>
            <dd>{request.momentLabel}</dd>
          </div>
        )}
        {!give && (
          <div>
            <dt>{nl ? "Wanneer nodig" : "When needed"}</dt>
            <dd>{request.preferredPeriod ?? <span className="text-vtk-muted">{nl ? "niet gezegd" : "not said"}</span>}</dd>
          </div>
        )}
        {request.courseTyped && (
          <div>
            <dt>{nl ? "Zelf ingetikt vak" : "Course as typed"}</dt>
            <dd>{request.courseTyped}</dd>
          </div>
        )}
      </dl>

      <div>
        <p className="vtk-palplus-label">{give ? (nl ? "Wat de tutor wil behandelen" : "What the tutor wants to cover") : nl ? "Waarmee ze hulp zoeken" : "What they need help with"}</p>
        <div className="vtk-palplus-text">{request.description}</div>
      </div>

      {give && request.respondsTo && (
        <div>
          <p className="vtk-palplus-label">{nl ? "Antwoord op de vraag" : "Answers the request"}</p>
          <div className="vtk-palplus-text">
            <strong>{request.respondsTo.courseLabel}</strong>
            {"\n"}
            {request.respondsTo.description}
          </div>
        </div>
      )}

      {!give && (
        <div>
          <p className="vtk-palplus-label">
            {nl ? `Zoeken dit (${request.askers})` : `Need this (${request.askers})`}
          </p>
          <ul className="vtk-palplus-names">
            <li>
              {request.submitterName} <span className="text-vtk-muted">({nl ? "stelde de vraag" : "asked"})</span>
            </li>
            {request.backerNames.map((name, index) => (
              <li key={`${name}-${index}`}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      {!give && request.responses.length > 0 && (
        <div>
          <p className="vtk-palplus-label">{nl ? "Aanbiedingen op deze vraag" : "Offers for this request"}</p>
          <ul className="vtk-palplus-names">
            {request.responses.map((response) => (
              <li key={response.id}>
                {response.name}{" "}
                <span className="text-vtk-muted">
                  ({PAL_PLUS_STATUS_LABELS[response.status][nl ? "nl" : "en"]}, {response.submittedLabel})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {active && (
        <section className="vtk-palplus-action">
          <h3>{nl ? "Vak uit de lijst" : "Course from the list"}</h3>
          {courses.length === 0 ? (
            <p className="text-sm text-vtk-muted">
              {nl ? "De vakkenlijst is nog leeg. " : "The course list is still empty. "}
              <Link href={`${base}/admin/pal-plus?tab=vakken`} className="underline underline-offset-2">
                {nl ? "Vakken toevoegen" : "Add courses"}
              </Link>
            </p>
          ) : (
            <SaveForm
              action={assignPalPlusRequestCourseAction}
              submitLabel={nl ? "Vak opslaan" : "Save course"}
              savingLabel={nl ? "Opslaan…" : "Saving…"}
              savedMessage={nl ? "Vak opgeslagen." : "Course saved."}
              errorMessages={errors}
              fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
              submitSize="sm"
              // Een bewerking, geen toevoeging: na het opslaan moet het gekozen
              // vak blijven staan, niet terugspringen naar wat er stond toen de
              // modal openging.
              resetOnSuccess={false}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={request.id} />
              <div>
                <Label htmlFor={`pp-assign-${request.id}`} className="sr-only">
                  {nl ? "Vak" : "Course"}
                </Label>
                <Select
                  id={`pp-assign-${request.id}`}
                  name="courseId"
                  defaultValue={request.courseId ?? ""}
                  required
                >
                  <option value="" disabled>
                    {nl ? "Kies een vak" : "Pick a course"}
                  </option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.label}
                      {course.active ? "" : nl ? " (uit)" : " (off)"}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-vtk-muted">
                  {request.courseId
                    ? nl
                      ? "Koos de indiener het verkeerde vak, zet het hier recht."
                      : "If the submitter picked the wrong course, correct it here."
                    : nl
                      ? "Staat het vak er niet bij, zet het dan eerst in de lijst onder Vakken. Een sessie hangt altijd aan een vak uit de lijst."
                      : "If the course is not there, add it under Courses first. A session always belongs to a course from the list."}
                </p>
              </div>
            </SaveForm>
          )}
        </section>
      )}

      {active && (
        <section className="vtk-palplus-action">
          <h3>{give ? (nl ? "Aanbod niet aanvaarden" : "Do not accept the offer") : nl ? "Vraag sluiten" : "Close the request"}</h3>
          <SaveForm
            action={closePalPlusRequestAction}
            submitLabel={nl ? "Sluiten" : "Close"}
            savingLabel={nl ? "Sluiten…" : "Closing…"}
            savedMessage={nl ? "Aanvraag gesloten." : "Request closed."}
            errorMessages={errors}
            fallbackErrorMessage={nl ? "Niet gesloten." : "Not closed."}
            submitVariant="ghost"
            submitSize="sm"
            onSuccess={onDone}
            confirmSubmit={{
              title: nl ? "Aanvraag sluiten?" : "Close request?",
              description: give
                ? nl
                  ? `${request.submitterName} ziet bij het aanbod dat het niet aanvaard is, met jouw reden. Je kan het later heropenen.`
                  : `${request.submitterName} sees with the offer that it was not accepted, with your reason. You can reopen it later.`
                : nl
                  ? `De vraag verdwijnt van de PAL+-pagina. ${request.submitterName} ziet ze als gesloten, met jouw reden. Je kan ze later heropenen.`
                  : `The request disappears from the PAL+ page. ${request.submitterName} sees it as closed, with your reason. You can reopen it later.`,
              confirmLabel: nl ? "Sluiten" : "Close",
              cancelLabel: nl ? "Annuleren" : "Cancel",
            }}
            className="space-y-3"
          >
            <input type="hidden" name="id" value={request.id} />
            <div>
              <Label htmlFor={`pp-reason-${request.id}`}>{nl ? "Reden" : "Reason"}</Label>
              <Textarea
                id={`pp-reason-${request.id}`}
                name="reason"
                rows={3}
                maxLength={PAL_PLUS_LIMITS.reviewNote}
                placeholder={
                  give
                    ? nl
                      ? "Er is al een sessie over dit hoofdstuk die week."
                      : "There is already a session on this chapter that week."
                    : nl
                      ? "We vonden niemand die dit vak kan geven."
                      : "We could not find anyone to teach this course."
                }
                required
              />
              <p className="mt-1 text-xs text-vtk-muted">
                {nl ? "De indiener ziet deze zin bij de aanvraag." : "The submitter sees this sentence with the request."}
              </p>
            </div>
          </SaveForm>
        </section>
      )}

      {request.status === "CLOSED" && (
        <section className="vtk-palplus-action">
          <h3>{nl ? "Gesloten" : "Closed"}</h3>
          {request.reviewNote && <div className="vtk-palplus-text">{request.reviewNote}</div>}
          {request.reviewedLabel && <p className="text-xs text-vtk-muted">{request.reviewedLabel}</p>}
          <ReopenButton nl={nl} id={request.id} onDone={onDone} />
        </section>
      )}

      {request.status === "WITHDRAWN" && (
        <p className="text-sm text-vtk-muted">
          {nl ? "De indiener trok deze aanvraag zelf in." : "The submitter withdrew this request."}
        </p>
      )}
    </div>
  );
}

function ReopenButton({ nl, id, onDone }: { nl: boolean; id: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const errors = palPlusAdminErrors(nl);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        data.set("id", id);
        startTransition(async () => {
          const result = await reopenPalPlusRequestAction(data);
          if (result.status === "error") {
            showToast({
              message: errors[result.code as keyof typeof errors] ?? (nl ? "Niet heropend." : "Not reopened."),
              variant: "error",
              duration: 0,
            });
            return;
          }
          showToast({ message: nl ? "Aanvraag heropend." : "Request reopened.", variant: "success" });
          onDone();
        });
      }}
    >
      {nl ? "Heropenen" : "Reopen"}
    </Button>
  );
}
