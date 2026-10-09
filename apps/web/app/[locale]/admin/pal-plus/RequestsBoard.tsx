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
  publishPalPlusRequestAction,
  reopenPalPlusRequestAction,
} from "@/app/actions/palPlus";
import {
  canPublishPalPlusRequest,
  isActivePalPlusStatus,
  PAL_PLUS_LIMITS,
  PAL_PLUS_STATUS_LABELS,
  type PalPlusAvailabilityGridView,
  type PalPlusCoTutorStatusCode,
  type PalPlusRequestStatusCode,
} from "@/lib/palPlus";
import { AvailabilityView } from "@/components/palPlus/AvailabilityGrid";
import { palPlusAdminErrors } from "@/lib/palPlusMessages";
import type { SaveState } from "@/lib/saveState";
import {
  SessionForm,
  type LinkableRequest,
  type Person,
  type RoomGroup,
  type SessionCourseOption,
  type TagSuggestions,
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
  tags: string[];
  /** Enkel bij een aanbod: wanneer de tutor(s) meestal kunnen. */
  availability: PalPlusAvailabilityGridView;
  availabilityNote: string | null;
  /** De tweede tutor van een aanbod, met of die al bevestigde. */
  coTutor: { id: string; name: string; status: PalPlusCoTutorStatusCode } | null;
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
  tags,
}: {
  nl: boolean;
  base: string;
  mode: "queue" | "processed";
  requests: PalPlusRequestView[];
  courses: AssignableCourse[];
  rooms: RoomGroup[];
  openFollow: OpenFollowRequest[];
  tags: TagSuggestions;
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
              ? "Niets te doen: er wacht geen aanbod of vraag op Onderwijs en er staat geen vraag open."
              : "Nothing to do: no offer or request is waiting for Onderwijs and no request is open."
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
                  <td data-label={nl ? "Soort" : "Kind"}>
                    {kindLabel(request.kind)}
                    {canPublishPalPlusRequest(request) && (
                      <span className="vtk-palplus-sub">{nl ? "Nog na te kijken" : "Still to review"}</span>
                    )}
                  </td>
                  <td data-label={nl ? "Wie" : "Who"}>
                    {request.submitterName}
                    {request.coTutor && request.coTutor.status !== "DECLINED" && (
                      <span className="vtk-palplus-sub">
                        {nl ? "met" : "with"} {request.coTutor.name}
                        {request.coTutor.status === "PENDING" ? (nl ? " (wacht)" : " (waiting)") : ""}
                      </span>
                    )}
                  </td>
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
            tags={tags}
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
  tags,
  onDone,
}: {
  nl: boolean;
  base: string;
  request: PalPlusRequestView;
  courses: AssignableCourse[];
  rooms: RoomGroup[];
  openFollow: OpenFollowRequest[];
  tags: TagSuggestions;
  onDone: () => void;
}) {
  const errors = palPlusAdminErrors(nl);
  const active = isActivePalPlusStatus(request.status);
  const give = request.kind === "GIVE";
  const toReview = canPublishPalPlusRequest(request);
  const [planning, setPlanning] = useState(false);

  if (planning) {
    return (
      <PlanFromRequest
        nl={nl}
        request={request}
        courses={courses}
        rooms={rooms}
        openFollow={openFollow}
        tags={tags}
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
        {!give && request.status !== "CLOSED" && request.reviewedLabel && (
          <span className="text-xs text-vtk-muted">{request.reviewedLabel}</span>
        )}
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
        {give && request.coTutor && (
          <div>
            <dt>{nl ? "Samen met" : "Together with"}</dt>
            <dd>
              {request.coTutor.name}{" "}
              <span className="text-vtk-muted">({coTutorStatusLabel(request.coTutor.status, nl)})</span>
            </dd>
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
        {request.tags.length > 0 && (
          <ul className="pp-taglist">
            {request.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </div>

      {give && (request.availability.rows.length > 0 || request.availabilityNote) && (
        <div>
          <p className="vtk-palplus-label">{nl ? "Kan meestal" : "Usually available"}</p>
          <AvailabilityView grid={request.availability} nl={nl} />
          {request.availabilityNote && <div className="vtk-palplus-text mt-2">{request.availabilityNote}</div>}
        </div>
      )}

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

      {toReview && (
        <section className="vtk-palplus-action">
          <h3>{nl ? "Vraag nakijken" : "Review the request"}</h3>
          <p className="mb-3 text-sm text-vtk-muted">
            {nl
              ? "Staat er niets in wat niet publiek mag, zet de vraag dan online. Ze komt zonder naam op de PAL+-pagina, waar anderen ze kunnen steunen en een tutor erop kan aanbieden. Hoort ze er niet, sluit ze dan hieronder met een reden."
              : "If nothing in it should stay private, publish the request. It appears on the PAL+ page without a name, where others can back it and a tutor can offer to give it. If it does not belong there, close it below with a reason."}
          </p>
          <RequestStatusButton
            nl={nl}
            id={request.id}
            action={publishPalPlusRequestAction}
            label={nl ? "Online zetten" : "Publish"}
            variant="primary"
            successMessage={nl ? "Vraag staat online." : "Request published."}
            fallbackError={nl ? "Niet online gezet." : "Not published."}
            onDone={onDone}
          />
        </section>
      )}

      {active && (
        <section className="vtk-palplus-action">
          <h3>{give ? (nl ? "Aanbod aanvaarden" : "Accept the offer") : nl ? "Een sessie plannen" : "Plan a session"}</h3>
          <p className="mb-3 text-sm text-vtk-muted">
            {give
              ? nl
                ? "Plan de sessie: de tutors, het vak, de omschrijving en de tags staan al ingevuld. Kies een moment dat in het rooster van de tutor past."
                : "Plan the session: the tutors, course, description and tags are filled in. Pick a moment that fits the tutor's availability."
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
                      ? "Staat het vak er niet bij, zet het dan eerst in de vakkenlijst onder Lijsten. Een sessie hangt altijd aan een vak uit de lijst."
                      : "If the course is not there, add it to the course list under Lists first. A session always belongs to a course from the list."}
                </p>
              </div>
            </SaveForm>
          )}
        </section>
      )}

      {active && (
        <section className="vtk-palplus-action">
          <h3>
            {give
              ? nl
                ? "Aanbod niet aanvaarden"
                : "Do not accept the offer"
              : toReview
                ? nl
                  ? "Niet online zetten"
                  : "Do not publish"
                : nl
                  ? "Vraag sluiten"
                  : "Close the request"}
          </h3>
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
                : toReview
                  ? nl
                    ? `De vraag komt niet op de PAL+-pagina. ${request.submitterName} ziet ze als gesloten, met jouw reden. Je kan ze later heropenen.`
                    : `The request does not appear on the PAL+ page. ${request.submitterName} sees it as closed, with your reason. You can reopen it later.`
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
                    : toReview
                      ? nl
                        ? "Dit vak valt buiten wat PAL+ aanbiedt."
                        : "This course is outside what PAL+ offers."
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
          <RequestStatusButton
            nl={nl}
            id={request.id}
            action={reopenPalPlusRequestAction}
            label={nl ? "Heropenen" : "Reopen"}
            variant="ghost"
            successMessage={
              give
                ? nl
                  ? "Aanbod heropend."
                  : "Offer reopened."
                : nl
                  ? "Vraag heropend. Ze staat terug bij na te kijken; zet ze online wanneer ze terug op de pagina mag."
                  : "Request reopened. It is back under review; publish it when it may return to the page."
            }
            fallbackError={nl ? "Niet heropend." : "Not reopened."}
            onDone={onDone}
          />
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

/** Eén knop die de status van een aanvraag verzet (online zetten, heropenen), met een toast. */
function RequestStatusButton({
  nl,
  id,
  action,
  label,
  variant,
  successMessage,
  fallbackError,
  onDone,
}: {
  nl: boolean;
  id: string;
  action: (formData: FormData) => Promise<SaveState>;
  label: string;
  variant: "primary" | "ghost";
  successMessage: string;
  fallbackError: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const errors = palPlusAdminErrors(nl);

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        data.set("id", id);
        startTransition(async () => {
          const result = await action(data);
          if (result.status === "error") {
            showToast({
              message: errors[result.code as keyof typeof errors] ?? fallbackError,
              variant: "error",
              duration: 0,
            });
            return;
          }
          showToast({ message: successMessage, variant: "success" });
          onDone();
        });
      }}
    >
      {label}
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
  tags,
  onBack,
  onDone,
}: {
  nl: boolean;
  request: PalPlusRequestView;
  courses: SessionCourseOption[];
  rooms: RoomGroup[];
  openFollow: OpenFollowRequest[];
  tags: TagSuggestions;
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
  if (give && request.respondsTo && isActivePalPlusStatus(request.respondsTo.status)) {
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

  // De tweede tutor enkel als die bevestigde: wie nog niet antwoordde, staat er
  // niet ongevraagd op.
  const tutors: Person[] = give
    ? [
        { id: request.submitterId, name: request.submitterName },
        ...(request.coTutor?.status === "ACCEPTED" ? [{ id: request.coTutor.id, name: request.coTutor.name }] : []),
      ]
    : [];
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
      {give && (request.availability.rows.length > 0 || request.availabilityNote) && (
        <div>
          <p className="vtk-palplus-label">{nl ? "Kan meestal" : "Usually available"}</p>
          <AvailabilityView grid={request.availability} nl={nl} />
          {request.availabilityNote && <div className="vtk-palplus-text mt-2">{request.availabilityNote}</div>}
        </div>
      )}
      {give && request.coTutor?.status === "PENDING" && (
        <p className="text-sm text-vtk-muted">
          {nl
            ? `${request.coTutor.name} bevestigde nog niet en staat dus niet bij de tutors. Plan je nu, dan kan je die later nog toevoegen.`
            : `${request.coTutor.name} has not confirmed yet, so is not among the tutors. If you plan now, you can still add them later.`}
        </p>
      )}
      {!request.courseId && (
        <p className="text-sm text-vtk-muted">
          {nl
            ? `De indiener tikte "${request.courseTyped ?? ""}" in. Kies hieronder het vak uit de lijst, of zet het eerst in de vakkenlijst onder Lijsten.`
            : `The submitter typed "${request.courseTyped ?? ""}". Pick the course from the list below, or add it to the course list under Lists first.`}
        </p>
      )}
      <SessionForm
        nl={nl}
        initial={{
          id: null,
          courseId: request.courseId ?? "",
          description: request.description,
          tags: request.tags,
          date: "",
          startTime: "",
          endTime: "",
          maxParticipants: "",
          roomId: "",
          roomText: "",
          tutors,
        }}
        courses={courses}
        rooms={rooms}
        linkable={linkable}
        tutorSuggestions={suggestions}
        tags={tags}
        onDone={onDone}
      />
    </div>
  );
}

function coTutorStatusLabel(status: PalPlusCoTutorStatusCode, nl: boolean): string {
  return status === "ACCEPTED"
    ? nl
      ? "bevestigd"
      : "confirmed"
    : status === "DECLINED"
      ? nl
        ? "zei nee"
        : "declined"
      : nl
        ? "moet nog bevestigen"
        : "still has to confirm";
}
