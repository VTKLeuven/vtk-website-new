"use client";

import { useRef, useState, useTransition } from "react";
import {
  archiveTicketQuestionAction,
  createTicketQuestionAction,
  reorderTicketQuestionsAction,
} from "@/app/actions/tickets";
import { Archive, ListChecks, Plus } from "lucide-react";
import type { AdminLocale } from "./format";

type Question = {
  id: string;
  code: string;
  labelNl: string;
  labelEn: string | null;
  type: string;
  required: boolean;
  active: boolean;
  sortOrder?: number;
  ticketType: { id: string; nameNl: string; nameEn: string | null } | null;
};

type TicketTypeOption = {
  id: string;
  nameNl: string;
  nameEn: string | null;
  active: boolean;
};

/**
 * Wat voor soort antwoord je vraagt. Dit is de eerste beslissing, dus staat ze
 * als drie kaartjes bovenaan in plaats van als vijf regels in een keuzelijst
 * ("Korte tekst / Lange tekst / Eén keuze / Meerdere keuzes / Ja / nee"): daar
 * moest je zelf uit afleiden dat twee ervan om een lijst opties vroegen en de
 * andere drie niet, terwijl het optieveld altijd zichtbaar was met een
 * voetnootje "alleen nodig bij één of meerdere keuzes".
 */
type AnswerKind = "TEXT" | "CHOICE" | "BOOLEAN";

const KINDS: Array<{ kind: AnswerKind; nl: [string, string]; en: [string, string] }> = [
  {
    kind: "TEXT",
    nl: ["Open antwoord", "De deelnemer typt zelf iets, bv. allergieën."],
    en: ["Open answer", "The attendee types something, e.g. allergies."],
  },
  {
    kind: "CHOICE",
    nl: ["Keuze uit opties", "De deelnemer kiest uit een lijst die jij opgeeft."],
    en: ["Pick from options", "The attendee picks from a list you provide."],
  },
  {
    kind: "BOOLEAN",
    nl: ["Ja of nee", "Eén vraag om te bevestigen, bv. vegetarisch."],
    en: ["Yes or no", "A single confirmation, e.g. vegetarian."],
  },
];

/** De opgeslagen `type`-waarde volgt uit het soort plus de verfijning erbij. */
function questionType(kind: AnswerKind, longText: boolean, multiple: boolean): string {
  if (kind === "BOOLEAN") return "BOOLEAN";
  if (kind === "CHOICE") return multiple ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE";
  return longText ? "LONG_TEXT" : "SHORT_TEXT";
}

