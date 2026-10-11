"use client";

import { useState, useTransition } from "react";
import { Button, Card, Label, Select, Textarea } from "@vtk/ui";
import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import { Modal } from "../admin-table";
import {
  acceptPalPlusRequestAction,
  assignPalPlusRequestCourseAction,
  closePalPlusRequestAction,
  publishPalPlusRequestAction,
  reopenPalPlusRequestAction,
} from "@/app/actions/palPlus";
import {
  canAcceptPalPlusRequest,
  canPublishPalPlusRequest,
  isActivePalPlusStatus,
  PAL_PLUS_LIMITS,
  PAL_PLUS_STATUS_LABELS,
  type PalPlusCoTutorStatusCode,
  type PalPlusRequestStatusCode,
} from "@/lib/palPlus";
import { palPlusAdminErrors } from "@/lib/palPlusMessages";
import type { SaveState } from "@/lib/saveState";
import {
  SessionForm,
  type LinkableRequest,
  type MomentChoice,
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
  /** Enkel bij een aanbod: de momenten waarop de tutor(s) de sessie kunnen geven. */
  moments: MomentChoice[];
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
  const kindLabel = (kind: "GIVE" | "FOLLOW") => palPlusKindLabel(kind, nl);
  const offers = requests.filter((request) => request.kind === "GIVE");
  const asks = requests.filter((request) => request.kind === "FOLLOW");

  return (
    <div className="space-y-5">
      {(["GIVE", "FOLLOW"] as const).map((kind) => (
        <RequestTable
          key={kind}
          nl={nl}
          mode={mode}
          kind={kind}
          requests={kind === "GIVE" ? offers : asks}
          onSelect={setSelectedId}
        />
      ))}

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
    </div>
  );
}

function palPlusKindLabel(kind: "GIVE" | "FOLLOW", nl: boolean): string {
  return kind === "GIVE" ? (nl ? "Aanbod" : "Offer") : nl ? "Hulpvraag" : "Help request";
}

/** Wat een soort betekent, in een zin: boven de tabel en bovenaan de aanvraag. */
function palPlusKindLead(kind: "GIVE" | "FOLLOW", nl: boolean): string {
  return kind === "GIVE"
    ? nl
      ? "Iemand wil een sessie geven"
      : "Someone wants to give a session"
    : nl
      ? "Iemand zoekt hulp bij een vak"
      : "Someone needs help with a course";
}

/**
 * De aanvragen van één soort, in hun eigen kaart. Een aanbod en een hulpvraag
 * vragen elk iets anders van Onderwijs (een sessie plannen tegenover nakijken
 * en een tutor zoeken), dus staan ze niet door elkaar in één lijst. De kaart
 * draagt de soort met een rail aan de linkerkant: geel voor een aanbod, inkt
 * voor een vraag, zodat je ook halverwege een lange lijst ziet waar je zit.
 */
