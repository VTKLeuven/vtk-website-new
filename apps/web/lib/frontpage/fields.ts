/**
 * Field types a front page can expose to the admin.
 *
 * Every front page declares its **own** fields; there is no shared set. That is
 * the whole point of the design: a 24-urenloop page wants a start moment and a
 * lap target, a jobfair page wants a registration link and a company count, and
 * forcing both through one title/subtitle/countdown schema only yields the same
 * page with different words.
 *
 * The admin form is generated from these declarations, so adding a field to a
 * front page is one line in its registry entry; no admin code changes.
 *
 * Values are stored as strings in a JSON column (`Frontpage.values`). An image
 * holds a storage key, a moment holds an ISO timestamp. Strings keep the form,
 * the database and the component reading the same thing, without a type per
 * field creeping into the schema.
 */

export type FieldType = "text" | "textarea" | "image" | "datetime" | "url";

export type FieldDef = {
  type: FieldType;
  labelNl: string;
  labelEn: string;
  /** One line under the input; say what it does, not that it exists. */
  helpNl?: string;
  helpEn?: string;
  /** Shown greyed in the empty input, as an example of what belongs there. */
  placeholder?: string;
  /**
   * Image fields only: the picture that actually appears when nothing is
   * uploaded. Without it the admin shows the striped "no photo" pattern while
   * the site is happily rendering a real background, which is simply a lie
   * about the current state.
   */
  fallbackUrl?: string;
};

export type FieldSchema = Record<string, FieldDef>;

/** What a component receives: every declared field, empty ones as `undefined`. */
export type FieldValues = Record<string, string | undefined>;

/**
 * Reads `Frontpage.values` from the database into a plain record.
 *
 * Anything that is not a non-empty string is dropped, so a component can treat
 * "present" as "actually filled in" and fall back on its own default otherwise.
 * The column is JSON and therefore beyond the reach of the type system; this is
 * the one place that has to be paranoid about it.
 */
export function readFieldValues(raw: unknown, schema: FieldSchema): FieldValues {
  const out: FieldValues = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  const record = raw as Record<string, unknown>;
  for (const name of Object.keys(schema)) {
    const value = record[name];
    if (typeof value === "string" && value.trim() !== "") out[name] = value;
  }
  return out;
}

/** Picks the field for the current language from an `<name>Nl` / `<name>En` pair. */
export function pickField(
  values: FieldValues,
  base: string,
  locale: "nl" | "en",
): string | undefined {
  const nl = values[`${base}Nl`];
  const en = values[`${base}En`];
  // One language filled counts for both: a half-finished override that leaves
  // the other language on a hardcoded default reads as a bug, not as a choice.
  return locale === "nl" ? (nl ?? en) : (en ?? nl);
}
