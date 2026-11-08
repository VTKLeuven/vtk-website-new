"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Select } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@/components/ui/icons";
import { SaveForm } from "@/components/ui/SaveForm";
import { PocPollPanel } from "@/components/editorial/PocPollPanel";
import { savePocPollAction } from "@/app/actions/poc-polls";
import { pollAdminErrors } from "@/lib/pocPolls/adminCopy";
import type { PollQuestionKind } from "@/lib/pocPolls/core";
import { pollPanelText, type PollPanelData, type PollPanelLabels } from "@/lib/pocPolls/copy";
import { MAX_POLL_QUESTIONS, parseBrusselsInput } from "@/lib/pocPolls/draft";
import { saveOk } from "@/lib/saveState";

type BuilderQuestion = { key: number; kind: PollQuestionKind; text: string; low: string; high: string };

export type PollBuilderPoc = {
  id: string;
  name: string;
  hasProgramme: boolean;
  reach: number;
  perYear: Record<string, number>;
};

export type PollBuilderInitial = {
  id: string | null;
  pocId: string;
  title: string;
  closesAt: string;
  meetingDate: string;
  studyYears: string[];
  discordChannelId: string;
  questions: Array<Omit<BuilderQuestion, "key">>;
};

function kindLabels(nl: boolean): Array<{ kind: PollQuestionKind; label: string }> {
  return [
    { kind: "YES_NO", label: nl ? "Ja of nee" : "Yes or no" },
    { kind: "SCORE", label: nl ? "Score van 1 tot 5" : "Score from 1 to 5" },
    { kind: "OPEN", label: nl ? "Open vraag" : "Open question" },
  ];
}

