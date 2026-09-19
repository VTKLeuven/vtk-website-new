/**
 * De HTML-versie van een beheersmail.
 *
 * De sjablonen en het bewerkveld blijven platte tekst, en dat is bewust: wie een
 * mail naar een professor stuurt, leest ze eerst na en past er een zin in aan.
 * Een tekstvak met HTML erin zou dat onmogelijk maken, en het was precies langs
 * die weg dat er ooit `<table style="...">` bij een professor belandde.
 *
 * Maar de ondertekening hoort er wel opgemaakt uit te zien: het schild, de gele
 * streep, de naam. Daarom krijgt de mail twee delen. `text` is wat de beheerder
 * nakeek, `html` is diezelfde tekst met de echte handtekening eronder. Een
 * mailbox toont de opgemaakte versie; wie HTML blokkeert, houdt de leesbare.
 *
 * Puur, dus testbaar zonder mailserver: `test/mailBodyHtml.test.ts`.
 */

import { escapeHtml } from "@/lib/signature";

/** De twee vormen van de ondertekening, zoals `lib/mailSignature-server.ts` ze geeft. */
type Signature = { text: string; html: string };

/**
 * De tekst en de ondertekening uit elkaar halen.
 *
 * Elk voorbeeldscherm heeft dit nodig: de tekst toont het als tekst, de
 * ondertekening opgemaakt. Staat de ondertekening er niet in (weggehaald of
 * aangepast), dan is `signatureHtml` leeg en blijft alles tekst; er wordt nooit
 * een handtekening bijgetoond die niet in de mail zit.
 */
export function splitSignature(
  body: string,
  signature?: Signature,
): { text: string; signatureHtml: string | null } {
  const marker = signature?.text.trim() ?? "";
  const at = marker && body.includes(marker) ? body.indexOf(marker) : -1;
  if (at < 0) return { text: body, signatureHtml: null };
  return { text: body.slice(0, at).trimEnd(), signatureHtml: signature!.html };
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * De mail zoals ze in een mailbox getoond wordt.
 *
 * De platte ondertekening onderaan wordt vervangen door de opgemaakte. Staat ze
 * er niet in (de beheerder heeft ze weggehaald of aangepast), dan blijft de
 * tekst gewoon de tekst: er wordt niets bijgeplakt wat de afzender niet zag
 * staan in zijn voorbeeld.
 */
export function mailBodyToHtml(body: string, signature: Signature): string {
  const { text, signatureHtml } = splitSignature(body, signature);
  const paragraphs = escapeHtml(text).replace(/\r?\n/g, "<br>");

  const signaturePart = signatureHtml
    ? `<div style="margin-top:16px">${signatureHtml}</div>`
    : "";

  return [
    `<!doctype html><html><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head>`,
    `<body style="margin:0;padding:0"><div style="font-family:${FONT};font-size:14px;line-height:1.5;color:#0a0f1f">`,
    paragraphs,
    signaturePart,
    `</div></body></html>`,
  ].join("");
}
