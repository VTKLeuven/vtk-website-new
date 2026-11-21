/**
 * Herkent tweetalige veldnamen volgens de conventies in deze codebase:
 * - camelCase: `titleNl`/`titleEn`, `contentMdNl`/`contentMdEn`, `ctaLabelNl`/`ctaLabelEn`
 * - snake_case: `title_nl`/`title_en`
 * - los: `nl`/`en`
 */
export function parseBilingualFieldName(
  name: string,
): { base: string; lang: "nl" | "en" } | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed === "nl" || trimmed === "en") {
    return { base: "", lang: trimmed };
  }
  const camel = /^(.+)(Nl|En)$/.exec(trimmed);
  if (camel) {
    return { base: camel[1], lang: camel[2] === "Nl" ? "nl" : "en" };
  }
  const snake = /^(.+)_(nl|en)$/i.exec(trimmed);
  if (snake) {
    return { base: snake[1], lang: snake[2].toLowerCase() as "nl" | "en" };
  }
  return null;
}