export function TicketQuestionManager({
  eventId,
  questions,
  ticketTypes,
  locale,
}: {
  eventId: string;
  questions: Question[];
  ticketTypes: TicketTypeOption[];
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const [kind, setKind] = useState<AnswerKind>("TEXT");
  const [longText, setLongText] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [prevQuestions, setPrevQuestions] = useState<Question[]>(questions);
  const [items, setItems] = useState<Question[]>(questions);
  const [, startTransition] = useTransition();

  if (questions !== prevQuestions) {
    setPrevQuestions(questions);
    setItems(questions);
  }

  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("eventId", eventId);
      fd.set("locale", locale);
      for (const q of next) fd.append("ids", q.id);
      await reorderTicketQuestionsAction(fd);
    });
  }

  return (
    <section className="ticket-admin-section">
      <div className="ticket-admin-section-head">
        <div className="ticket-admin-section-heading">
          <span className="ticket-admin-section-icon"><ListChecks aria-hidden="true" size={17} /></span>
          <div>
          <h2>{nl ? "Vragen aan deelnemers" : "Attendee questions"}</h2>
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="ticket-admin-empty">{nl ? "Nog geen vragen." : "No questions yet."}</p>
      ) : (
        <ul className="ticket-admin-list">
          {items.map((question, index) => (
            <li
              key={question.id}
              draggable
              onDragStart={() => {
                dragFrom.current = index;
              }}
              onDragEnd={() => {
                dragFrom.current = null;
                setOverIndex(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIndex !== index) setOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(index);
              }}
              className={`transition-colors rounded-xl ${
                overIndex === index ? "bg-vtk-yellow/20" : ""
              }`}
            >
              <div className="ticket-admin-row-head">
                <div className="flex items-start gap-2">
                  <span
                    className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-700 px-1 text-base select-none mt-0.5"
                    title={nl ? "Sleep om volgorde te wijzigen" : "Drag to reorder"}
                    aria-hidden="true"
                  >
                    ⠿
                  </span>
                  <div>
                    <p className="ticket-admin-row-title">
                      {locale === "en" && question.labelEn ? question.labelEn : question.labelNl}
                    </p>
                    <p className="ticket-admin-row-meta">
                      {question.type.replaceAll("_", " ").toLowerCase()} · {question.required ? (nl ? "Verplicht" : "Required") : (nl ? "Optioneel" : "Optional")} · {question.ticketType ? question.ticketType.nameNl : (nl ? "Alle tickettypes" : "All ticket types")}
                    </p>
                    <p className="ticket-admin-row-meta ticket-admin-code">{question.code}</p>
                  </div>
                </div>
                {question.active ? (
                  <form action={archiveTicketQuestionAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="eventId" value={eventId} />
                    <input type="hidden" name="questionId" value={question.id} />
                    <button className="ticket-admin-button" data-variant="danger" type="submit">
                      <Archive aria-hidden="true" size={15} />
                      {nl ? "Archiveren" : "Archive"}
                    </button>
                  </form>
                ) : (
                  <span className="ticket-admin-status" data-tone="neutral">
                    {nl ? "Gearchiveerd" : "Archived"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <hr className="ticket-admin-divider" />
      <details className="ticket-admin-details">
        <summary>{nl ? "Vraag toevoegen" : "Add question"}</summary>
        <div className="ticket-admin-details-body">
          <form action={createTicketQuestionAction} className="ticket-admin-form">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="eventId" value={eventId} />
            {/* De action leidt de code af uit het label wanneer er geen wordt
                meegegeven, dus we vragen die niet meer: `DIET` intikken zei de
                gebruiker niets en de waarde is nergens zichtbaar. */}
            <input type="hidden" name="type" value={questionType(kind, longText, multiple)} />

            <div className="ticket-admin-form-grid">
              <div className="ticket-admin-field">
                <label htmlFor="question-label-nl">{nl ? "Vraag (NL)" : "Question (NL)"}</label>
                <input
                  id="question-label-nl"
                  name="labelNl"
                  placeholder={nl ? "Heb je allergieën?" : "Do you have any allergies?"}
                  required
                />
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="question-label-en">{nl ? "Vraag (EN)" : "Question (EN)"}</label>
                <input id="question-label-en" name="labelEn" />
              </div>
            </div>

            <fieldset className="ticket-admin-choice-set">
              <legend>{nl ? "Hoe antwoordt de deelnemer?" : "How does the attendee answer?"}</legend>
              <div className="ticket-admin-choice-grid">
                {KINDS.map((option) => {
                  const [title, help] = nl ? option.nl : option.en;
                  return (
                    <label
                      key={option.kind}
                      className="ticket-admin-choice"
                      data-selected={kind === option.kind}
                    >
                      <input
                        type="radio"
                        name="answerKind"
                        value={option.kind}
                        checked={kind === option.kind}
                        onChange={() => setKind(option.kind)}
                      />
                      <span>
                        <strong>{title}</strong>
                        <small>{help}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Enkel de verfijning die bij het gekozen soort hoort. Zo staat er
                nooit een optieveld op het scherm bij een open vraag. */}
            {kind === "TEXT" ? (
              <label className="ticket-admin-check">
                <input
                  type="checkbox"
                  checked={longText}
                  onChange={(event) => setLongText(event.target.checked)}
                />
                {nl
                  ? "Meerdere regels (voor een langer antwoord)"
                  : "Multiple lines (for a longer answer)"}
              </label>
            ) : null}

            {kind === "CHOICE" ? (
              <div className="ticket-admin-form-grid">
                <div className="ticket-admin-field" data-span="2">
                  <label htmlFor="question-options">{nl ? "De opties" : "The options"}</label>
                  <textarea
                    id="question-options"
                    name="options"
                    rows={4}
                    required
                    placeholder={
                      nl
                        ? "Eén optie per regel, bijvoorbeeld:\nVegetarisch\nVeganistisch\nGeen voorkeur"
                        : "One option per line, for example:\nVegetarian\nVegan\nNo preference"
                    }
                  />
                  <span className="ticket-admin-help">
                    {nl ? "Minstens twee opties." : "At least two options."}
                  </span>
                </div>
                <div className="ticket-admin-field" data-span="2">
                  <label className="ticket-admin-check">
                    <input
                      type="checkbox"
                      checked={multiple}
                      onChange={(event) => setMultiple(event.target.checked)}
                    />
                    {nl
                      ? "De deelnemer mag meerdere opties aanduiden"
                      : "The attendee may pick several options"}
                  </label>
                </div>
              </div>
            ) : null}

            <div className="ticket-admin-form-grid">
              <div className="ticket-admin-field">
                <label htmlFor="question-ticket-type">
                  {nl ? "Geldt voor" : "Applies to"}
                </label>
                <select id="question-ticket-type" name="ticketTypeId" defaultValue="">
                  <option value="">{nl ? "Alle tickettypes" : "All ticket types"}</option>
                  {ticketTypes.filter((ticketType) => ticketType.active).map((ticketType) => (
                    <option key={ticketType.id} value={ticketType.id}>
                      {locale === "en" && ticketType.nameEn ? ticketType.nameEn : ticketType.nameNl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="question-description-nl">
                  {nl ? "Toelichting (NL)" : "Explanation (NL)"}
                </label>
                <textarea id="question-description-nl" name="descriptionNl" rows={2} />
              </div>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="question-description-en">
                  {nl ? "Toelichting (EN)" : "Explanation (EN)"}
                </label>
                <textarea id="question-description-en" name="descriptionEn" rows={2} />
              </div>
            </div>

            <label className="ticket-admin-check">
              <input type="checkbox" name="required" value="true" />
              {nl ? "Verplicht invullen" : "Required"}
            </label>
            <button className="ticket-admin-button" data-variant="primary" type="submit">
              <Plus aria-hidden="true" size={16} />
              {nl ? "Vraag toevoegen" : "Add question"}
            </button>
          </form>
        </div>
      </details>
    </section>
  );
}
