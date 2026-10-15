import { normalizeKey } from "./names";

/*
 * Welke post hoort bij de naam in een bestand. Puur, zodat de regels getest
 * kunnen worden; de aliassen komen uit `BoPostAlias`.
 */

export type PostCandidate = {
  id: string;
  code: string;
  slug: string;
  nameNl: string;
  nameEn: string;
};

/** Een schrijfwijze die Groep 5 met de hand aan een post hing. */
export type PostAliases = ReadonlyMap<string, string>;

/** Korter dan dit is te vaag om als afkorting te gelden ("IT" moet exact). */
const MIN_PREFIX = 3;

/**
 * De post bij een schrijfwijze, of null wanneer de site het niet weet.
 *
 * Volgorde: een alias van Groep 5 wint altijd, dan een exacte naam, code of
 * slug, en dan een afkorting die van precies één post het begin is ("Acti" is
 * Activiteiten). Twee posten die met hetzelfde beginnen, laten de afkorting
 * open: liever een vraag in "Na te kijken" dan een budget bij de verkeerde post.
 */
export function resolvePost(label: string, posts: readonly PostCandidate[], aliases: PostAliases): string | null {
  const key = normalizeKey(label);
  if (!key) return null;
  const alias = aliases.get(key);
  if (alias) return alias;

  const keysOf = (post: PostCandidate) =>
    [post.code, post.slug, post.nameNl, post.nameEn].map(normalizeKey).filter(Boolean);

  const exact = posts.filter((post) => keysOf(post).includes(key));
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;

  if (key.length < MIN_PREFIX) return null;
  const prefixed = posts.filter((post) => keysOf(post).some((candidate) => candidate.startsWith(key)));
  return prefixed.length === 1 ? prefixed[0].id : null;
}

export type SplitPost = {
  /** De post zoals ze in de naam stond. */
  label: string;
  groupId: string | null;
  activity: string | null;
};

/**
 * Post en activiteit uit de stukken van een naam. Staat er een spatie in plaats
 * van een underscore ("Sport VTKlimmen"), dan is het eerste woord de post zodra
 * dat woord een post is, en schuift de rest naar de activiteit.
 */
export function splitPost(
  post: string,
  activity: string | null,
  posts: readonly PostCandidate[],
  aliases: PostAliases,
): SplitPost {
  const whole = resolvePost(post, posts, aliases);
  if (whole) return { label: post, groupId: whole, activity };

  const words = post.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const first = resolvePost(words[0], posts, aliases);
    if (first) {
      const restOfPost = words.slice(1).join(" ");
      return { label: words[0], groupId: first, activity: activity ? `${restOfPost} ${activity}` : restOfPost };
    }
  }
  return { label: post, groupId: null, activity };
}
