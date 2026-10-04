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
import {
  SessionForm,
  type LinkableRequest,
  type Person,
  type RoomGroup,
  type SessionCourseOption,
} from "./SessionForm";

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
  submitterId: string;
  submitterName: string;
  submitterEmail: string;
  submittedLabel: string;
  momentLabel: string | null;
  /** Het voorgestelde moment als formuliervelden (Brusselse wandklok), voor het plannen. */
  proposed: { date: string; startTime: string; endTime: string } | null;
  preferredPeriod: string | null;
  askers: number;
  backerNames: string[];
  respondsTo: { id: string; status: PalPlusRequestStatusCode; courseLabel: string; description: string } | null;
  responses: {
    id: string;
    userId: string;
    name: string;
    status: PalPlusRequestStatusCode;
    submittedLabel: string;
  }[];
  reviewNote: string | null;
  reviewedLabel: string | null;
};

export type AssignableCourse = { id: string; label: string; active: boolean };

/** Een open hulpvraag die een geplande sessie kan meenemen. */
export type OpenFollowRequest = { id: string; courseId: string | null; label: string };

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
  rooms,
  openFollow,
}: {
  nl: boolean;
  base: string;
  mode: "queue" | "processed";
  requests: PalPlusRequestView[];
  courses: AssignableCourse[];
  rooms: RoomGroup[];
  openFollow: OpenFollowRequest[];
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
            rooms={rooms}
            openFollow={openFollow}
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
  rooms,
  openFollow,
  onDone,
}: {
  nl: boolean;
  base: string;
  request: PalPlusRequestView;
  courses: AssignableCourse[];
  rooms: RoomGroup[];
  openFollow: OpenFollowRequest[];
  onDone: () => void;
}) {
  const errors = palPlusAdminErrors(nl);
  const active = isActivePalPlusStatus(request.status);
  const give = request.kind === "GIVE";
  const [planning, setPlanning] = useState(false);

  if (planning) {
    return (
      <PlanFromRequest
        nl={nl}
        request={request}
        courses={courses}
        rooms={rooms}
        openFollow={openFollow}
        onBack={() => setPlanning(false)}
        onDone={onDone}
      />
    );
  }

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
          <h3>{give ? (nl ? "Aanbod aanvaarden" : "Accept the offer") : nl ? "Een sessie plannen" : "Plan a session"}</h3>
          <p className="mb-3 text-sm text-vtk-muted">
            {give
              ? nl
                ? "Plan de sessie met deze tutor. Het moment, het vak en de omschrijving staan al ingevuld; je kan ze nog aanpassen."
                : "Plan the session with this tutor. The moment, course and description are filled in; you can still change them."
              : nl
                ? "Kies een tutor (of een van de aanbiedingen) en een moment. Wie de vraag stelde, ziet daarna de sessie bij de aanvraag."
                : "Pick a tutor (or one of the offers) and a moment. Whoever asked then sees the session with the request."}
          </p>
          <Button type="button" size="sm" onClick={() => setPlanning(true)}>
            {nl ? "Sessie plannen" : "Plan session"}
          </Button>
        </section>
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

/**
 * Het sessieformulier, voorgevuld vanuit een aanvraag: een aanbod brengt zijn
 * tutor, moment en omschrijving mee; een hulpvraag de mensen die erop aanboden.
 * De aanvraag zelf staat aangevinkt bij "deze sessie beantwoordt", samen met de
 * andere open vragen over hetzelfde vak die er mee in kunnen.
 */
function PlanFromRequest({
  nl,
  request,
  courses,
  rooms,
  openFollow,
  onBack,
  onDone,
}: {
  nl: boolean;
  request: PalPlusRequestView;
  courses: SessionCourseOption[];
  rooms: RoomGroup[];
  openFollow: OpenFollowRequest[];
  onBack: () => void;
  onDone: () => void;
}) {
  const give = request.kind === "GIVE";
  const linkable: LinkableRequest[] = [
    {
      id: request.id,
      label: `${give ? (nl ? "Aanbod van" : "Offer from") : nl ? "Hulpvraag van" : "Help request from"} ${request.submitterName}: ${request.courseLabel}`,
      checked: true,
    },
  ];
  if (give && request.respondsTo && request.respondsTo.status === "OPEN") {
    linkable.push({
      id: request.respondsTo.id,
      label: `${nl ? "De vraag waarop dit aanbod antwoordt" : "The request this offer answers"}: ${request.respondsTo.courseLabel}`,
      checked: true,
    });
  }
  if (!give) {
    for (const response of request.responses) {
      if (!isActivePalPlusStatus(response.status)) continue;
      linkable.push({
        id: response.id,
        label: `${nl ? "Aanbod van" : "Offer from"} ${response.name}`,
        checked: false,
      });
    }
  }
  if (request.courseId) {
    for (const other of openFollow) {
      if (other.courseId !== request.courseId || linkable.some((item) => item.id === other.id)) continue;
      linkable.push({ id: other.id, label: other.label, checked: false });
    }
  }

  const tutors: Person[] = give ? [{ id: request.submitterId, name: request.submitterName }] : [];
  const suggestions: Person[] = give
    ? []
    : request.responses
        .filter((response) => isActivePalPlusStatus(response.status))
        .map((response) => ({ id: response.userId, name: response.name }));

  return (
    <div className="vtk-palplus-detail">
      <div>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          {nl ? "Terug naar de aanvraag" : "Back to the request"}
        </Button>
      </div>
      {!request.courseId && (
        <p className="text-sm text-vtk-muted">
          {nl
            ? `De indiener tikte "${request.courseTyped ?? ""}" in. Kies hieronder het vak uit de lijst, of zet het eerst in de lijst onder Vakken.`
            : `The submitter typed "${request.courseTyped ?? ""}". Pick the course from the list below, or add it under Courses first.`}
        </p>
      )}
      <SessionForm
        nl={nl}
        initial={{
          id: null,
          courseId: request.courseId ?? "",
          description: request.description,
          date: request.proposed?.date ?? "",
          startTime: request.proposed?.startTime ?? "",
          endTime: request.proposed?.endTime ?? "",
          maxParticipants: "",
          roomId: "",
          roomText: "",
          tutors,
        }}
        courses={courses}
        rooms={rooms}
        linkable={linkable}
        tutorSuggestions={suggestions}
        onDone={onDone}
      />
    </div>
  );
}
