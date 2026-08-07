/**
 * Leest het loginformulier van Munisense uit de HTML.
 *
 * We sturen elk hidden veld ongewijzigd terug in de POST. Zo hoeven we niet te
 * weten of hun CSRF-veld `csrf_token`, `_token` of iets anders heet, en blijft
 * dit werken als ze het hernoemen. Dezelfde redenering voor de namen van het
 * gebruikersnaam- en wachtwoordveld: die lezen we uit het formulier in plaats
 * van ze te gokken.
 *
 * Bewust met reguliere expressies en zonder HTML-parser als dependency: we
 * zoeken enkel `<input>`-tags in één formulier, geen boomstructuur.
 */

export type LoginForm = {
  /** Alle hidden velden, inclusief het CSRF-token. */
  hidden: Record<string, string>;
  /** Naam van het gebruikersnaamveld (default "username"). */
  userField: string;
  /** Naam van het wachtwoordveld (default "password"). */
  passField: string;
  /** De `action` van het formulier, ruw zoals in de HTML (kan relatief zijn). */
  action: string | null;
};

const DEFAULT_USER_FIELD = "username";
const DEFAULT_PASS_FIELD = "password";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27);/gi, (match) => ENTITIES[match.toLowerCase()] ?? match);
}

/** Attributen van één tag als map met lowercase namen. */
function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/**
 * Het formulier dat een wachtwoordveld bevat. Een loginpagina draagt vaak ook
 * een zoek- of taalformulier; die hidden velden horen niet in onze POST.
 */
function loginFormHtml(html: string): string {
  const pattern = /<form\b[^>]*>([\s\S]*?)<\/form\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    if (/type\s*=\s*["']?password/i.test(match[0])) return match[0];
  }
  return html;
}

export function parseLoginForm(html: string): LoginForm {
  const form = loginFormHtml(html);
  const hidden: Record<string, string> = {};
  let userField = "";
  let passField = "";

  const formAttrs = attributes(form.match(/<form\b[^>]*>/i)?.[0] ?? "");

  for (const tag of form.match(/<input\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const name = attrs.name;
    if (!name) continue;
    const type = (attrs.type ?? "text").toLowerCase();
    if (type === "hidden") {
      hidden[name] = attrs.value ?? "";
      continue;
    }
    if (type === "password" && !passField) {
      passField = name;
      continue;
    }
    // Het eerste tekst/e-mailveld is de gebruikersnaam; een "remember me"
    // checkbox of de submitknop slaan we over.
    if (!userField && (type === "text" || type === "email")) userField = name;
  }

  return {
    hidden,
    userField: userField || DEFAULT_USER_FIELD,
    passField: passField || DEFAULT_PASS_FIELD,
    action: formAttrs.action || null,
  };
}
