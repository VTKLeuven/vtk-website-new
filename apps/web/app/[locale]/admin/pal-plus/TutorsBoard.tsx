"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { Modal } from "../admin-table";
import { correctPalPlusRewardAction } from "@/app/actions/palPlus";
import {
  PAL_PLUS_FULL_MEMBER_SESSIONS,
  PAL_PLUS_LIMITS,
  PAL_PLUS_MAX_REWARD,
  parsePalPlusRewardAmount,
  type PalPlusSessionState,
} from "@/lib/palPlus";
import { palPlusSessionErrors } from "@/lib/palPlusMessages";

export type TutorSessionView = {
  sessionId: string;
  courseLabel: string;
  whenLabel: string;
  state: PalPlusSessionState;
  hours: number;
  /** De opgeslagen beloning (de regel, of de correctie). */
  reward: number;
  /** Wat de sessie echt oplevert: nul als ze geannuleerd is of in een praesidiumjaar viel. */
  earned: number;
  rewardPaid: number;
  correction: { note: string | null; label: string } | null;
  attendance: { came: number; notCame: number; open: number; total: number };
};

export type TutorView = {
  userId: string;
  name: string;
  email: string;
  given: number;
  upcoming: number;
  hours: number;
  earned: number;
  paid: number;
  praesidium: boolean;
  attendance: { came: number; open: number; total: number };
  sessions: TutorSessionView[];
};

/**
 * Wie dit werkingsjaar PAL+-sessies gaf: hoeveel, hoeveel uur, welke bonnetjes
 * en wie er kwam. Vijf gegeven sessies is een volwaardig PAL-lid; dat is
 * voorlopig enkel een markering. Enkel zichtbaar voor Onderwijs.
 */
