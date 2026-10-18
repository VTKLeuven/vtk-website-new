/**
 * Wat een gesleept bestand mag zijn, los van de browser zodat het te testen is.
 *
 * Een `<input accept="...">` filtert enkel het systeemdialoog; wat je erop sleept,
 * komt ongefilterd binnen. Een sleepzone moet die regel dus zelf toepassen, of
 * een PDF belandt in een fotoveld en de gebruiker hoort pas van de server dat
 * het niet ging.
 */

type NamedFile = { name: string; type: string };

/** Leest `accept` zoals de browser: extensies (`.pdf`), `type/*` en volledige MIME-types. */
export function matchesAccept(file: NamedFile, accept: string | undefined): boolean {
  const tokens = (accept ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

export type DropRejection = "multiple" | "type";

export type DropPick<T> = { ok: true; files: T[] } | { ok: false; reason: DropRejection };

/** Kiest uit een drop wat het veld aanneemt, of zegt waarom het niets aanneemt. */
export function pickDroppedFiles<T extends NamedFile>(
  files: T[],
  { accept, multiple = false }: { accept?: string; multiple?: boolean },
): DropPick<T> {
  if (!multiple && files.length > 1) return { ok: false, reason: "multiple" };
  // Alles of niets: van vijf foto's er stil vier aannemen, laat de vijfde
  // ongemerkt weg.
  if (!files.every((file) => matchesAccept(file, accept))) return { ok: false, reason: "type" };
  return { ok: true, files };
}