function RequestTable({
  nl,
  mode,
  kind,
  requests,
  onSelect,
}: {
  nl: boolean;
  mode: "queue" | "processed";
  kind: "GIVE" | "FOLLOW";
  requests: PalPlusRequestView[];
  onSelect: (id: string) => void;
}) {
  const give = kind === "GIVE";
  const headingId = `pp-requests-${kind.toLowerCase()}`;
  return (
    <Card className="vtk-palplus-kindcard p-5" data-kind={kind}>
      <div className="vtk-palplus-kindhead">
        <h2 id={headingId}>
          {give ? (nl ? "Aanbiedingen" : "Offers") : nl ? "Hulpvragen" : "Help requests"}
          <span className="vtk-palplus-kindcount">{requests.length}</span>
        </h2>
        <p>{palPlusKindLead(kind, nl)}</p>
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-vtk-muted">
          {mode === "queue"
            ? give
              ? nl
                ? "Geen aanbod dat op Onderwijs wacht."
                : "No offer waiting for Onderwijs."
              : nl
                ? "Geen vraag om na te kijken en geen open vraag."
                : "No request to review and no open request."
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
                <th scope="col">{give ? (nl ? "Tutor" : "Tutor") : nl ? "Wie" : "Who"}</th>
                {give ? (
                  <th scope="col">{nl ? "Kan op" : "Can do"}</th>
                ) : (
                  mode === "queue" && (
                    <th scope="col" className="is-num">
                      {nl ? "Zoeken dit" : "Need this"}
                    </th>
                  )
                )}
                <th scope="col">{nl ? "Status" : "Status"}</th>
                <th scope="col">{nl ? "Ingediend" : "Submitted"}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const upcoming = request.moments.filter((moment) => !moment.past);
                return (
                  <tr key={request.id} className="vtk-palplus-row" onClick={() => onSelect(request.id)}>
                    <th scope="row">
                      <button
                        type="button"
                        className="vtk-palplus-rowtitle"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(request.id);
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
                    <td data-label={give ? (nl ? "Tutor" : "Tutor") : nl ? "Wie" : "Who"}>
                      {request.submitterName}
                      {request.coTutor && request.coTutor.status !== "DECLINED" && (
                        <span className="vtk-palplus-sub">
                          {nl ? "met" : "with"} {request.coTutor.name}
                          {request.coTutor.status === "PENDING" ? (nl ? " (wacht)" : " (waiting)") : ""}
                        </span>
                      )}
                    </td>
                    {give ? (
                      <td data-label={nl ? "Kan op" : "Can do"}>
                        {upcoming[0] ? (
                          <>
                            {upcoming[0].label}
                            {upcoming.length > 1 && (
                              <span className="vtk-palplus-sub">
                                {nl ? `of nog ${upcoming.length - 1} andere` : `or ${upcoming.length - 1} more`}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-vtk-muted">
                            {request.moments.length > 0
                              ? nl
                                ? "alle momenten voorbij"
                                : "all moments passed"
                              : nl
                                ? "zie opmerking"
                                : "see note"}
                          </span>
                        )}
                      </td>
                    ) : (
                      mode === "queue" && (
                        <td data-label={nl ? "Zoeken dit" : "Need this"} className="is-num">
                          {request.askers}
                        </td>
                      )
                    )}
                    <td data-label={nl ? "Status" : "Status"}>
                      <span className="vtk-palplus-status" data-status={request.status}>
                        {canPublishPalPlusRequest(request)
                          ? nl
                            ? "Nog na te kijken"
                            : "Still to review"
                          : PAL_PLUS_STATUS_LABELS[request.status][nl ? "nl" : "en"]}
                      </span>
                    </td>
                    <td data-label={nl ? "Ingediend" : "Submitted"}>{request.submittedLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
      <div className="vtk-palplus-kindtag" data-kind={request.kind}>
        <strong>{palPlusKindLabel(request.kind, nl)}</strong>
        <span>{palPlusKindLead(request.kind, nl)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="vtk-palplus-status" data-status={request.status}>
          {PAL_PLUS_STATUS_LABELS[request.status][nl ? "nl" : "en"]}
        </span>
        {request.status !== "CLOSED" && request.reviewedLabel && (
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

      {give && <ProposedMomentsView nl={nl} request={request} />}

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

      {canAcceptPalPlusRequest(request) && (
        <section className="vtk-palplus-action">
          <h3>{nl ? "Aanbod aanvaarden" : "Accept the offer"}</h3>
          <p className="mb-3 text-sm text-vtk-muted">
            {nl
              ? "Ligt het moment of het lokaal nog niet vast, aanvaard het aanbod dan al: de tutor krijgt een mail dat de sessie doorgaat en ziet \"Aanvaard, moment volgt\". Plannen doe je later vanuit deze aanvraag. Weet je het moment al, plan dan meteen hieronder."
              : "If the time or room is not fixed yet, accept the offer already: the tutor gets an email that the session is going ahead and sees \"Accepted, time to follow\". You plan it later from this request. If you already know the time, plan it right away below."}
          </p>
          <RequestStatusButton
            nl={nl}
            id={request.id}
            action={acceptPalPlusRequestAction}
            label={nl ? "Aanvaarden, moment volgt" : "Accept, time to follow"}
            variant="primary"
            successMessage={nl ? "Aanbod aanvaard. De tutor kreeg een mail." : "Offer accepted. The tutor got an email."}
            fallbackError={nl ? "Niet aanvaard." : "Not accepted."}
            onDone={onDone}
          />
        </section>
      )}

      {active && (
        <section className="vtk-palplus-action">
          <h3>{nl ? "Sessie plannen" : "Plan the session"}</h3>
          <p className="mb-3 text-sm text-vtk-muted">
            {give
              ? nl
                ? "De tutors, het vak, de omschrijving en de tags staan al ingevuld, en de momenten van de tutor staan klaar om met één klik te kiezen."
                : "The tutors, course, description and tags are filled in, and the tutor's moments are ready to pick with one click."
              : nl
                ? "Kies een tutor (of een van de aanbiedingen) en een moment. Wie de vraag stelde, ziet daarna de sessie bij de aanvraag."
                : "Pick a tutor (or one of the offers) and a moment. Whoever asked then sees the session with the request."}
          </p>
          <Button
            type="button"
            size="sm"
            variant={canAcceptPalPlusRequest(request) ? "ghost" : "primary"}
            onClick={() => setPlanning(true)}
          >
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
  // De momenten van de tutor als keuze boven het sessieformulier, het eerste
  // dat nog komt al ingevuld.
  const upcomingMoments = give ? request.moments.filter((moment) => !moment.past) : [];
  const firstMoment = upcomingMoments[0] ?? null;
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
      {give && request.availabilityNote && (
        <div>
          <p className="vtk-palplus-label">{nl ? "Opmerking bij de momenten" : "Note on the moments"}</p>
          <div className="vtk-palplus-text">{request.availabilityNote}</div>
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
          date: firstMoment?.date ?? "",
          startTime: firstMoment?.startTime ?? "",
          endTime: firstMoment?.endTime ?? "",
          maxParticipants: "",
          roomId: "",
          roomText: "",
          tutors,
        }}
        courses={courses}
        rooms={rooms}
        linkable={linkable}
        tutorSuggestions={suggestions}
        momentChoices={upcomingMoments}
        tags={tags}
        onDone={onDone}
      />
    </div>
  );
}

/**
 * De momenten die de tutor voorstelde, met de opmerking eronder. Een voorbij
 * moment staat doorstreept: het hoorde bij het aanbod, maar plannen kan niet
 * meer. Een aanbod van voor de momenten heeft er geen; daar staat het oude
 * weekrooster als tekst in de opmerking.
 */
function ProposedMomentsView({ nl, request }: { nl: boolean; request: PalPlusRequestView }) {
  if (request.moments.length === 0 && !request.availabilityNote) return null;
  return (
    <div>
      <p className="vtk-palplus-label">{nl ? "Kan de sessie geven op" : "Can give the session on"}</p>
      {request.moments.length > 0 && (
        <ul className="pp-moments-read vtk-palplus-text">
          {request.moments.map((moment) => (
            <li key={`${moment.date}-${moment.startTime}-${moment.endTime}`} data-past={moment.past ? "true" : undefined}>
              {moment.label}
              {moment.past && <span className="sr-only">{nl ? " (voorbij)" : " (passed)"}</span>}
            </li>
          ))}
        </ul>
      )}
      {request.availabilityNote && (
        <div className="vtk-palplus-text mt-2 whitespace-pre-line">{request.availabilityNote}</div>
      )}
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