export function TutorsBoard({ nl, tutors }: { nl: boolean; tutors: TutorView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = tutors.find((tutor) => tutor.userId === selectedId) ?? null;
  const fmt = (value: number) => value.toLocaleString(nl ? "nl-BE" : "en-GB", { maximumFractionDigits: 1 });

  return (
    <Card className="p-5">
      <p className="mb-4 text-sm text-vtk-muted">
        {nl
          ? `Enkel sessies die voorbij zijn en niet geannuleerd tellen als gegeven. Vanaf ${PAL_PLUS_FULL_MEMBER_SESSIONS} gegeven sessies is iemand een volwaardig PAL-lid.`
          : `Only sessions that are over and not cancelled count as given. From ${PAL_PLUS_FULL_MEMBER_SESSIONS} given sessions someone is a full PAL member.`}
      </p>
      {tutors.length === 0 ? (
        <p className="text-sm text-vtk-muted">
          {nl ? "Dit werkingsjaar gaf nog niemand een sessie." : "Nobody gave a session this working year yet."}
        </p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="vtk-palplus-table">
            <thead>
              <tr>
                <th scope="col">{nl ? "Tutor" : "Tutor"}</th>
                <th scope="col" className="is-num">
                  {nl ? "Gegeven" : "Given"}
                </th>
                <th scope="col" className="is-num">
                  {nl ? "Uren" : "Hours"}
                </th>
                <th scope="col" className="is-num">
                  {nl ? "Bonnetjes" : "Vouchers"}
                </th>
                <th scope="col" className="is-num">
                  {nl ? "Kwamen" : "Came"}
                </th>
              </tr>
            </thead>
            <tbody>
              {tutors.map((tutor) => (
                <tr key={tutor.userId} className="vtk-palplus-row" onClick={() => setSelectedId(tutor.userId)}>
                  <th scope="row">
                    <button
                      type="button"
                      className="vtk-palplus-rowtitle"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(tutor.userId);
                      }}
                    >
                      {tutor.name}
                    </button>
                    {tutor.given >= PAL_PLUS_FULL_MEMBER_SESSIONS && (
                      <span className="vtk-palplus-full">{nl ? "Volwaardig PAL-lid" : "Full PAL member"}</span>
                    )}
                    {tutor.upcoming > 0 && (
                      <span className="vtk-palplus-sub">
                        {nl ? `${tutor.upcoming} gepland` : `${tutor.upcoming} planned`}
                      </span>
                    )}
                  </th>
                  <td data-label={nl ? "Gegeven" : "Given"} className="is-num">
                    {tutor.given}
                  </td>
                  <td data-label={nl ? "Uren" : "Hours"} className="is-num">
                    {fmt(tutor.hours)}
                  </td>
                  <td data-label={nl ? "Bonnetjes" : "Vouchers"} className="is-num">
                    {tutor.praesidium && tutor.earned === 0 ? (
                      <span className="text-vtk-muted">{nl ? "praesidium" : "praesidium"}</span>
                    ) : (
                      fmt(tutor.earned)
                    )}
                  </td>
                  <td data-label={nl ? "Kwamen" : "Came"} className="is-num">
                    {tutor.attendance.total === 0 ? (
                      <span className="text-vtk-muted">-</span>
                    ) : (
                      <>
                        {tutor.attendance.came} / {tutor.attendance.total}
                        {tutor.attendance.open > 0 && (
                          <span className="vtk-palplus-sub">
                            {nl ? `${tutor.attendance.open} niet aangeduid` : `${tutor.attendance.open} not marked`}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Modal title={selected.name} size="lg" onClose={() => setSelectedId(null)}>
          <TutorDetail nl={nl} tutor={selected} fmt={fmt} />
        </Modal>
      )}
    </Card>
  );
}

function TutorDetail({ nl, tutor, fmt }: { nl: boolean; tutor: TutorView; fmt: (value: number) => string }) {
  const [correcting, setCorrecting] = useState<string | null>(null);
  const stateLabel = (state: PalPlusSessionState) =>
    state === "cancelled"
      ? nl
        ? "geannuleerd"
        : "cancelled"
      : state === "past"
        ? nl
          ? "gegeven"
          : "given"
        : nl
          ? "gepland"
          : "planned";

  return (
    <div className="vtk-palplus-detail">
      <dl className="vtk-palplus-facts">
        <div>
          <dt>{nl ? "E-mail" : "Email"}</dt>
          <dd>
            <a className="underline underline-offset-2" href={`mailto:${tutor.email}`}>
              {tutor.email}
            </a>
          </dd>
        </div>
        <div>
          <dt>{nl ? "Gegeven" : "Given"}</dt>
          <dd>
            {tutor.given}
            {tutor.given >= PAL_PLUS_FULL_MEMBER_SESSIONS && (
              <span className="vtk-palplus-full">{nl ? "Volwaardig PAL-lid" : "Full PAL member"}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>{nl ? "Bonnetjes" : "Vouchers"}</dt>
          <dd>
            {fmt(tutor.earned)}
            <span className="vtk-palplus-sub">
              {nl ? `${fmt(tutor.paid)} al uitgegeven of uitbetaald` : `${fmt(tutor.paid)} already spent or paid out`}
            </span>
          </dd>
        </div>
      </dl>
      {tutor.praesidium && (
        <p className="text-sm text-vtk-muted">
          {nl
            ? "Sessies uit een werkingsjaar waarin deze tutor in het praesidium zat, tellen mee maar leveren geen bonnetjes op."
            : "Sessions from a working year in which this tutor was in the praesidium count, but earn no vouchers."}
        </p>
      )}

      <ul className="vtk-palplus-sessions">
        {tutor.sessions.map((session) => (
          <li key={session.sessionId} data-state={session.state}>
            <div className="vtk-palplus-session-head">
              <div>
                <div className="vtk-palplus-session-title">{session.courseLabel}</div>
                <span className="vtk-palplus-sub">
                  {session.whenLabel}, {stateLabel(session.state)}
                </span>
              </div>
              <div className="vtk-palplus-session-reward">
                {session.state === "cancelled" ? (
                  <span className="text-vtk-muted">{nl ? "geen bonnetjes" : "no vouchers"}</span>
                ) : (
                  <>
                    <strong>
                      {fmt(session.earned)} {nl ? (session.earned === 1 ? "bonnetje" : "bonnetjes") : session.earned === 1 ? "voucher" : "vouchers"}
                    </strong>
                    {session.earned !== session.reward && (
                      <span className="vtk-palplus-sub">{nl ? "praesidiumjaar" : "praesidium year"}</span>
                    )}
                    {session.rewardPaid > 0 && (
                      <span className="vtk-palplus-sub">
                        {nl ? `${fmt(session.rewardPaid)} uitgegeven` : `${fmt(session.rewardPaid)} spent`}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            {session.attendance.total > 0 && (
              <p className="vtk-palplus-sub">
                {nl
                  ? `${session.attendance.came} van ${session.attendance.total} kwamen${session.attendance.open > 0 ? `, ${session.attendance.open} niet aangeduid` : ""}`
                  : `${session.attendance.came} of ${session.attendance.total} came${session.attendance.open > 0 ? `, ${session.attendance.open} not marked` : ""}`}
              </p>
            )}
            {session.correction && (
              <div className="vtk-palplus-correction-note">
                <span>{session.correction.label}</span>
                {session.correction.note && <span>{session.correction.note}</span>}
              </div>
            )}
            {session.state !== "cancelled" &&
              (correcting === session.sessionId ? (
                <CorrectionForm
                  nl={nl}
                  tutor={tutor}
                  session={session}
                  fmt={fmt}
                  onDone={() => setCorrecting(null)}
                />
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setCorrecting(session.sessionId)}>
                  {nl ? "Beloning corrigeren" : "Correct reward"}
                </Button>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Een beloning met de hand aanpassen. De bevestiging zegt vooraf wat er met wat
 * al uitgegeven is gebeurt, want dat is het deel dat niemand verwacht.
 */
function CorrectionForm({
  nl,
  tutor,
  session,
  fmt,
  onDone,
}: {
  nl: boolean;
  tutor: TutorView;
  session: TutorSessionView;
  fmt: (value: number) => string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(session.reward).replace(".", nl ? "," : "."));
  const parsed = parsePalPlusRewardAmount(amount);
  const overspend = parsed !== null && session.rewardPaid > parsed ? session.rewardPaid - parsed : 0;

  return (
    <SaveForm
      action={correctPalPlusRewardAction}
      submitLabel={nl ? "Beloning opslaan" : "Save reward"}
      savingLabel={nl ? "Opslaan…" : "Saving…"}
      savedMessage={nl ? "Beloning aangepast." : "Reward corrected."}
      errorMessages={palPlusSessionErrors(nl)}
      fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
      resetOnSuccess={false}
      submitSize="sm"
      onSuccess={onDone}
      confirmSubmit={{
        title: nl ? "Beloning aanpassen?" : "Change reward?",
        description:
          overspend > 0
            ? nl
              ? `${tutor.name} gaf van deze sessie al ${fmt(session.rewardPaid)} uit. Het verschil van ${fmt(overspend)} komt uit de andere openstaande bonnetjes van deze tutor; wat daar niet in past, vervalt. Het saldo gaat nooit onder nul.`
              : `${tutor.name} already spent ${fmt(session.rewardPaid)} of this session. The difference of ${fmt(overspend)} comes out of the tutor's other outstanding vouchers; whatever does not fit is written off. The balance never goes below zero.`
            : nl
              ? `De beloning van ${tutor.name} voor deze sessie wordt ${parsed === null ? amount : fmt(parsed)}. Ze volgt daarna het moment van de sessie niet meer.`
              : `${tutor.name}'s reward for this session becomes ${parsed === null ? amount : fmt(parsed)}. It no longer follows the session's time afterwards.`,
        confirmLabel: nl ? "Aanpassen" : "Change",
        cancelLabel: nl ? "Annuleren" : "Cancel",
      }}
      className="vtk-palplus-correction"
    >
      <input type="hidden" name="sessionId" value={session.sessionId} />
      <input type="hidden" name="userId" value={tutor.userId} />
      <input type="hidden" name="locale" value={nl ? "nl" : "en"} />
      <div className="sm:max-w-40">
        <Label htmlFor={`pp-correct-${session.sessionId}`}>{nl ? "Bonnetjes" : "Vouchers"}</Label>
        <Input
          id={`pp-correct-${session.sessionId}`}
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
        <p className="mt-1 text-xs text-vtk-muted">
          {nl ? `In halve bonnetjes, 0 tot ${PAL_PLUS_MAX_REWARD}.` : `In half vouchers, 0 to ${PAL_PLUS_MAX_REWARD}.`}
        </p>
      </div>
      <div>
        <Label htmlFor={`pp-correct-note-${session.sessionId}`}>{nl ? "Waarom" : "Why"}</Label>
        <Textarea
          id={`pp-correct-note-${session.sessionId}`}
          name="note"
          rows={2}
          maxLength={PAL_PLUS_LIMITS.reviewNote}
          placeholder={nl ? "De tweede tutor was er niet." : "The second tutor did not show up."}
          required
        />
      </div>
      {overspend > 0 && (
        <div className="vtk-palplus-reward">
          {nl
            ? `Er is al ${fmt(session.rewardPaid)} van uitgegeven: ${fmt(overspend)} komt uit de andere bonnetjes van deze tutor, wat niet past vervalt.`
            : `${fmt(session.rewardPaid)} was already spent: ${fmt(overspend)} comes out of this tutor's other vouchers, whatever does not fit is written off.`}
        </div>
      )}
    </SaveForm>
  );
}
