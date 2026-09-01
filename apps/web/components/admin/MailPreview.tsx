/**
 * Hoe een mail eruitziet zodra ze verstuurd is.
 *
 * Een sjabloon bewerken gebeurt in een tekstvak met `{placeholders}` erin, en
 * dat is precies niet wat de ontvanger krijgt. Dit paneel zet de ingevulde
 * versie ernaast, in de vorm van een bericht in een mailbox: van, aan,
 * onderwerp, bijlage, en de tekst met haar witregels bewaard.
 *
 * Bewust één component voor alle beheerschermen die mails versturen
 * (lesbezoeken, rekeningen, Theokot-verhuur). Anders krijgt elk scherm zijn
 * eigen idee van hoe een voorbeeld eruitziet, en dan verschilt het voorbeeld
 * meer van de andere schermen dan van de echte mail.
 *
 * Server- en clientcomponenten mogen dit allebei renderen: er zit geen state in.
 */

import { remainingPlaceholders } from "@/lib/mailPreview";

export type MailPreviewProps = {
  nl: boolean;
  /** De afzender zoals ze in de inbox staat, bv. "VTK Onderwijs <lesbezoeken@vtk.be>". */
  from: string;
  to: string;
  cc?: string | null;
  replyTo?: string | null;
  subject: string;
  body: string;
  /** Bestandsnamen van de bijlagen die meegaan. */
  attachments?: string[];
  /**
   * Waar de ingevulde waarden vandaan komen ("voorbeeldgegevens" of "deze
   * aanvraag"). Zonder dat leest een voorbeeld met verzonnen namen als een fout.
   */
  source?: string;
  className?: string;
};

export function MailPreview({
  nl,
  from,
  to,
  cc,
  replyTo,
  subject,
  body,
  attachments = [],
  source,
  className,
}: MailPreviewProps) {
  const open = remainingPlaceholders(`${subject}\n${body}`);

  return (
    <figure className={`vtk-mail-preview${className ? ` ${className}` : ""}`}>
      <figcaption className="vtk-mail-preview-caption">
        <span>{nl ? "Zo komt de mail aan" : "How the email arrives"}</span>
        {source ? <span className="vtk-mail-preview-source">{source}</span> : null}
      </figcaption>

      <div className="vtk-mail-preview-frame">
        <dl className="vtk-mail-preview-head">
          <div>
            <dt>{nl ? "Van" : "From"}</dt>
            <dd>{from}</dd>
          </div>
          <div>
            <dt>{nl ? "Aan" : "To"}</dt>
            <dd>{to || (nl ? "— nog geen ontvanger —" : "— no recipient yet —")}</dd>
          </div>
          {cc ? (
            <div>
              <dt>Cc</dt>
              <dd>{cc}</dd>
            </div>
          ) : null}
          {replyTo ? (
            <div>
              <dt>{nl ? "Antwoord naar" : "Reply-to"}</dt>
              <dd>{replyTo}</dd>
            </div>
          ) : null}
          <div>
            <dt>{nl ? "Onderwerp" : "Subject"}</dt>
            <dd className="vtk-mail-preview-subject">
              {subject || (nl ? "— geen onderwerp —" : "— no subject —")}
            </dd>
          </div>
        </dl>

        <div className="vtk-mail-preview-body">{body}</div>

        {attachments.length > 0 ? (
          <ul className="vtk-mail-preview-attachments">
            {attachments.map((name) => (
              <li key={name}>
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                {name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {open.length > 0 ? (
        <p className="vtk-mail-preview-warning">
          {nl
            ? "Deze plaatshouders blijven staan zoals ze zijn; ze bestaan niet of hebben hier geen waarde: "
            : "These placeholders stay as they are; they do not exist or have no value here: "}
          {open.map((name) => (
            <code key={name}>{`{${name}}`}</code>
          ))}
        </p>
      ) : null}
    </figure>
  );
}
