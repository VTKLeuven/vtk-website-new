"use client";

import { useState } from "react";
import { LockIcon } from "@/components/ui/icons";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { MAX_OPEN_ANSWER_LENGTH, POLL_NO, POLL_SCORES, POLL_YES, pollFieldName } from "@/lib/pocPolls/core";
import type { PollPanelData, PollPanelLabels } from "@/lib/pocPolls/copy";

type Question = PollPanelData["questions"][number];

function Choice({ name, value, label, checked }: { name: string; value: number; label: string; checked: boolean }) {
  return (
    <label className="poc-poll-choice">
      <input type="radio" name={name} value={value} defaultChecked={checked} />
      <span>{label}</span>
    </label>
  );
}

function QuestionRow({
  question,
  answer,
  labels,
}: {
  question: Question;
  answer: PollPanelData["answers"][string] | undefined;
  labels: PollPanelLabels;
}) {
  const name = pollFieldName(question.id);

  if (question.kind === "OPEN") {
    return (
      <div className="poc-poll-row poc-poll-row-open">
        <label className="poc-poll-q" htmlFor={name}>
          {question.text} <span className="poc-poll-optional">{labels.optional}</span>
        </label>
        <textarea
          id={name}
          name={name}
          rows={2}
          maxLength={MAX_OPEN_ANSWER_LENGTH}
          placeholder={labels.placeholder}
          defaultValue={answer?.text ?? ""}
        />
      </div>
    );
  }

  const labelId = `${name}_label`;
  return (
    <div className="poc-poll-row">
      <div className="poc-poll-q" id={labelId}>
        {question.text}
      </div>
      {question.kind === "YES_NO" ? (
        <div className="poc-poll-choices" role="radiogroup" aria-labelledby={labelId}>
          <Choice name={name} value={POLL_YES} label={labels.yes} checked={answer?.value === POLL_YES} />
          <Choice name={name} value={POLL_NO} label={labels.no} checked={answer?.value === POLL_NO} />
        </div>
      ) : (
        <div className="poc-poll-scale">
          <div className="poc-poll-choices is-score" role="radiogroup" aria-labelledby={labelId}>
            {POLL_SCORES.map((score) => (
              <Choice key={score} name={name} value={score} label={String(score)} checked={answer?.value === score} />
            ))}
          </div>
          <div className="poc-poll-legend">
            <span>{question.low ?? labels.defaultLow}</span>
            <span>{question.high ?? labels.defaultHigh}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * De vragen van één peiling, allemaal tegelijk in de POC-band. Na het versturen
 * blijft enkel de bevestiging staan; een tussenstand is er bewust niet.
 */
export function PocPollPanel({
  poll,
  labels,
  action,
}: {
  poll: PollPanelData;
  labels: PollPanelLabels;
  action: SaveAction;
}) {
  const [editing, setEditing] = useState(!poll.answered);

  if (!editing) {
    return (
      <div className="poc-poll">
        <h4 className="poc-poll-title">{labels.thanksTitle}</h4>
        <p className="poc-poll-lead">{poll.thanks}</p>
        <button type="button" className="poc-poll-edit" onClick={() => setEditing(true)}>
          {labels.edit}
        </button>
      </div>
    );
  }

  return (
    <div className="poc-poll">
      <div className="poc-poll-head">
        <h4 className="poc-poll-title">{poll.title}</h4>
        <span>{poll.openUntil}</span>
      </div>
      <p className="poc-poll-lead">{poll.lead}</p>
      <SaveForm
        action={action}
        submitLabel={labels.submit}
        savingLabel={labels.submitting}
        savedMessage={labels.saved}
        errorMessages={labels.errors}
        fallbackErrorMessage={labels.fallbackError}
        resetOnSuccess={false}
        onSuccess={() => setEditing(false)}
        footer={({ submitButton, confirmDialog }) => (
          <div className="poc-poll-foot">
            <p>
              <LockIcon />
              {labels.anonymous}
            </p>
            {submitButton}
            {confirmDialog}
          </div>
        )}
      >
        <input type="hidden" name="pollId" value={poll.id} />
        {poll.questions.map((question) => (
          <QuestionRow key={question.id} question={question} answer={poll.answers[question.id]} labels={labels} />
        ))}
      </SaveForm>
    </div>
  );
}
