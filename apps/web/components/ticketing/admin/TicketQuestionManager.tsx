import {
  archiveTicketQuestionAction,
  createTicketQuestionAction,
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
  return (
    <section className="ticket-admin-section">
      <div className="ticket-admin-section-head">
        <div className="ticket-admin-section-heading">
          <span className="ticket-admin-section-icon"><ListChecks aria-hidden="true" size={17} /></span>
          <div>
          <h2>{locale === "nl" ? "Vragen aan deelnemers" : "Attendee questions"}</h2>
          <p>
            {locale === "nl"
              ? "Globale vragen gelden voor ieder ticket; optioneel koppel je een vraag aan één type."
              : "Global questions apply to every ticket; optionally limit a question to one type."}
          </p>
          </div>
        </div>
      </div>
      {questions.length === 0 ? (
        <p className="ticket-admin-empty">{locale === "nl" ? "Nog geen vragen." : "No questions yet."}</p>
      ) : (
        <ul className="ticket-admin-list">
          {questions.map((question) => (
            <li key={question.id}>
              <div className="ticket-admin-row-head">
                <div>
                  <p className="ticket-admin-row-title">
                    {locale === "en" && question.labelEn ? question.labelEn : question.labelNl}
                  </p>
                  <p className="ticket-admin-row-meta">
                    {question.type.replaceAll("_", " ").toLowerCase()} · {question.required ? (locale === "nl" ? "Verplicht" : "Required") : (locale === "nl" ? "Optioneel" : "Optional")} · {question.ticketType ? question.ticketType.nameNl : (locale === "nl" ? "Alle tickettypes" : "All ticket types")}
                  </p>
                  <p className="ticket-admin-row-meta ticket-admin-code">{question.code}</p>
                </div>
                {question.active ? (
                  <form action={archiveTicketQuestionAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="eventId" value={eventId} />
                    <input type="hidden" name="questionId" value={question.id} />
                    <button className="ticket-admin-button" data-variant="danger" type="submit">
                      <Archive aria-hidden="true" size={15} />
                      {locale === "nl" ? "Archiveren" : "Archive"}
                    </button>
                  </form>
                ) : (
                  <span className="ticket-admin-status" data-tone="neutral">
                    {locale === "nl" ? "Gearchiveerd" : "Archived"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <hr className="ticket-admin-divider" />
      <details className="ticket-admin-details">
        <summary>{locale === "nl" ? "Vraag toevoegen" : "Add question"}</summary>
        <div className="ticket-admin-details-body">
          <form action={createTicketQuestionAction} className="ticket-admin-form">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="eventId" value={eventId} />
            <div className="ticket-admin-form-grid">
              <div className="ticket-admin-field">
                <label htmlFor="question-label-nl">Vraag (NL)</label>
                <input id="question-label-nl" name="labelNl" required />
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="question-label-en">Vraag (EN)</label>
                <input id="question-label-en" name="labelEn" />
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="question-code">Code</label>
                <input id="question-code" name="code" placeholder="DIET" required />
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="question-type">Type</label>
                <select id="question-type" name="type" defaultValue="SHORT_TEXT">
                  <option value="SHORT_TEXT">{locale === "nl" ? "Korte tekst" : "Short text"}</option>
                  <option value="LONG_TEXT">{locale === "nl" ? "Lange tekst" : "Long text"}</option>
                  <option value="SINGLE_CHOICE">{locale === "nl" ? "Eén keuze" : "Single choice"}</option>
                  <option value="MULTIPLE_CHOICE">{locale === "nl" ? "Meerdere keuzes" : "Multiple choice"}</option>
                  <option value="BOOLEAN">{locale === "nl" ? "Ja / nee" : "Yes / no"}</option>
                </select>
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="question-ticket-type">Tickettype</label>
                <select id="question-ticket-type" name="ticketTypeId" defaultValue="">
                  <option value="">{locale === "nl" ? "Alle tickettypes" : "All ticket types"}</option>
                  {ticketTypes.filter((ticketType) => ticketType.active).map((ticketType) => (
                    <option key={ticketType.id} value={ticketType.id}>
                      {locale === "en" && ticketType.nameEn ? ticketType.nameEn : ticketType.nameNl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ticket-admin-field">
                <label htmlFor="question-sort">{locale === "nl" ? "Volgorde" : "Order"}</label>
                <input id="question-sort" name="sortOrder" type="number" defaultValue="0" />
              </div>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="question-description-nl">Toelichting (NL)</label>
                <textarea id="question-description-nl" name="descriptionNl" rows={2} />
              </div>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="question-description-en">Toelichting (EN)</label>
                <textarea id="question-description-en" name="descriptionEn" rows={2} />
              </div>
              <div className="ticket-admin-field" data-span="2">
                <label htmlFor="question-options">
                  {locale === "nl" ? "Keuzeopties" : "Choice options"}
                </label>
                <textarea
                  id="question-options"
                  name="options"
                  rows={4}
                  placeholder={locale === "nl" ? "Eén optie per regel" : "One option per line"}
                />
                <span className="ticket-admin-help">
                  {locale === "nl"
                    ? "Alleen nodig bij één of meerdere keuzes."
                    : "Only needed for single or multiple choice."}
                </span>
              </div>
            </div>
            <label className="ticket-admin-check">
              <input type="checkbox" name="required" value="true" />
              {locale === "nl" ? "Verplicht invullen" : "Required"}
            </label>
            <button className="ticket-admin-button" data-variant="primary" type="submit">
              <Plus aria-hidden="true" size={16} />
              {locale === "nl" ? "Vraag toevoegen" : "Add question"}
            </button>
          </form>
        </div>
      </details>
    </section>
  );
}