/** Het opstelscherm: één vraag per rij, en de planning eromheen. */
export function PollBuilder({
  locale,
  initial,
  pocs,
  phases,
  channels,
  panelLabels,
}: {
  locale: "nl" | "en";
  initial: PollBuilderInitial;
  pocs: PollBuilderPoc[];
  phases: Array<{ key: string; label: string }>;
  /** `null`: de Discord-bot is niet ingesteld of niet bereikbaar. */
  channels: Array<{ id: string; name: string }> | null;
  panelLabels: PollPanelLabels;
}) {
  const nl = locale === "nl";
  const [nextKey, setNextKey] = useState(initial.questions.length + 1);
  const [questions, setQuestions] = useState<BuilderQuestion[]>(
    initial.questions.map((question, index) => ({ ...question, key: index + 1 })),
  );
  const [title, setTitle] = useState(initial.title);
  const [closesAt, setClosesAt] = useState(initial.closesAt);
  const [meetingDate, setMeetingDate] = useState(initial.meetingDate);
  const [pocId, setPocId] = useState(initial.pocId);
  const [showPreview, setShowPreview] = useState(false);

  const poc = pocs.find((candidate) => candidate.id === pocId) ?? pocs[0];

  function update(key: number, patch: Partial<BuilderQuestion>) {
    setQuestions((current) => current.map((question) => (question.key === key ? { ...question, ...patch } : question)));
  }

  function move(index: number, delta: number) {
    setQuestions((current) => {
      const next = [...current];
      const [question] = next.splice(index, 1);
      next.splice(index + delta, 0, question);
      return next;
    });
  }

  function add() {
    setQuestions((current) => [...current, { key: nextKey, kind: "YES_NO", text: "", low: "", high: "" }]);
    setNextKey((key) => key + 1);
  }

  const serialized = JSON.stringify(questions.map(({ kind, text, low, high }) => ({ kind, text, low, high })));
  const closesDate = parseBrusselsInput(closesAt);
  const previewData: PollPanelData = {
    id: "voorbeeld",
    title: title || (nl ? "Titel van de peiling" : "Poll title"),
    ...pollPanelText({
      locale,
      meetingDate: meetingDate || null,
      closesAt: (closesDate ?? new Date()).toISOString(),
      now: new Date(),
    }),
    answered: false,
    questions: questions
      .filter((question) => question.text.trim())
      .map((question) => ({
        id: String(question.key),
        kind: question.kind,
        text: question.text,
        low: question.low || null,
        high: question.high || null,
      })),
    answers: {},
  };

  return (
    <>
    <SaveForm
      action={savePocPollAction}
      submitLabel={nl ? "Publiceren" : "Publish"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Concept opgeslagen." : "Draft saved."}
      errorMessages={pollAdminErrors(nl)}
      fallbackErrorMessage={nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."}
      resetOnSuccess={false}
      confirmSubmit={{
        title: nl ? "Deze peiling publiceren?" : "Publish this poll?",
        description: nl
          ? `De peiling gaat meteen open voor de studenten van ${poc?.name ?? "je POC"}${initial.discordChannelId || channels ? " en verschijnt in het gekozen Discord-kanaal" : ""}. Daarna liggen de vragen vast, zodat alle antwoorden over dezelfde vraag gaan.`
          : `The poll opens immediately for the students of ${poc?.name ?? "your POC"}. After that the questions are locked, so all answers are about the same question.`,
        confirmLabel: nl ? "Publiceren" : "Publish",
        cancelLabel: nl ? "Annuleren" : "Cancel",
      }}
      secondarySubmit={{ name: "intent", value: "draft", label: nl ? "Bewaar als concept" : "Save as draft" }}
      className="space-y-5"
      footer={({ submitButton, secondaryButtons, confirmDialog }) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-[16rem] flex-1 text-sm text-vtk-muted">
              {nl
                ? "Na publiceren liggen de vragen vast, zodat alle antwoorden over dezelfde vraag gaan."
                : "After publishing the questions are locked, so all answers are about the same question."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowPreview((open) => !open)}>
                {showPreview ? (nl ? "Verberg voorbeeld" : "Hide preview") : nl ? "Voorbeeld" : "Preview"}
              </Button>
              {secondaryButtons}
              {submitButton}
            </div>
          </div>
          {confirmDialog}
        </div>
      )}
    >
      <input type="hidden" name="locale" value={locale} />
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="questions" value={serialized} />

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">{nl ? "Over deze peiling" : "About this poll"}</h2>
        {pocs.length > 1 && !initial.id ? (
          <div>
            <Label htmlFor="poll-poc">POC</Label>
            <Select id="poll-poc" name="pocId" value={pocId} onChange={(event) => setPocId(event.target.value)}>
              {pocs.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <input type="hidden" name="pocId" value={pocId} />
        )}
        <div>
          <Label htmlFor="poll-title">{nl ? "Titel" : "Title"}</Label>
          <Input id="poll-title" name="title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="poll-closes">{nl ? "Open tot" : "Open until"}</Label>
            <Input id="poll-closes" name="closesAt" type="datetime-local" required value={closesAt} onChange={(event) => setClosesAt(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="poll-meeting">{nl ? "Besproken op de POC van, optioneel" : "Discussed at the POC of, optional"}</Label>
            <Input id="poll-meeting" name="meetingDate" type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold">{nl ? "Vragen" : "Questions"}</h2>
          <span className="text-sm tabular-nums text-vtk-muted">
            {nl ? `${questions.length} van maximaal ${MAX_POLL_QUESTIONS}` : `${questions.length} of at most ${MAX_POLL_QUESTIONS}`}
          </span>
        </div>

        <div className="mt-3 divide-y divide-vtk-blue/10 border-y border-vtk-blue/10">
          {questions.map((question, index) => (
            <div key={question.key} className="space-y-3 py-4">
              <div className="flex items-center gap-1">
                <Input
                  aria-label={nl ? `Vraag ${index + 1}` : `Question ${index + 1}`}
                  placeholder={nl ? "Typ de vraag of stelling" : "Type the question or statement"}
                  maxLength={200}
                  value={question.text}
                  onChange={(event) => update(question.key, { text: event.target.value })}
                />
                <IconButton type="button" label={nl ? "Omhoog" : "Move up"} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUpIcon />
                </IconButton>
                <IconButton type="button" label={nl ? "Omlaag" : "Move down"} disabled={index === questions.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDownIcon />
                </IconButton>
                <IconButton
                  type="button"
                  label={nl ? "Verwijderen" : "Remove"}
                  srLabel={`${nl ? "Verwijderen" : "Remove"}: ${question.text || index + 1}`}
                  onClick={() => setQuestions((current) => current.filter((other) => other.key !== question.key))}
                >
                  <TrashIcon />
                </IconButton>
              </div>
              <div role="group" aria-label={nl ? "Soort vraag" : "Question type"} className="inline-flex flex-wrap gap-0.5 rounded-full border border-vtk-blue/20 p-0.5">
                {kindLabels(nl).map(({ kind, label }) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={question.kind === kind}
                    onClick={() => update(question.key, { kind })}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] ${question.kind === kind ? "bg-vtk-yellow font-semibold text-vtk-ink" : "font-medium text-vtk-ink hover:bg-vtk-blue-soft/70"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {question.kind === "SCORE" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`low-${question.key}`}>{nl ? "Betekenis van 1, optioneel" : "Meaning of 1, optional"}</Label>
                    <Input id={`low-${question.key}`} maxLength={40} placeholder={panelLabels.defaultLow} value={question.low} onChange={(event) => update(question.key, { low: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor={`high-${question.key}`}>{nl ? "Betekenis van 5, optioneel" : "Meaning of 5, optional"}</Label>
                    <Input id={`high-${question.key}`} maxLength={40} placeholder={panelLabels.defaultHigh} value={question.high} onChange={(event) => update(question.key, { high: event.target.value })} />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-3">
          <Button type="button" variant="ghost" onClick={add} disabled={questions.length >= MAX_POLL_QUESTIONS}>
            {nl ? "Vraag toevoegen" : "Add question"}
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold">{nl ? "Voor wie" : "For whom"}</h2>
          <p className="text-sm text-vtk-body">
            {poc?.hasProgramme
              ? nl
                ? `${poc.reach} studenten van ${poc.name}.`
                : `${poc.reach} students of ${poc.name}.`
              : nl
                ? "Deze POC hangt nog aan geen richting. Vraag VTK Onderwijs dat in te stellen in /admin/pocs; tot dan kan je niet publiceren."
                : "This POC is not linked to a programme yet. Ask VTK Onderwijs to set that up in /admin/pocs; until then you cannot publish."}
          </p>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{nl ? "Fases" : "Phases"}</legend>
            <div className="flex flex-wrap gap-1.5">
              {phases.map((phase) => (
                <label key={phase.key} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-vtk-blue/20 px-3 py-1.5 text-[13px] font-medium">
                  <input type="checkbox" name="studyYears" value={phase.key} defaultChecked={initial.studyYears.includes(phase.key)} />
                  {phase.label}
                  {poc ? <span className="tabular-nums text-vtk-muted">{poc.perYear[phase.key] ?? 0}</span> : null}
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-vtk-muted">
              {nl ? "Niets aangevinkt: de hele richting." : "Nothing ticked: the whole programme."}
            </p>
          </fieldset>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold">{nl ? "Waar verschijnt ze" : "Where it appears"}</h2>
          <p className="text-sm text-vtk-body">
            {nl
              ? "Op de website: bovenaan elke pagina en bij je POC op de homepage, enkel voor studenten van je richting."
              : "On the website: at the top of every page and at your POC on the homepage, only for students of your programme."}
          </p>
          {channels ? (
            <div>
              <Label htmlFor="poll-channel">{nl ? "Ook op Discord, optioneel" : "Also on Discord, optional"}</Label>
              <Select id="poll-channel" name="discordChannelId" defaultValue={initial.discordChannelId}>
                <option value="">{nl ? "Niet op Discord" : "Not on Discord"}</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <p className="text-sm text-vtk-muted">
              {nl
                ? "Discord is nog niet gekoppeld aan de site; de peiling komt enkel op de website."
                : "Discord is not connected to the site yet; the poll only appears on the website."}
            </p>
          )}
        </Card>
      </div>
    </SaveForm>

    {/* Buiten het formulier: het voorbeeld heeft zelf een formulier. */}
    {showPreview ? (
      <div className="vtk-admin-preview mt-5 rounded-2xl p-5" style={{ background: "var(--navy)" }}>
        <PocPollPanel key={serialized} poll={previewData} labels={panelLabels} action={async () => saveOk()} />
      </div>
    ) : null}
    </>
  );
}
